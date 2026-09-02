import fs from 'fs/promises';
import path from 'path';
import { createReadStream, existsSync, lstatSync, realpathSync } from 'fs';
import readline from 'readline';
import logger from '../utils/logger.js';
import { getBackendConfiguration } from '../config/environment.js';

const MUD_DIR = getBackendConfiguration().mud.directory;
const LOG_CATEGORIES = {
  runtime: path.join(MUD_DIR, 'logs/log'),
  player: path.join(MUD_DIR, 'logs/player-log'),
};

const LOG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,254}$/;

export class UnsafeLogPathError extends Error {
  constructor(message = 'Invalid or unsafe log path') {
    super(message);
    this.name = 'UnsafeLogPathError';
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function resolveSafeLogPath(category: string, logName: unknown): string {
  if (
    !(category in LOG_CATEGORIES) ||
    typeof logName !== 'string' ||
    !LOG_NAME_PATTERN.test(logName)
  ) {
    throw new UnsafeLogPathError();
  }

  const root = path.resolve(LOG_CATEGORIES[category as keyof typeof LOG_CATEGORIES]);
  const candidate = path.resolve(root, logName);
  if (!isWithin(root, candidate) || path.dirname(candidate) !== root) {
    throw new UnsafeLogPathError();
  }
  if (!existsSync(root)) {
    throw new UnsafeLogPathError('Log directory does not exist');
  }

  const canonicalRoot = realpathSync.native(root);
  if (existsSync(candidate)) {
    const stat = lstatSync(candidate);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new UnsafeLogPathError('Log path must be a regular file');
    }
    if (!isWithin(canonicalRoot, realpathSync.native(candidate))) {
      throw new UnsafeLogPathError('Log path resolves outside its category');
    }
  }

  return candidate;
}

export interface LogFile {
  name: string;
  category: 'runtime' | 'player';
  size: number;
  lastModified: Date;
}

export interface LogLine {
  lineNumber: number;
  timestamp: Date | null;
  content: string;
  level: 'ERROR' | 'WARNING' | 'DEBUG' | 'INFO';
}

export interface PaginatedLogResult {
  lines: LogLine[];
  totalLines: number;
  totalPages: number;
  currentPage: number;
}

/**
 * List all available log files
 */
export async function listLogs(): Promise<LogFile[]> {
  const logs: LogFile[] = [];

  logger.info('[LogService] MUD_DIR:', MUD_DIR);
  logger.info('[LogService] LOG_CATEGORIES:', LOG_CATEGORIES);

  for (const [category, dirPath] of Object.entries(LOG_CATEGORIES)) {
    try {
      logger.info(`[LogService] Reading ${category} logs from:`, dirPath);
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        let filePath: string;
        try {
          filePath = resolveSafeLogPath(category, file);
        } catch {
          logger.warn(`[LogService] Skipping unsafe log filename in ${category}: ${file}`);
          continue;
        }
        const stats = await fs.stat(filePath);

        // Only include regular files (not directories)
        if (stats.isFile()) {
          logs.push({
            name: file,
            category: category as 'runtime' | 'player',
            size: stats.size,
            lastModified: stats.mtime,
          });
        }
      }
    } catch (error) {
      logger.error(`Error reading log directory ${category}:`, error);
    }
  }

  // Sort by category, then by name
  return logs.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === 'runtime' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Parse timestamp from log line
 * Format: "Tue Nov  4 19:08:18 2025::Message content"
 */
function parseLogTimestamp(line: string): Date | null {
  // Match: Day Mon DD HH:MM:SS YYYY::
  const match = line.match(/^(\w{3})\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})::/);

  if (!match) {
    return null;
  }

  const [, , monthStr, day, hour, minute, second, year] = match;

  const monthMap: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  const month = monthMap[monthStr];
  if (month === undefined) {
    return null;
  }

  return new Date(
    parseInt(year),
    month,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second),
  );
}

/**
 * Detect log level from line content
 */
function detectLogLevel(line: string): 'ERROR' | 'WARNING' | 'DEBUG' | 'INFO' {
  const upperLine = line.toUpperCase();

  if (upperLine.includes('ERROR') || upperLine.includes('FAILED')) {
    return 'ERROR';
  }
  if (upperLine.includes('WARNING') || upperLine.includes('WARN')) {
    return 'WARNING';
  }
  if (upperLine.includes('DEBUG')) {
    return 'DEBUG';
  }

  return 'INFO';
}

/**
 * Read log file with pagination
 */
export async function readLogPaginated(
  category: 'runtime' | 'player',
  logName: string,
  page: number = 1,
  pageSize: number = 100,
  searchText?: string,
  startDate?: Date,
  endDate?: Date,
): Promise<PaginatedLogResult> {
  const logPath = resolveSafeLogPath(category, logName);

  // Verify file exists
  try {
    await fs.access(logPath);
  } catch {
    throw new Error(`Log file not found: ${category}/${logName}`);
  }

  // Read all lines into memory (we need to count and filter)
  const allLines: LogLine[] = [];
  let lineNumber = 1;

  const fileStream = createReadStream(logPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const timestamp = parseLogTimestamp(line);
    const level = detectLogLevel(line);

    // Apply filters
    let include = true;

    // Text search filter
    if (searchText && !line.toLowerCase().includes(searchText.toLowerCase())) {
      include = false;
    }

    // Date range filter
    if (timestamp) {
      if (startDate && timestamp < startDate) {
        include = false;
      }
      if (endDate && timestamp > endDate) {
        include = false;
      }
    }

    if (include) {
      allLines.push({
        lineNumber,
        timestamp,
        content: line,
        level,
      });
    }

    lineNumber++;
  }

  // Calculate pagination
  const totalLines = allLines.length;
  const totalPages = Math.ceil(totalLines / pageSize);
  const validPage = Math.max(1, Math.min(page, totalPages || 1));
  const startIndex = (validPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const paginatedLines = allLines.slice(startIndex, endIndex);

  return {
    lines: paginatedLines,
    totalLines,
    totalPages,
    currentPage: validPage,
  };
}

/**
 * Get the last N lines from a log file (for tailing)
 */
export async function tailLog(
  category: 'runtime' | 'player',
  logName: string,
  lines: number = 100,
): Promise<LogLine[]> {
  const logPath = resolveSafeLogPath(category, logName);

  // Verify file exists
  try {
    await fs.access(logPath);
  } catch {
    throw new Error(`Log file not found: ${category}/${logName}`);
  }

  const allLines: LogLine[] = [];
  let lineNumber = 1;

  const fileStream = createReadStream(logPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const timestamp = parseLogTimestamp(line);
    const level = detectLogLevel(line);

    allLines.push({
      lineNumber,
      timestamp,
      content: line,
      level,
    });

    lineNumber++;
  }

  // Return last N lines
  return allLines.slice(-lines);
}

/**
 * Get the full path to a log file
 */
export function getLogFilePath(category: 'runtime' | 'player', logName: string): string {
  return resolveSafeLogPath(category, logName);
}

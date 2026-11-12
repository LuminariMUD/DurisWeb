import { safeFailureCode } from '../utils/safeFailureCode.js';
import { randomUUID } from 'node:crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';
import { resolveSafeZoneFilePath } from '../utils/safeZonePath.js';
import { getBackendConfiguration } from '../config/environment.js';

const execFileAsync = promisify(execFile);

// Get MUD_DIR from environment
const MUD_DIR = getBackendConfiguration().mud.directory;

// Cache configuration
const CACHE_DIR = path.join(process.cwd(), '.cache');
const COMMITS_CACHE_FILE = path.join(CACHE_DIR, 'git-commits.json');

// Cache file structure
interface CacheFile {
  commits: GitCommit[];
  lastRemoteHash: string;
  generatedAt: string;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: string;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitStatus {
  currentHash: string;
  currentShortHash: string;
  latestRemoteHash: string;
  latestRemoteShortHash: string;
  commitsAhead: number;
  branch: string;
}

/**
 * Execute a git command in the MUD directory
 */
async function gitExec(command: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', MUD_DIR, ...command]);
    return stdout.trim();
  } catch (error) {
    logger.error('Git command failed', { code: safeFailureCode(error) });
    throw error;
  }
}

/**
 * Get the current HEAD commit hash (local deployed version)
 */
export async function getCurrentCommitHash(): Promise<{ full: string; short: string }> {
  const full = await gitExec(['rev-parse', 'HEAD']);
  const short = await gitExec(['rev-parse', '--short', 'HEAD']);
  return { full, short };
}

/**
 * Get the latest remote commit hash (from local cache, does NOT fetch)
 */
export async function getLatestRemoteHash(): Promise<{ full: string; short: string }> {
  const branch = await getCurrentBranch();
  const full = await gitExec(['rev-parse', `origin/${branch}`]);
  const short = await gitExec(['rev-parse', '--short', `origin/${branch}`]);
  return { full, short };
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(): Promise<string> {
  return await gitExec(['rev-parse', '--abbrev-ref', 'HEAD']);
}

/**
 * Count commits ahead (remote has commits not in local)
 */
export async function getCommitsAhead(): Promise<number> {
  const branch = await getCurrentBranch();
  const count = await gitExec(['rev-list', `HEAD..origin/${branch}`, '--count']);
  return parseInt(count, 10) || 0;
}

/**
 * Get deployment status
 */
export async function getGitStatus(): Promise<GitStatus> {
  const branch = await getCurrentBranch();
  const current = await getCurrentCommitHash();
  const remote = await getLatestRemoteHash();
  const commitsAhead = await getCommitsAhead();

  return {
    currentHash: current.full,
    currentShortHash: current.short,
    latestRemoteHash: remote.full,
    latestRemoteShortHash: remote.short,
    commitsAhead,
    branch,
  };
}

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // Ignore if already exists
  }
}

/**
 * Load commits from file cache
 */
async function loadCacheFromFile(): Promise<CacheFile | null> {
  try {
    const data = await fs.readFile(COMMITS_CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Save commits to file cache
 */
async function saveCacheToFile(cache: CacheFile): Promise<void> {
  try {
    await ensureCacheDir();
    await fs.writeFile(COMMITS_CACHE_FILE, JSON.stringify(cache, null, 2));
    logger.info(`Cache saved to ${COMMITS_CACHE_FILE}`);
  } catch (error) {
    logger.error(`Failed to save git cache to ${COMMITS_CACHE_FILE}:`, {
      code: safeFailureCode(error),
    });
  }
}

// Maximum commits to cache (keeps cache generation fast)
const MAX_COMMITS_TO_CACHE = 500;

/**
 * Fetch commits from git (for caching)
 * Limited to MAX_COMMITS_TO_CACHE for performance
 */
async function fetchAllCommits(): Promise<GitCommit[]> {
  const branch = await getCurrentBranch();
  const format = 'COMMIT_START|%H|%h|%an|%ae|%aI|%s';

  // Limit commits to keep cache generation fast (~5 seconds for 500 commits)
  const logOutput = await gitExec([
    'log',
    `origin/${branch}`,
    '-n',
    String(MAX_COMMITS_TO_CACHE),
    `--pretty=format:${format}`,
    '--shortstat',
  ]);
  return parseGitLogWithStats(logOutput);
}

/**
 * Get cached commits from file, or generate if not exists
 * Only regenerates when forceRefresh is true (user clicks Refresh button)
 */
async function getCachedCommits(forceRefresh: boolean = false): Promise<GitCommit[]> {
  // Try file cache first (unless force refresh)
  if (!forceRefresh) {
    const fileCache = await loadCacheFromFile();
    if (fileCache) {
      return fileCache.commits;
    }
  }

  // Fetch from remote and rebuild cache
  try {
    await gitExec(['fetch', 'origin', '--quiet']);
  } catch {
    logger.warn('Failed to fetch from remote');
  }

  const branch = await getCurrentBranch();
  const remoteHash = await gitExec(['rev-parse', `origin/${branch}`]);

  // Fetch all commits
  logger.info('Refreshing git commits cache...');
  const commits = await fetchAllCommits();

  // Save to file cache
  const cache: CacheFile = {
    commits,
    lastRemoteHash: remoteHash,
    generatedAt: new Date().toISOString(),
  };
  await saveCacheToFile(cache);

  logger.info(`Cached ${commits.length} commits to ${COMMITS_CACHE_FILE}`);
  return commits;
}

/**
 * Parse git log output with shortstat into commits
 * Uses format: COMMIT_START|hash|shortHash|author|email|date|message followed by shortstat line
 */
function parseGitLogWithStats(output: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const lines = output.split('\n');

  let currentCommit: Partial<GitCommit> | null = null;

  for (const line of lines) {
    if (line.startsWith('COMMIT_START|')) {
      // Save previous commit if exists
      if (currentCommit && currentCommit.hash) {
        commits.push({
          hash: currentCommit.hash,
          shortHash: currentCommit.shortHash || '',
          author: currentCommit.author || '',
          authorEmail: currentCommit.authorEmail || '',
          date: currentCommit.date || '',
          message: currentCommit.message || '',
          filesChanged: currentCommit.filesChanged || 0,
          insertions: currentCommit.insertions || 0,
          deletions: currentCommit.deletions || 0,
        });
      }

      // Parse new commit line
      const parts = line.substring('COMMIT_START|'.length).split('|');
      if (parts.length >= 6) {
        currentCommit = {
          hash: parts[0],
          shortHash: parts[1],
          author: parts[2],
          authorEmail: parts[3],
          date: parts[4],
          message: parts.slice(5).join('|'),
          filesChanged: 0,
          insertions: 0,
          deletions: 0,
        };
      }
    } else if (currentCommit && line.includes('changed')) {
      // Parse shortstat line: " 5 files changed, 100 insertions(+), 20 deletions(-)"
      const filesMatch = line.match(/(\d+) files? changed/);
      const insertionsMatch = line.match(/(\d+) insertions?\(\+\)/);
      const deletionsMatch = line.match(/(\d+) deletions?\(-\)/);

      currentCommit.filesChanged = filesMatch ? parseInt(filesMatch[1], 10) : 0;
      currentCommit.insertions = insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0;
      currentCommit.deletions = deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0;
    }
  }

  // Don't forget the last commit
  if (currentCommit && currentCommit.hash) {
    commits.push({
      hash: currentCommit.hash,
      shortHash: currentCommit.shortHash || '',
      author: currentCommit.author || '',
      authorEmail: currentCommit.authorEmail || '',
      date: currentCommit.date || '',
      message: currentCommit.message || '',
      filesChanged: currentCommit.filesChanged || 0,
      insertions: currentCommit.insertions || 0,
      deletions: currentCommit.deletions || 0,
    });
  }

  return commits;
}

/**
 * Get paginated list of commits (uses cache)
 */
export async function getCommits(
  page: number = 1,
  limit: number = 50,
  forceRefresh: boolean = false,
): Promise<{
  commits: GitCommit[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  status: GitStatus;
}> {
  // Get all commits from cache
  const allCommits = await getCachedCommits(forceRefresh);

  // Paginate in memory (instant!)
  const skip = (page - 1) * limit;
  const commits = allCommits.slice(skip, skip + limit);
  const total = allCommits.length;

  // Get status
  const status = await getGitStatus();

  return {
    commits,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    status,
  };
}

/**
 * Force refresh the git cache
 */
export async function refreshGitCache(): Promise<void> {
  await getCachedCommits(true);
}

// ========== Zone Builder Git Integration ==========

export interface ZoneGitStatus {
  modified: boolean;
  files: {
    path: string;
    status: 'modified' | 'new' | 'deleted';
  }[];
}

function getZoneGitFiles(areasDir: string, zoneBasename: string): string[] {
  return (['wld', 'mob', 'obj', 'zon'] as const).map((fileType) => {
    resolveSafeZoneFilePath(areasDir, zoneBasename, fileType);
    return `${fileType}/${zoneBasename}.${fileType}`;
  });
}

/**
 * Get git status for a specific zone's files
 * @param zoneBasename - The zone filename without extension (e.g., "alatorin")
 */
export async function getZoneGitStatus(zoneBasename: string): Promise<ZoneGitStatus> {
  const areasDir = path.join(MUD_DIR, 'areas');
  const zoneFiles = getZoneGitFiles(areasDir, zoneBasename);

  const files: ZoneGitStatus['files'] = [];

  // Limit discovery to this zone; porcelain paths are relative to the repository root.
  const statusOutput = await execFileAsync('git', [
    '-C',
    areasDir,
    'status',
    '--porcelain',
    '--untracked-files=all',
    '--no-renames',
    '--',
    ...zoneFiles,
  ]);
  const lines = statusOutput.stdout
    .trimEnd()
    .split('\n')
    .filter((l) => l);

  for (const line of lines) {
    const statusCode = line.substring(0, 2);
    const filePath = line.substring(3).trim();

    // Check if this file belongs to the zone
    if (zoneFiles.some((zf) => filePath === zf || filePath.endsWith(zf))) {
      let status: 'modified' | 'new' | 'deleted' = 'modified';
      if (statusCode.includes('A') || statusCode.includes('?')) {
        status = 'new';
      } else if (statusCode.includes('D')) {
        status = 'deleted';
      }
      files.push({ path: filePath, status });
    }
  }
  return {
    modified: files.length > 0,
    files,
  };
}

export interface ZoneCommitResult {
  success: boolean;
  commitHash?: string;
  error?: string;
}

/**
 * Commit zone files to git
 * @param zoneBasename - The zone filename without extension (e.g., "alatorin")
 * @param message - Commit message
 */
export async function commitZoneFiles(
  zoneBasename: string,
  message: string,
): Promise<ZoneCommitResult> {
  const areasDir = path.join(MUD_DIR, 'areas');
  const zoneFiles = getZoneGitFiles(areasDir, zoneBasename);

  try {
    let directory = areasDir;
    let files = zoneFiles;
    try {
      await execFileAsync('git', ['-C', areasDir, 'rev-parse', '--git-dir']);
    } catch {
      try {
        await execFileAsync('git', ['-C', MUD_DIR, 'rev-parse', '--git-dir']);
      } catch {
        return { success: false, error: 'Git is not initialized in the MUD directory' };
      }
      directory = MUD_DIR;
      files = zoneFiles.map((file) => 'areas/' + file);
    }
    return await commitFilesInDir(directory, files, message);
  } catch (error: unknown) {
    // Builders see only fixed failure text; diagnostics keep an allowlisted code (#176).
    const reference = randomUUID();
    logger.error('Commit zone files failed', { reference, code: safeFailureCode(error) });
    return { success: false, error: `Failed to commit zone files (reference ${reference})` };
  }
}

/**
 * Helper to commit files in a directory
 */
async function commitFilesInDir(
  dir: string,
  files: string[],
  message: string,
): Promise<ZoneCommitResult> {
  const selected: string[] = [];
  for (const file of files) {
    try {
      await fs.access(path.join(dir, file));
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
        throw error;
      // An unstaged deletion still appears in the index. A staged deletion instead
      // appears in the cached diff against HEAD, and must not be passed to git add again.
      try {
        await execFileAsync('git', ['-C', dir, 'ls-files', '--error-unmatch', '--', file]);
      } catch (lookupError) {
        if (
          !lookupError ||
          typeof lookupError !== 'object' ||
          !('code' in lookupError) ||
          lookupError.code !== 1
        )
          throw lookupError;
        const { stdout } = await execFileAsync('git', [
          '-C',
          dir,
          'diff',
          '--cached',
          '--name-only',
          '--diff-filter=D',
          '--',
          file,
        ]);
        if (stdout.trim()) selected.push(file);
        continue;
      }
    }
    await execFileAsync('git', ['-C', dir, 'add', '--all', '--', file]);
    selected.push(file);
  }
  if (!selected.length) return { success: false, error: 'No changes to commit' };
  try {
    await execFileAsync('git', ['-C', dir, 'diff', '--cached', '--quiet', '--', ...selected]);
    return { success: false, error: 'No changes to commit' };
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 1) throw error;
  }
  // --only preserves unrelated staged work, including when the areas directory shares a repo.
  await execFileAsync('git', ['-C', dir, 'commit', '--only', '-m', message, '--', ...selected]);
  const { stdout: hash } = await execFileAsync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD']);
  return { success: true, commitHash: hash.trim() };
}

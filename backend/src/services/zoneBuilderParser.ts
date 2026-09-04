// Zone File Parser for DurisMUD
// Parses .wld, .mob, .obj, .zon files

import * as fs from 'fs/promises';
import * as path from 'path';
import logger from '../utils/logger.js';
import { pool } from '../db/connection.js';
import type { RowDataPacket } from 'mysql2';
import { isHookEnabledSync } from '../hooks/hookGate.js';
import { recordDroppedFlatfileInput } from '../hooks/flatfileHookState.js';
import {
  FlatfileAccessError,
  getMudAreasRoot,
  listMudDirectory,
  mudPathExists,
  readMudTextFile,
  statMudPath,
} from './flatfileAccess.js';
import {
  resolveSafeZoneDirectoryPath,
  resolveSafeZoneFilePath,
  resolveSafeZoneMapPath,
  UnsafeZonePathError,
} from '../utils/safeZonePath.js';
import {
  Room,
  RoomExit,
  ExtraDescription,
  RoomIndex,
  MobIndex,
  ObjIndex,
  Mobile,
  ZoneObject,
  ResetCommand,
  ZoneHeader,
  ZoneData,
  ZoneIndex,
  ZoneMapData,
  DIRECTIONS,
  Direction,
  ResetCommandType,
} from '../types/builder.js';

function assertZoneBuilderParsingEnabled(): void {
  if (!isHookEnabledSync('zone_builder_parsing')) {
    throw new Error('zone_builder_parsing is disabled on the website.');
  }
}

function getAreasDir(): string {
  assertZoneBuilderParsingEnabled();
  return getMudAreasRoot();
}

export class ZoneSourceParseError extends Error {
  constructor(
    readonly sourceType: string,
    readonly sourceName?: string,
  ) {
    super(
      sourceName
        ? `Malformed or truncated ${sourceType} source record in ${sourceName}.`
        : `Malformed or truncated ${sourceType} source record.`,
    );
    this.name = 'ZoneSourceParseError';
  }
}

function rejectZoneSource(sourceType: string): never {
  recordDroppedFlatfileInput('zone_builder_parsing');
  throw new ZoneSourceParseError(sourceType);
}

function safeSourceName(filePath: string): string {
  const basename = path.basename(filePath);
  return /^[A-Za-z0-9._-]{1,128}$/.test(basename)
    ? basename
    : `unknown${path.extname(basename).toLowerCase()}`;
}

function consumeTildeTerminated(
  lines: readonly string[],
  start: number,
  standalone: boolean,
  sourceType: string,
): number {
  for (let index = start; index < lines.length; index += 1) {
    const terminated = standalone ? lines[index].trim() === '~' : hasTildeTerminator(lines[index]);
    if (terminated) {
      return index + 1;
    }
  }
  return rejectZoneSource(sourceType);
}

function hasTildeTerminator(line: string | undefined): boolean {
  return line?.trimEnd().endsWith('~') === true;
}

function removeTildeTerminator(line: string | undefined): string {
  return line?.replace(/~\s*$/, '') ?? '';
}

function isInteger(value: string): boolean {
  return /^-?\d+$/.test(value);
}

function assertIntegerLine(line: string | undefined, minimum: number, sourceType: string): void {
  const values = line?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (values.length < minimum || !values.every(isInteger)) {
    rejectZoneSource(sourceType);
  }
}

function getSourceRecords(content: string, sourceType: string, allowEmpty = false): string[][] {
  const lines = content.split('\n');
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^#\d+$/.test(lines[index])) {
      starts.push(index);
    }
  }
  if (allowEmpty && starts.length === 0 && !content.trim()) {
    return [];
  }
  if (starts.length === 0 || lines.slice(0, starts[0]).some((line) => line.trim())) {
    rejectZoneSource(sourceType);
  }

  const records = starts.map((start, index) =>
    lines.slice(start, starts[index + 1] ?? lines.length),
  );
  const vnums = records.map((record) => record[0]);
  if (new Set(vnums).size !== vnums.length) {
    rejectZoneSource(sourceType);
  }
  return records;
}

function isEndSentinel(record: readonly string[]): boolean {
  return record[0] === '#9999999' && record[1]?.trim() === '$~';
}

function validateWorldSource(content: string): void {
  const sourceType = '.wld';
  for (const record of getSourceRecords(content, sourceType)) {
    if (isEndSentinel(record)) {
      continue;
    }
    let index = consumeTildeTerminated(record, 1, false, sourceType);
    index = consumeTildeTerminated(record, index, true, sourceType);
    assertIntegerLine(record[index], 3, sourceType);
    index += 1;

    let ended = false;
    while (index < record.length) {
      const line = record[index].trim();
      if (!line) {
        index += 1;
        continue;
      }
      if (line === 'S') {
        ended = true;
        index += 1;
        break;
      }
      if (/^D\d+$/.test(line)) {
        const direction = Number(line.slice(1));
        if (direction < 0 || direction > 9) {
          rejectZoneSource(sourceType);
        }
        index = consumeTildeTerminated(record, index + 1, true, sourceType);
        index = consumeTildeTerminated(record, index, false, sourceType);
        assertIntegerLine(record[index], 3, sourceType);
        index += 1;
        continue;
      }
      if (line === 'E') {
        index = consumeTildeTerminated(record, index + 1, false, sourceType);
        index = consumeTildeTerminated(record, index, true, sourceType);
        continue;
      }
      if (line === 'F') {
        assertIntegerLine(record[index + 1], 1, sourceType);
        index += 2;
        continue;
      }
      if (line === 'C' || line === 'M') {
        assertIntegerLine(record[index + 1], 2, sourceType);
        index += 2;
        continue;
      }
      rejectZoneSource(sourceType);
    }
    if (!ended || record.slice(index).some((line) => line.trim())) {
      rejectZoneSource(sourceType);
    }
  }
}

function validateMobileSource(content: string): void {
  const sourceType = '.mob';
  for (const record of getSourceRecords(content, sourceType, true)) {
    if (isEndSentinel(record)) {
      continue;
    }
    let index = consumeTildeTerminated(record, 1, false, sourceType);
    index = consumeTildeTerminated(record, index, false, sourceType);
    index = consumeTildeTerminated(record, index, true, sourceType);
    index = consumeTildeTerminated(record, index, true, sourceType);

    const flagValues = record[index]?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (
      flagValues.length < 5 ||
      flagValues.at(-1) !== 'S' ||
      !flagValues.slice(0, -1).every(isInteger)
    ) {
      rejectZoneSource(sourceType);
    }
    index += 1;

    const speciesValues = record[index]?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (speciesValues.length < 3 || !speciesValues[0] || !speciesValues.slice(1).every(isInteger)) {
      rejectZoneSource(sourceType);
    }
    index += 1;

    const statsValues = record[index]?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (
      statsValues.length < 5 ||
      !statsValues.slice(0, 3).every(isInteger) ||
      !statsValues[3] ||
      !statsValues[4]
    ) {
      rejectZoneSource(sourceType);
    }
    index += 1;

    const goldValues = record[index]?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (
      goldValues.length < 2 ||
      !/^-?\d+(?:\.\d+)*$/.test(goldValues[0]) ||
      !isInteger(goldValues[1])
    ) {
      rejectZoneSource(sourceType);
    }
    index += 1;
    assertIntegerLine(record[index], 3, sourceType);
    index += 1;

    if (record.slice(index).some((line) => line.trim())) {
      rejectZoneSource(sourceType);
    }
  }
}

function validateObjectSource(content: string): void {
  const sourceType = '.obj';
  for (const record of getSourceRecords(content, sourceType, true)) {
    if (isEndSentinel(record)) {
      continue;
    }
    let index = 1;
    for (let field = 0; field < 4; field += 1) {
      index = consumeTildeTerminated(record, index, false, sourceType);
    }
    assertIntegerLine(record[index], 11, sourceType);
    index += 1;
    assertIntegerLine(record[index], 8, sourceType);
    index += 1;
    assertIntegerLine(record[index], 3, sourceType);
    index += 1;

    while (index < record.length) {
      const line = record[index].trim();
      if (!line) {
        index += 1;
        continue;
      }
      if (line === 'A') {
        assertIntegerLine(record[index + 1], 2, sourceType);
        index += 2;
        continue;
      }
      if (line === 'E') {
        index = consumeTildeTerminated(record, index + 1, false, sourceType);
        index = consumeTildeTerminated(record, index, true, sourceType);
        continue;
      }
      if (line === 'X' || line === 'T' || line === 'U') {
        assertIntegerLine(record[index + 1], 1, sourceType);
        index += 2;
        continue;
      }
      rejectZoneSource(sourceType);
    }
  }
}

function validateResetSource(content: string): void {
  const sourceType = '.zon';
  const lines = content.split('\n');
  let index = 0;
  while (index < lines.length && !lines[index].trim()) {
    index += 1;
  }
  if (!/^#\d+$/.test(lines[index] ?? '')) {
    rejectZoneSource(sourceType);
  }
  index = consumeTildeTerminated(lines, index + 1, false, sourceType);
  assertIntegerLine(lines[index], 5, sourceType);
  index += 1;

  let ended = false;
  let legacyMetadataSeen = false;
  let resetSeen = false;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line || line.startsWith('*')) {
      index += 1;
      continue;
    }
    if (line === 'S' || line === '$') {
      ended = true;
      index += 1;
      break;
    }
    const commandPart = line.split('*', 1)[0].trim();
    const values = commandPart.split(/\s+/);
    if (!resetSeen && !legacyMetadataSeen && values.length === 2 && values.every(isInteger)) {
      legacyMetadataSeen = true;
      index += 1;
      continue;
    }
    if (
      !/^[MOGEPDRF]$/.test(values[0] ?? '') ||
      values.length < 5 ||
      !values.slice(1).every(isInteger)
    ) {
      rejectZoneSource(sourceType);
    }
    resetSeen = true;
    index += 1;
  }
  if (!ended || lines.slice(index).some((line) => line.trim() && !line.trim().startsWith('*'))) {
    rejectZoneSource(sourceType);
  }
}

function validateAreaSource(filePath: string, content: string): void {
  const sourceType = path.extname(filePath).toLowerCase();
  try {
    switch (sourceType) {
      case '.wld':
        validateWorldSource(content);
        return;
      case '.mob':
        validateMobileSource(content);
        return;
      case '.obj':
        validateObjectSource(content);
        return;
      case '.zon':
        validateResetSource(content);
        return;
      default:
        return;
    }
  } catch (error) {
    if (error instanceof ZoneSourceParseError) {
      throw new ZoneSourceParseError(sourceType, safeSourceName(filePath));
    }
    throw error;
  }
}

// Cache for zone number to filename mapping
let zoneFileMap: Map<number, string> | null = null;

// Cache for species short code to numeric index mapping (e.g., "PH" -> 1 for Human)
let speciesCodeMap: Map<string, number> | null = null;

// Build mapping of species short code -> numeric index from builder_flags table
async function buildSpeciesCodeMap(): Promise<Map<string, number>> {
  if (speciesCodeMap) return speciesCodeMap;

  const map = new Map<string, number>();

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT value, short_code FROM builder_flags WHERE category = ? AND short_code IS NOT NULL',
      ['mob_race'],
    );

    for (const row of rows) {
      if (row.short_code) {
        map.set(row.short_code.toUpperCase(), row.value);
      }
    }

    logger.info(`Built species code map with ${map.size} entries`);
  } catch (error) {
    logger.error('Failed to build species code map:', error);
  }

  speciesCodeMap = map;
  return map;
}

// Convert species code (e.g., "PH", "UG") to numeric index
async function speciesCodeToIndex(code: string): Promise<number> {
  const map = await buildSpeciesCodeMap();
  const upperCode = code.toUpperCase();

  // First try direct lookup
  if (map.has(upperCode)) {
    return map.get(upperCode)!;
  }

  // If code is already numeric, use it directly
  const numericValue = parseInt(code, 10);
  if (!isNaN(numericValue)) {
    return numericValue;
  }

  // unknown code - return 0 (unknown race)
  return 0;
}

// Build mapping of zone number -> base filename (without extension)
// Zone number comes from line 1 of .zon file (#<number>)
async function buildZoneFileMap(): Promise<Map<number, string>> {
  assertZoneBuilderParsingEnabled();
  if (zoneFileMap) return zoneFileMap;

  const map = new Map<number, string>();
  const zonDir = resolveSafeZoneDirectoryPath(getAreasDir(), 'zon');

  try {
    const files = await listMudDirectory('zone_builder_parsing', zonDir);
    const zonFiles = files.filter((f) => f.endsWith('.zon'));

    for (const file of zonFiles) {
      try {
        const baseName = file.replace('.zon', '');
        const zonPath = resolveSafeZoneFilePath(getAreasDir(), baseName, 'zon');
        const content = await readFile(zonPath);

        // Zone format: Line 1 = #<zone_number>, Line 2 = name~, Line 3 = <top_vnum> <flags...>
        // Zone number comes from line 1 (e.g., #831 means zone 831)
        const lines = content.split('\n');
        if (lines.length < 1) continue;

        const zoneNumberMatch = lines[0].match(/^#(\d+)/);
        if (zoneNumberMatch) {
          const zoneNumber = parseInt(zoneNumberMatch[1], 10);
          map.set(zoneNumber, baseName);
        }
      } catch (error) {
        const rejectedInput =
          error instanceof UnsafeZonePathError ||
          error instanceof ZoneSourceParseError ||
          (error instanceof FlatfileAccessError &&
            ['invalid_content', 'invalid_path', 'too_large'].includes(error.code));
        if (!rejectedInput) {
          throw error;
        }
        if (error instanceof UnsafeZonePathError) {
          recordDroppedFlatfileInput('zone_builder_parsing');
        }
        logger.warn(`Skipped malformed zone source for ${safeSourceName(file)}.`);
      }
    }
  } catch (error) {
    logger.error('Error building zone file map:', error);
    throw error;
  }

  zoneFileMap = map;
  return map;
}

// Get base filename for a zone number
export async function getZoneBaseName(zoneNumber: number): Promise<string | null> {
  const map = await buildZoneFileMap();
  return map.get(zoneNumber) || null;
}

// Invalidate zone file map cache (call when zones are created/deleted)
export function invalidateZoneFileMap(): void {
  zoneFileMap = null;
}

// Helper to read file content (normalizes Windows line endings)
async function readFile(filePath: string): Promise<string> {
  assertZoneBuilderParsingEnabled();
  const content = await readMudTextFile('zone_builder_parsing', filePath, {
    maxBytes: 64 * 1024 * 1024,
  });
  validateAreaSource(filePath, content);
  return content;
}

// Helper to check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  assertZoneBuilderParsingEnabled();
  return mudPathExists('zone_builder_parsing', filePath);
}

interface ZoneIndexCache {
  readonly areasRoot: string;
  readonly zones: ZoneIndex[];
  readonly cachedAt: number;
}

// Zone index cache
let zoneIndexCache: ZoneIndexCache | null = null;
const ZONE_INDEX_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Invalidate every cached zone index regardless of its source root. */
export function invalidateZoneIndexCache(): void {
  zoneIndexCache = null;
}

/** Build the zone index for the currently resolved areas root, reusing only that root's cache. */
async function buildZoneIndex(): Promise<ZoneIndex[]> {
  const areasDir = getAreasDir();
  if (
    zoneIndexCache?.areasRoot === areasDir &&
    Date.now() - zoneIndexCache.cachedAt < ZONE_INDEX_CACHE_TTL
  ) {
    return zoneIndexCache.zones;
  }

  const zonDir = resolveSafeZoneDirectoryPath(areasDir, 'zon');
  const zones: ZoneIndex[] = [];

  try {
    const files = await listMudDirectory('zone_builder_parsing', zonDir);
    const zonFiles = files.filter((f) => f.endsWith('.zon'));

    for (const file of zonFiles) {
      const baseName = file.replace('.zon', '');
      try {
        const zonPath = resolveSafeZoneFilePath(areasDir, baseName, 'zon');
        const wldPath = resolveSafeZoneFilePath(areasDir, baseName, 'wld');
        const mobPath = resolveSafeZoneFilePath(areasDir, baseName, 'mob');
        const objPath = resolveSafeZoneFilePath(areasDir, baseName, 'obj');

        // Skip if no .wld file exists
        if (!(await fileExists(wldPath))) continue;

        // Get zone number and name from .zon file.
        // Format: Line 1 = #<number>, line 2 = name~, line 3 = header values.
        const zonContent = await readFile(zonPath);

        // Parse zone number from line 1 (#<number>).
        const lines = zonContent.split('\n');
        if (lines.length < 3) continue;

        const zoneNumberMatch = lines[0].match(/^#(\d+)/);
        if (!zoneNumberMatch) continue;
        const zoneNumber = parseInt(zoneNumberMatch[1], 10);

        // Parse zone name (line 2, ends with ~).
        const nameMatch = zonContent.match(/^#\d+\s*\n([^~]+)~/m);
        let zoneName = baseName; // Default to filename
        if (nameMatch) {
          zoneName = nameMatch[1].trim();
        }

        // Count rooms.
        const wldContent = await readFile(wldPath);
        const roomCount = (wldContent.match(/^#(?!9999999$)\d+$/gm) || []).length;

        // Count mobs.
        let mobCount = 0;
        if (await fileExists(mobPath)) {
          const mobContent = await readFile(mobPath);
          mobCount = (mobContent.match(/^#(?!9999999$)\d+$/gm) || []).length;
        }

        // Count objects.
        let objCount = 0;
        if (await fileExists(objPath)) {
          const objContent = await readFile(objPath);
          objCount = (objContent.match(/^#(?!9999999$)\d+$/gm) || []).length;
        }

        // Count resets.
        const resetCount = (zonContent.match(/^[MOGEPDRF]\s/gm) || []).length;

        // Get last modified date.
        const stats = await statMudPath('zone_builder_parsing', wldPath);

        zones.push({
          id: baseName, // Unique identifier = filename without extension
          number: zoneNumber,
          name: zoneName,
          roomCount,
          mobCount,
          objCount,
          resetCount,
          lastModified: stats.mtime,
        });
      } catch (error) {
        const rejectedContent =
          error instanceof UnsafeZonePathError ||
          error instanceof ZoneSourceParseError ||
          (error instanceof FlatfileAccessError &&
            ['invalid_content', 'invalid_path', 'too_large'].includes(error.code));
        if (!rejectedContent) {
          throw error;
        }
        if (error instanceof UnsafeZonePathError) {
          recordDroppedFlatfileInput('zone_builder_parsing');
        }
        const sourceName =
          error instanceof ZoneSourceParseError && error.sourceName
            ? error.sourceName
            : safeSourceName(file);
        logger.warn(`Skipped malformed zone source for ${sourceName}.`);
      }
    }

    // Sort by zone number, then by id for zones with same number
    zones.sort((a, b) => {
      if (a.number !== b.number) return a.number - b.number;
      return a.id.localeCompare(b.id);
    });

    zoneIndexCache = { areasRoot: areasDir, zones, cachedAt: Date.now() };

    return zones;
  } catch (error) {
    logger.error('Error building zone index:', error);
    throw error;
  }
}

// List zones with pagination and search
interface ListZonesParams {
  page?: number;
  limit?: number;
  search?: string;
  filterByZoneIds?: string[] | null; // null = no filtering, array = filter to these zone IDs only
}

interface ListZonesResult {
  zones: ZoneIndex[];
  total: number;
  page: number;
  totalPages: number;
  stats: {
    totalZones: number;
    totalRooms: number;
    totalMobs: number;
    totalObjects: number;
  };
}

export async function listZones(params: ListZonesParams = {}): Promise<ListZonesResult> {
  const { page = 1, limit = 10, search = '', filterByZoneIds = null } = params;

  // Get full index (cached)
  const allZones = await buildZoneIndex();

  // Calculate total stats from ALL zones (before any filtering)
  const stats = {
    totalZones: allZones.length,
    totalRooms: allZones.reduce((sum, z) => sum + z.roomCount, 0),
    totalMobs: allZones.reduce((sum, z) => sum + z.mobCount, 0),
    totalObjects: allZones.reduce((sum, z) => sum + z.objCount, 0),
  };

  // Apply zone ID filter (for permission-based access)
  let filteredZones = allZones;
  if (filterByZoneIds !== null) {
    const accessSet = new Set(filterByZoneIds);
    filteredZones = filteredZones.filter((zone) => accessSet.has(zone.id));
  }

  // Apply search filter
  if (search.trim()) {
    const query = search.toLowerCase().trim();
    filteredZones = filteredZones.filter((zone) => {
      const idMatch = zone.id.toLowerCase().includes(query);
      const nameMatch = zone.name
        .toLowerCase()
        .replace(/&\+[a-zA-Z]|&n/g, '')
        .includes(query);
      const numberMatch = zone.number.toString().includes(query);
      return idMatch || nameMatch || numberMatch;
    });
  }

  // Calculate pagination
  const total = filteredZones.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  // Return paginated results with global stats
  return {
    zones: filteredZones.slice(startIndex, endIndex),
    total,
    page,
    totalPages,
    stats,
  };
}

// Parse a single room from .wld content
function parseRoom(content: string, startIndex: number): { room: Room; nextIndex: number } | null {
  const lines = content.slice(startIndex).split('\n');
  let i = 0;

  // Find room number
  while (i < lines.length && !lines[i].match(/^#\d+$/)) {
    i++;
  }
  if (i >= lines.length) return null;

  const vnumMatch = lines[i].match(/^#(\d+)$/);
  if (!vnumMatch) return null;
  const vnum = parseInt(vnumMatch[1], 10);
  if (vnum === 9999999) return null;
  i++;

  // Room name (until ~)
  let name = '';
  while (i < lines.length && !hasTildeTerminator(lines[i])) {
    name += lines[i];
    i++;
  }
  if (i < lines.length) {
    name += removeTildeTerminator(lines[i]);
  }
  name = name.trim();
  i++;

  // Room description (until ~)
  let description = '';
  while (i < lines.length && !lines[i].match(/^~$/)) {
    description += lines[i] + '\n';
    i++;
  }
  description = description.trim();
  i++; // Skip the ~ line

  // Zone number, room flags, sector type
  if (i >= lines.length) return null;
  const flagLine = lines[i].trim().split(/\s+/);
  const zoneNumber = parseInt(flagLine[0], 10) || 0;
  const roomFlags = parseInt(flagLine[1], 10) || 0;
  const sectorType = parseInt(flagLine[2], 10) || 0;
  i++;

  // Parse exits, extras, and optional fields
  const exits: RoomExit[] = [];
  const extras: ExtraDescription[] = [];
  let fallChance: number | undefined;
  let currentSpeed: number | undefined;
  let currentDirection: number | undefined;

  while (i < lines.length) {
    const line = lines[i].trim();

    // End of room
    if (line === 'S') {
      i++;
      break;
    }

    // Direction exit (D0-D9: N, E, S, W, U, D, NE, NW, SE, SW)
    const dirMatch = line.match(/^D(\d+)$/);
    if (dirMatch) {
      const dirIndex = parseInt(dirMatch[1], 10);
      i++;

      // Exit description (until ~)
      let exitDesc = '';
      while (i < lines.length && !lines[i].match(/^~$/)) {
        exitDesc += lines[i] + '\n';
        i++;
      }
      exitDesc = exitDesc.trim();
      i++; // Skip ~

      // Keywords (until ~)
      let keywords = '';
      while (i < lines.length && !hasTildeTerminator(lines[i])) {
        keywords += lines[i];
        i++;
      }
      if (i < lines.length) {
        keywords = removeTildeTerminator(lines[i]).trim();
      }
      i++;

      // Door flag, key, to_room
      const exitFlags = lines[i]?.trim().split(/\s+/) || ['0', '0', '-1'];
      const doorFlag = parseInt(exitFlags[0], 10) || 0;
      const keyVnum = parseInt(exitFlags[1], 10) || 0;
      const toRoom = parseInt(exitFlags[2], 10) || -1;
      i++;

      // Add exits for all 10 directions (0-9)
      if (dirIndex >= 0 && dirIndex <= 9) {
        exits.push({
          direction: DIRECTIONS[dirIndex],
          description: exitDesc,
          keywords,
          doorFlag,
          keyVnum,
          toRoom,
        });
      }
      continue;
    }

    // Extra description
    if (line === 'E') {
      i++;

      // Keywords (until ~)
      let extraKeywords = '';
      while (i < lines.length && !hasTildeTerminator(lines[i])) {
        extraKeywords += lines[i] + ' ';
        i++;
      }
      if (i < lines.length) {
        extraKeywords = removeTildeTerminator(lines[i]).trim();
      }
      i++;

      // Description (until ~)
      let extraDesc = '';
      while (i < lines.length && !lines[i].match(/^~$/)) {
        extraDesc += lines[i] + '\n';
        i++;
      }
      extraDesc = extraDesc.trim();
      i++; // Skip ~

      extras.push({
        keywords: extraKeywords,
        description: extraDesc,
      });
      continue;
    }

    // Fall chance
    if (line === 'F') {
      i++;
      fallChance = parseInt(lines[i]?.trim(), 10) || 0;
      i++;
      continue;
    }

    // Current (for water rooms)
    if (line === 'C') {
      i++;
      const currentLine = lines[i]?.trim().split(/\s+/) || ['0', '0'];
      currentSpeed = parseInt(currentLine[0], 10) || 0;
      currentDirection = parseInt(currentLine[1], 10) || 0;
      i++;
      continue;
    }

    i++;
  }

  // Calculate consumed characters
  const consumedLines = lines.slice(0, i).join('\n').length + 1;

  return {
    room: {
      vnum,
      name,
      description,
      zoneNumber,
      roomFlags,
      sectorType,
      exits,
      extras,
      fallChance,
      currentSpeed,
      currentDirection,
    },
    nextIndex: startIndex + consumedLines,
  };
}

// Parse entire .wld file
export async function parseWldFile(zoneNumber: number): Promise<Room[]> {
  const baseName = await getZoneBaseName(zoneNumber);
  if (!baseName) {
    throw new Error(`Zone ${zoneNumber} not found`);
  }

  const filePath = resolveSafeZoneFilePath(getAreasDir(), baseName, 'wld');
  const content = await readFile(filePath);
  const rooms: Room[] = [];

  let index = 0;
  while (index < content.length) {
    const result = parseRoom(content, index);
    if (!result) break;
    rooms.push(result.room);
    index = result.nextIndex;
  }

  return rooms;
}

// Parse .wld file by zone ID (filename without extension)
async function parseWldFileById(zoneId: string): Promise<Room[]> {
  const filePath = resolveSafeZoneFilePath(getAreasDir(), zoneId, 'wld');

  if (!(await fileExists(filePath))) {
    throw new Error(`Zone "${zoneId}" .wld file not found`);
  }

  const content = await readFile(filePath);
  const rooms: Room[] = [];

  let index = 0;
  while (index < content.length) {
    const result = parseRoom(content, index);
    if (!result) break;
    rooms.push(result.room);
    index = result.nextIndex;
  }

  return rooms;
}

// Get zone map data (Tier 1 - minimal data for map rendering and sidebar listing)
// Get zone map data by zone ID (filename without extension)
export async function getZoneMapData(zoneId: string): Promise<ZoneMapData> {
  const areasDir = getAreasDir();
  const zonPath = resolveSafeZoneFilePath(areasDir, zoneId, 'zon');
  const wldPath = resolveSafeZoneFilePath(areasDir, zoneId, 'wld');

  if (!(await fileExists(wldPath))) {
    throw new Error(`Zone "${zoneId}" not found`);
  }

  // Parse zone number from .zon file (top_vnum / 100)
  let zoneNumber = 0;
  let zoneName = zoneId;

  if (await fileExists(zonPath)) {
    const zonContent = await readFile(zonPath);
    const nameMatch = zonContent.match(/^#\d+\s*\n([^~]+)~/m);
    if (nameMatch) {
      zoneName = nameMatch[1].trim();
    }
    // Get zone number from top_vnum
    const lines = zonContent.split('\n');
    if (lines.length >= 3) {
      const topVnumMatch = lines[2].trim().match(/^(\d+)/);
      if (topVnumMatch) {
        zoneNumber = Math.floor(parseInt(topVnumMatch[1], 10) / 100);
      }
    }
  }

  // Parse rooms, mobs, and objects in parallel
  const [rooms, mobiles, objects] = await Promise.all([
    parseWldFileById(zoneId),
    parseMobFile(zoneId),
    parseObjFile(zoneId),
  ]);

  const roomIndexes: RoomIndex[] = rooms.map((room) => ({
    vnum: room.vnum,
    name: room.name,
    sectorType: room.sectorType,
    exits: Object.fromEntries(
      room.exits.filter((e) => e.toRoom > 0).map((e) => [e.direction, e.toRoom]),
    ) as { [key in Direction]?: number },
  }));

  const mobIndexes: MobIndex[] = mobiles.map((mob) => ({
    vnum: mob.vnum,
    keywords: mob.keywords,
    shortDesc: mob.shortDesc,
    level: mob.level,
  }));

  const objIndexes: ObjIndex[] = objects.map((obj) => ({
    vnum: obj.vnum,
    keywords: obj.keywords,
    shortDesc: obj.shortDesc,
    itemType: obj.itemType,
  }));

  return {
    id: zoneId,
    zoneNumber,
    zoneName,
    rooms: roomIndexes,
    mobs: mobIndexes,
    objects: objIndexes,
  };
}

// Get zone name from .zon file (quick lookup)
export async function getZoneName(zoneId: string): Promise<string> {
  const zonPath = resolveSafeZoneFilePath(getAreasDir(), zoneId, 'zon');

  if (await fileExists(zonPath)) {
    const zonContent = await readFile(zonPath);
    const nameMatch = zonContent.match(/^#\d+\s*\n([^~]+)~/m);
    if (nameMatch) {
      return nameMatch[1].trim();
    }
  }
  return zoneId; // Fallback to zone ID
}

// Get single room data (Tier 3 - full data for editing)
// Get single room data by zone ID (Tier 3 - full data for editing)
export async function getRoomData(zoneId: string, vnum: number): Promise<Room | null> {
  const rooms = await parseWldFileById(zoneId);
  return rooms.find((r) => r.vnum === vnum) || null;
}

// Parse .mob file
// Parse .mob file by zone ID
export async function parseMobFile(zoneId: string): Promise<Mobile[]> {
  const filePath = resolveSafeZoneFilePath(getAreasDir(), zoneId, 'mob');

  if (!(await fileExists(filePath))) {
    return [];
  }

  const content = await readFile(filePath);
  const mobiles: Mobile[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Find mob vnum
    const vnumMatch = lines[i]?.match(/^#(\d+)$/);
    if (!vnumMatch) {
      i++;
      continue;
    }

    const vnum = parseInt(vnumMatch[1], 10);
    if (vnum === 99999 || vnum === 9999999) break; // End marker
    i++;

    // Keywords (until ~)
    let keywords = '';
    while (i < lines.length && !hasTildeTerminator(lines[i])) {
      keywords += lines[i] + ' ';
      i++;
    }
    keywords = removeTildeTerminator(lines[i]).trim();
    i++;

    // Short desc (until ~)
    let shortDesc = '';
    while (i < lines.length && !hasTildeTerminator(lines[i])) {
      shortDesc += lines[i];
      i++;
    }
    shortDesc = removeTildeTerminator(lines[i]).trim();
    i++;

    // Long desc (until ~)
    let longDesc = '';
    while (i < lines.length && !lines[i].match(/^~$/)) {
      longDesc += lines[i] + '\n';
      i++;
    }
    longDesc = longDesc.trim();
    i++;

    // Detailed desc (until ~)
    let detailedDesc = '';
    while (i < lines.length && !lines[i].match(/^~$/)) {
      detailedDesc += lines[i] + '\n';
      i++;
    }
    detailedDesc = detailedDesc.trim();
    i++;

    // Action flags line - format varies by number of arguments:
    // 5 args: actFlags aff1 aff2 alignment S
    // 7 args: actFlags aff1 aff2 aff3 aff4 alignment S
    // 9 args: actFlags aggro aggro2 aff1 aff2 aff3 aff4 alignment S
    // 10 args: actFlags aggro aggro2 aggro3 aff1 aff2 aff3 aff4 alignment S
    const flagLine = lines[i]?.trim().split(/\s+/) || [];
    const numArgs = flagLine.length;
    let actFlags = 0,
      affFlags1 = 0,
      affFlags2 = 0,
      affFlags3 = 0,
      affFlags4 = 0,
      alignment = 0;

    if (numArgs === 5) {
      // actFlags aff1 aff2 alignment S
      actFlags = parseInt(flagLine[0], 10) || 0;
      affFlags1 = parseInt(flagLine[1], 10) || 0;
      affFlags2 = parseInt(flagLine[2], 10) || 0;
      alignment = parseInt(flagLine[3], 10) || 0;
    } else if (numArgs === 7) {
      // actFlags aff1 aff2 aff3 aff4 alignment S
      actFlags = parseInt(flagLine[0], 10) || 0;
      affFlags1 = parseInt(flagLine[1], 10) || 0;
      affFlags2 = parseInt(flagLine[2], 10) || 0;
      affFlags3 = parseInt(flagLine[3], 10) || 0;
      affFlags4 = parseInt(flagLine[4], 10) || 0;
      alignment = parseInt(flagLine[5], 10) || 0;
    } else if (numArgs >= 9) {
      // actFlags aggro aggro2 [aggro3] aff1 aff2 aff3 aff4 alignment S
      // For now, skip aggro flags and get alignment from second-to-last
      actFlags = parseInt(flagLine[0], 10) || 0;
      const sIndex = flagLine.findIndex((v) => v === 'S');
      alignment = sIndex > 0 ? parseInt(flagLine[sIndex - 1], 10) || 0 : 0;
      // Affect flags are before alignment: aff1 aff2 aff3 aff4 alignment S
      if (sIndex >= 5) {
        affFlags4 = parseInt(flagLine[sIndex - 2], 10) || 0;
        affFlags3 = parseInt(flagLine[sIndex - 3], 10) || 0;
        affFlags2 = parseInt(flagLine[sIndex - 4], 10) || 0;
        affFlags1 = parseInt(flagLine[sIndex - 5], 10) || 0;
      }
    } else {
      // Fallback: try to get what we can
      actFlags = parseInt(flagLine[0], 10) || 0;
      affFlags1 = parseInt(flagLine[1], 10) || 0;
      affFlags2 = parseInt(flagLine[2], 10) || 0;
      const sIndex = flagLine.findIndex((v) => v === 'S');
      alignment =
        sIndex > 0 ? parseInt(flagLine[sIndex - 1], 10) || 0 : parseInt(flagLine[3], 10) || 0;
    }
    i++;

    // Species, hometown, class
    // Species can be a 2-char code (e.g., "PH" for Human) or numeric
    const speciesLine = lines[i]?.trim().split(/\s+/) || [];
    const species = await speciesCodeToIndex(speciesLine[0] || '0');
    const hometown = parseInt(speciesLine[1], 10) || 0;
    const mobClass = parseInt(speciesLine[2], 10) || 0;
    i++;

    // Level, thac0, ac, hp dice, dam dice
    const statsLine = lines[i]?.trim().split(/\s+/) || [];
    const level = parseInt(statsLine[0], 10) || 1;
    const thac0 = parseInt(statsLine[1], 10) || 0;
    const ac = parseInt(statsLine[2], 10) || 0;
    const hitDice = statsLine[3] || '1d1+0';
    const damDice = statsLine[4] || '1d1+0';
    i++;

    // Gold, exp
    const goldLine = lines[i]?.trim().split(/\s+/) || [];
    const gold = parseInt(goldLine[0], 10) || 0;
    const exp = parseInt(goldLine[1], 10) || 0;
    i++;

    // Position, default position, sex
    const posLine = lines[i]?.trim().split(/\s+/) || [];
    const position = parseInt(posLine[0], 10) || 8;
    const defaultPosition = parseInt(posLine[1], 10) || 8;
    const sex = parseInt(posLine[2], 10) || 0;
    i++;

    mobiles.push({
      vnum,
      keywords,
      shortDesc,
      longDesc,
      detailedDesc,
      actFlags,
      affFlags1,
      affFlags2,
      affFlags3,
      affFlags4,
      alignment,
      species,
      hometown,
      mobClass,
      level,
      thac0,
      ac,
      hitDice,
      damDice,
      gold,
      exp,
      position,
      defaultPosition,
      sex,
    });
  }

  return mobiles;
}

// Parse .obj file
// Parse .obj file by zone ID
export async function parseObjFile(zoneId: string): Promise<ZoneObject[]> {
  const filePath = resolveSafeZoneFilePath(getAreasDir(), zoneId, 'obj');

  if (!(await fileExists(filePath))) {
    return [];
  }

  const content = await readFile(filePath);
  const objects: ZoneObject[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Find object vnum
    const vnumMatch = lines[i]?.match(/^#(\d+)$/);
    if (!vnumMatch) {
      i++;
      continue;
    }

    const vnum = parseInt(vnumMatch[1], 10);
    if (vnum === 99999 || vnum === 9999999) break; // End marker
    i++;

    // Keywords (until ~)
    let keywords = '';
    while (i < lines.length && !hasTildeTerminator(lines[i])) {
      keywords += lines[i] + ' ';
      i++;
    }
    keywords = removeTildeTerminator(lines[i]).trim();
    i++;

    // Short desc (until ~)
    let shortDesc = '';
    while (i < lines.length && !hasTildeTerminator(lines[i])) {
      shortDesc += lines[i];
      i++;
    }
    shortDesc = removeTildeTerminator(lines[i]).trim();
    i++;

    // Long desc (until ~ - can be on same line or separate line)
    let longDesc = '';
    while (i < lines.length) {
      const line = lines[i];
      if (line === '~' || line.match(/^~$/)) {
        i++;
        break;
      }
      if (hasTildeTerminator(line)) {
        longDesc += removeTildeTerminator(line);
        i++;
        break;
      }
      longDesc += line + '\n';
      i++;
    }
    longDesc = longDesc.trim();

    // Action desc (until ~ - can be on same line or separate line)
    let actionDesc = '';
    while (i < lines.length) {
      const line = lines[i];
      if (line === '~' || line.match(/^~$/)) {
        i++;
        break;
      }
      if (hasTildeTerminator(line)) {
        actionDesc += removeTildeTerminator(line);
        i++;
        break;
      }
      actionDesc += line + '\n';
      i++;
    }
    actionDesc = actionDesc.trim();

    // Type line (11 values):
    // type, material, size(unused), space(unused), craftsmanship, damres(unused),
    // extra_flags, wear_flags, extra2_flags, anti_flags, anti2_flags
    const typeLine = lines[i]?.trim().split(/\s+/) || [];
    const itemType = parseInt(typeLine[0], 10) || 0;
    const material = parseInt(typeLine[1], 10) || 0;
    // typeLine[2] = size (unused)
    // typeLine[3] = space (unused)
    const craftsmanship = parseInt(typeLine[4], 10) || 0;
    // typeLine[5] = damres_bonus (unused)
    const extraFlags = parseInt(typeLine[6], 10) || 0;
    const wearFlags = parseInt(typeLine[7], 10) || 0;
    const extraFlags2 = parseInt(typeLine[8], 10) || 0;
    const antiFlags = parseInt(typeLine[9], 10) || 0;
    const antiFlags2 = parseInt(typeLine[10], 10) || 0;
    i++;

    // Values (8 values)
    const valuesLine = lines[i]?.trim().split(/\s+/) || [];
    const values = valuesLine.slice(0, 8).map((v) => parseInt(v, 10) || 0);
    while (values.length < 8) values.push(0);
    i++;

    // Weight, cost, condition, and optional bitvectors (all on same line)
    // Format: weight cost condition [bitvector1] [bitvector2] [bitvector3] [bitvector4]
    const weightLine = lines[i]?.trim().split(/\s+/) || [];
    const weight = parseInt(weightLine[0], 10) || 0;
    const cost = parseInt(weightLine[1], 10) || 0;
    const condition = parseInt(weightLine[2], 10) || 0;

    // Bitvectors are optional values 3-6 on the same line
    let bitvector: number | undefined;
    let bitvector2: number | undefined;
    let bitvector3: number | undefined;
    let bitvector4: number | undefined;

    if (weightLine.length > 3 && weightLine[3] !== '0') {
      bitvector = parseInt(weightLine[3], 10) || undefined;
    } else if (weightLine.length > 3) {
      // Check if any later bitvectors are non-zero (need to preserve zeros in between)
      const hasLaterBitvectors = weightLine.slice(4).some((v) => v !== '0');
      if (hasLaterBitvectors) {
        bitvector = parseInt(weightLine[3], 10);
      }
    }
    if (weightLine.length > 4 && weightLine[4] !== '0') {
      bitvector2 = parseInt(weightLine[4], 10) || undefined;
    } else if (weightLine.length > 4 && bitvector !== undefined) {
      bitvector2 = parseInt(weightLine[4], 10);
    }
    if (weightLine.length > 5 && weightLine[5] !== '0') {
      bitvector3 = parseInt(weightLine[5], 10) || undefined;
    } else if (weightLine.length > 5 && bitvector2 !== undefined) {
      bitvector3 = parseInt(weightLine[5], 10);
    }
    if (weightLine.length > 6 && weightLine[6] !== '0') {
      bitvector4 = parseInt(weightLine[6], 10) || undefined;
    }
    i++;

    // Parse applies and extras
    // Note: extraFlags2, antiFlags, antiFlags2 already parsed from type line
    // X/T/U lines below can override them (legacy support)
    const applies: { location: number; modifier: number }[] = [];
    const extras: ExtraDescription[] = [];
    let localExtraFlags2 = extraFlags2;
    let localAntiFlags = antiFlags;
    let localAntiFlags2 = antiFlags2;

    while (i < lines.length) {
      const line = lines[i]?.trim();

      // Another object or end
      if (line?.match(/^#\d+$/) || line === '$') {
        break;
      }

      // Apply
      if (line === 'A') {
        i++;
        const applyLine = lines[i]?.trim().split(/\s+/) || [];
        applies.push({
          location: parseInt(applyLine[0], 10) || 0,
          modifier: parseInt(applyLine[1], 10) || 0,
        });
        i++;
        continue;
      }

      // Extra description
      if (line === 'E') {
        i++;
        let extraKeywords = '';
        while (i < lines.length && !hasTildeTerminator(lines[i])) {
          extraKeywords += lines[i] + ' ';
          i++;
        }
        extraKeywords = removeTildeTerminator(lines[i]).trim();
        i++;

        let extraDesc = '';
        while (i < lines.length && !lines[i].match(/^~$/)) {
          extraDesc += lines[i] + '\n';
          i++;
        }
        extraDesc = extraDesc.trim();
        i++;

        extras.push({
          keywords: extraKeywords,
          description: extraDesc,
        });
        // Don't increment i here - continue will go back to while loop which doesn't auto-increment
        continue;
      }

      // Extra flags 2 (legacy override)
      if (line === 'X') {
        i++;
        localExtraFlags2 = parseInt(lines[i]?.trim(), 10) || 0;
        i++;
        continue;
      }

      // Anti flags (legacy override)
      if (line === 'T') {
        i++;
        localAntiFlags = parseInt(lines[i]?.trim(), 10) || 0;
        i++;
        continue;
      }

      // Anti flags 2 (legacy override)
      if (line === 'U') {
        i++;
        localAntiFlags2 = parseInt(lines[i]?.trim(), 10) || 0;
        i++;
        continue;
      }

      // Unknown line, skip it
      i++;
    }

    objects.push({
      vnum,
      keywords,
      shortDesc,
      longDesc,
      actionDesc,
      itemType,
      material,
      craftsmanship,
      extraFlags,
      extraFlags2: localExtraFlags2,
      wearFlags,
      values,
      weight,
      cost,
      condition,
      applies,
      extras,
      antiFlags: localAntiFlags,
      antiFlags2: localAntiFlags2,
      bitvector,
      bitvector2,
      bitvector3,
      bitvector4,
    });
  }

  return objects;
}

// Parse .zon file header and resets by zone ID
// Zone file format:
// #<zone_number>
// <zone_name>~
// <top_vnum> <min_level> <max_level> <lifespan> <reset_mode> <flags>
// * comments
// <reset commands...>
// S or $ (end marker)
export async function parseZonFile(
  zoneId: string,
): Promise<{ header: ZoneHeader; resets: ResetCommand[] }> {
  const filePath = resolveSafeZoneFilePath(getAreasDir(), zoneId, 'zon');

  if (!(await fileExists(filePath))) {
    return {
      header: {
        number: 0,
        name: zoneId,
        builders: '',
        minLevel: 0,
        maxLevel: 0,
        top: 0,
        lifespan: 0,
        resetMode: 0,
      },
      resets: [],
    };
  }

  const content = await readFile(filePath);
  const lines = content.split('\n');
  let i = 0;

  // Skip to zone number
  while (i < lines.length && !lines[i].match(/^#\d+$/)) {
    i++;
  }

  const number = parseInt(lines[i]?.replace('#', ''), 10) || 0;
  i++;

  // Zone name (until ~) - can be on same line or multi-line
  let name = '';
  while (i < lines.length && !hasTildeTerminator(lines[i])) {
    name += lines[i] + ' ';
    i++;
  }
  // The line with ~ contains the end of the name
  if (i < lines.length) {
    name += removeTildeTerminator(lines[i]);
  }
  name = name.trim() || zoneId;
  i++;

  // Next line contains: top_vnum min_level max_level lifespan reset_mode [flags]
  // Format: <top> <min> <max> <lifespan> <reset_mode> <flags>
  const headerLine = lines[i]?.trim().split(/\s+/) || [];
  const top = parseInt(headerLine[0], 10) || 0;
  const minLevel = parseInt(headerLine[1], 10) || 0;
  const maxLevel = parseInt(headerLine[2], 10) || 0;
  const lifespan = parseInt(headerLine[3], 10) || 0;
  const resetMode = parseInt(headerLine[4], 10) || 0;
  i++;

  // Parse reset commands
  const resets: ResetCommand[] = [];
  while (i < lines.length) {
    const line = lines[i]?.trim();

    // End of resets
    if (line === 'S' || line === '$') {
      break;
    }

    // Skip empty lines and comments
    if (!line || line.startsWith('*')) {
      i++;
      continue;
    }

    // Parse reset command
    const parts = line.split(/\s+/);
    const command = parts[0] as ResetCommandType;

    if (['M', 'O', 'G', 'E', 'P', 'D', 'F', 'R'].includes(command)) {
      const ifFlag = parseInt(parts[1], 10) || 0;
      const arg1 = parseInt(parts[2], 10) || 0;
      const arg2 = parseInt(parts[3], 10) || 0;
      const arg3 = parseInt(parts[4], 10) || 0;
      const arg4 = parts[5] ? parseInt(parts[5], 10) : undefined;

      // Extract comment if present (after *)
      const commentIndex = line.indexOf('*');
      const comment = commentIndex >= 0 ? line.slice(commentIndex + 1).trim() : undefined;

      resets.push({
        command,
        ifFlag,
        arg1,
        arg2,
        arg3,
        arg4,
        comment,
      });
    }

    i++;
  }

  return {
    header: {
      number,
      name,
      builders: '', // No builders field in actual zone file format
      minLevel,
      maxLevel,
      top,
      lifespan,
      resetMode,
    },
    resets,
  };
}

// Get complete zone data
// Get complete zone data by zone ID
export async function getZoneData(zoneId: string): Promise<ZoneData> {
  const [rooms, mobiles, objects, zonData] = await Promise.all([
    parseWldFileById(zoneId),
    parseMobFile(zoneId),
    parseObjFile(zoneId),
    parseZonFile(zoneId),
  ]);

  return {
    header: zonData.header,
    rooms,
    mobiles,
    objects,
    resets: zonData.resets,
  };
}

// Get mobile by vnum using zone ID
export async function getMobileData(zoneId: string, vnum: number): Promise<Mobile | null> {
  const mobiles = await parseMobFile(zoneId);
  return mobiles.find((m) => m.vnum === vnum) || null;
}

// Get object by vnum using zone ID
export async function getObjectData(zoneId: string, vnum: number): Promise<ZoneObject | null> {
  const filePath = resolveSafeZoneFilePath(getAreasDir(), zoneId, 'obj');

  if (!(await fileExists(filePath))) {
    return null;
  }

  // Read file and normalize line endings
  const rawContent = await readFile(filePath);
  const content = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = content.split('\n');

  // Find the object with matching vnum
  let i = 0;
  while (i < lines.length) {
    const vnumMatch = lines[i]?.match(/^#(\d+)$/);
    if (!vnumMatch) {
      i++;
      continue;
    }

    const objVnum = parseInt(vnumMatch[1], 10);
    if (objVnum === 99999 || objVnum === 9999999) break;

    if (objVnum !== vnum) {
      i++;
      continue;
    }

    // Found the object, parse it
    i++;

    // Keywords - ends with ~ (can be on same line or multi-line)
    let keywords = '';
    while (i < lines.length) {
      const line = lines[i];
      if (hasTildeTerminator(line)) {
        keywords += removeTildeTerminator(line);
        i++;
        break;
      }
      keywords += line + ' ';
      i++;
    }
    keywords = keywords.trim();

    // Short desc - ends with ~ (can be on same line or multi-line)
    let shortDesc = '';
    while (i < lines.length) {
      const line = lines[i];
      if (hasTildeTerminator(line)) {
        shortDesc += removeTildeTerminator(line);
        i++;
        break;
      }
      shortDesc += line;
      i++;
    }
    shortDesc = shortDesc.trim();

    // Long desc - ends with ~ (can be on same line or multi-line)
    let longDesc = '';
    while (i < lines.length) {
      const line = lines[i];
      if (hasTildeTerminator(line)) {
        longDesc += removeTildeTerminator(line);
        i++;
        break;
      }
      longDesc += line + '\n';
      i++;
    }
    longDesc = longDesc.trim();

    // Action desc - ends with ~ on its own line OR empty ~
    let actionDesc = '';
    while (i < lines.length) {
      const line = lines[i];
      if (line === '~' || line.match(/^~$/)) {
        i++;
        break;
      }
      if (hasTildeTerminator(line)) {
        actionDesc += removeTildeTerminator(line);
        i++;
        break;
      }
      actionDesc += line + '\n';
      i++;
    }
    actionDesc = actionDesc.trim();

    // Item type line (11 values):
    // type, material, (size), (space), craftsmanship, (damres), extra_flags, wear_flags, extra2_flags, anti_flags, anti2_flags
    const typeLine = lines[i]?.trim().split(/\s+/) || [];
    const itemType = parseInt(typeLine[0], 10) || 0;
    const material = parseInt(typeLine[1], 10) || 0;
    // typeLine[2] = size (unused)
    // typeLine[3] = space (unused)
    const craftsmanship = parseInt(typeLine[4], 10) || 0;
    // typeLine[5] = damres_bonus (unused)
    const extraFlags = parseInt(typeLine[6], 10) || 0;
    const wearFlags = parseInt(typeLine[7], 10) || 0;
    const extraFlags2 = parseInt(typeLine[8], 10) || 0;
    const antiFlags = parseInt(typeLine[9], 10) || 0;
    const antiFlags2 = parseInt(typeLine[10], 10) || 0;
    i++;

    // Values line (8 values)
    const valuesLine = lines[i]?.trim().split(/\s+/) || [];
    const values = valuesLine.slice(0, 8).map((v) => parseInt(v, 10) || 0);
    while (values.length < 8) values.push(0);
    i++;

    // Weight, cost, condition, and optional bitvectors (all on same line)
    // Format: weight cost condition [bitvector1] [bitvector2] [bitvector3] [bitvector4]
    const weightLine = lines[i]?.trim().split(/\s+/) || [];
    const weight = parseInt(weightLine[0], 10) || 0;
    const cost = parseInt(weightLine[1], 10) || 0;
    const condition = parseInt(weightLine[2], 10) || 0;

    // Bitvectors are optional values 3-6 on the same line
    let bitvector: number | undefined;
    let bitvector2: number | undefined;
    let bitvector3: number | undefined;
    let bitvector4: number | undefined;

    if (weightLine.length > 3 && weightLine[3] !== '0') {
      bitvector = parseInt(weightLine[3], 10) || undefined;
    } else if (weightLine.length > 3) {
      // Check if any later bitvectors are non-zero (need to preserve zeros in between)
      const hasLaterBitvectors = weightLine.slice(4).some((v) => v !== '0');
      if (hasLaterBitvectors) {
        bitvector = parseInt(weightLine[3], 10);
      }
    }
    if (weightLine.length > 4 && weightLine[4] !== '0') {
      bitvector2 = parseInt(weightLine[4], 10) || undefined;
    } else if (weightLine.length > 4 && bitvector !== undefined) {
      bitvector2 = parseInt(weightLine[4], 10);
    }
    if (weightLine.length > 5 && weightLine[5] !== '0') {
      bitvector3 = parseInt(weightLine[5], 10) || undefined;
    } else if (weightLine.length > 5 && bitvector2 !== undefined) {
      bitvector3 = parseInt(weightLine[5], 10);
    }
    if (weightLine.length > 6 && weightLine[6] !== '0') {
      bitvector4 = parseInt(weightLine[6], 10) || undefined;
    }
    i++;

    // Parse applies and extras (X, T, U can override type line values)
    const applies: { location: number; modifier: number }[] = [];
    const extras: ExtraDescription[] = [];
    let localExtraFlags2 = extraFlags2;
    let localAntiFlags = antiFlags;
    let localAntiFlags2 = antiFlags2;

    while (i < lines.length) {
      const line = lines[i]?.trim();

      if (line?.match(/^#\d+$/) || line === '$') {
        break;
      }

      if (line === 'A') {
        i++;
        const applyLine = lines[i]?.trim().split(/\s+/) || [];
        applies.push({
          location: parseInt(applyLine[0], 10) || 0,
          modifier: parseInt(applyLine[1], 10) || 0,
        });
        i++;
        continue;
      }

      if (line === 'E') {
        i++;
        // Extra keywords - ends with ~
        let extraKeywords = '';
        while (i < lines.length) {
          const eline = lines[i];
          if (hasTildeTerminator(eline)) {
            extraKeywords += removeTildeTerminator(eline);
            i++;
            break;
          }
          extraKeywords += eline + ' ';
          i++;
        }
        extraKeywords = extraKeywords.trim();

        // Extra description - ends with ~ (can be on own line or at end)
        let extraDesc = '';
        while (i < lines.length) {
          const eline = lines[i];
          if (eline === '~' || eline.match(/^~$/)) {
            i++;
            break;
          }
          if (eline.trim() === '~') {
            extraDesc += removeTildeTerminator(eline);
            i++;
            break;
          }
          extraDesc += eline + '\n';
          i++;
        }
        extraDesc = extraDesc.trim();

        extras.push({ keywords: extraKeywords, description: extraDesc });
        continue;
      }

      if (line === 'X') {
        i++;
        localExtraFlags2 = parseInt(lines[i]?.trim(), 10) || 0;
        i++;
        continue;
      }

      if (line === 'T') {
        i++;
        localAntiFlags = parseInt(lines[i]?.trim(), 10) || 0;
        i++;
        continue;
      }

      if (line === 'U') {
        i++;
        localAntiFlags2 = parseInt(lines[i]?.trim(), 10) || 0;
        i++;
        continue;
      }

      i++;
    }

    return {
      vnum,
      keywords,
      shortDesc,
      longDesc,
      actionDesc,
      itemType,
      material,
      craftsmanship,
      extraFlags,
      extraFlags2: localExtraFlags2,
      wearFlags,
      values,
      weight,
      cost,
      condition,
      applies,
      extras,
      antiFlags: localAntiFlags,
      antiFlags2: localAntiFlags2,
      bitvector,
      bitvector2,
      bitvector3,
      bitvector4,
    };
  }

  return null;
}

// ========================================
// Room Position Persistence (for Zone Map)
// ========================================

export interface RoomPosition {
  x: number;
  y: number;
}

export interface ZonePositions {
  zoneId: string; // Unique identifier = filename
  zoneNumber?: number; // Legacy field for compatibility
  positions: Record<number, RoomPosition>;
  lastModified: string;
}

// Ensure map directory exists
async function ensureMapDir(): Promise<void> {
  const safeMapDir = resolveSafeZoneDirectoryPath(getAreasDir(), 'map');
  try {
    await fs.access(safeMapDir);
  } catch {
    await fs.mkdir(safeMapDir, { recursive: true });
  }
}

// Get room positions for a zone by ID
export async function getZonePositions(zoneId: string): Promise<ZonePositions | null> {
  try {
    const filePath = resolveSafeZoneMapPath(getAreasDir(), zoneId);
    if (!(await fileExists(filePath))) {
      return null;
    }
    const content = await readFile(filePath);
    return JSON.parse(content) as ZonePositions;
  } catch (error) {
    logger.error(`Error reading positions for zone ${zoneId}:`, error);
    return null;
  }
}

// Save room positions for a zone by ID
export async function saveZonePositions(
  zoneId: string,
  positions: Record<number, RoomPosition>,
): Promise<void> {
  await ensureMapDir();

  const data: ZonePositions = {
    zoneId,
    positions,
    lastModified: new Date().toISOString(),
  };

  const filePath = resolveSafeZoneMapPath(getAreasDir(), zoneId);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ========================================
// Global Search across all zones
// ========================================

export interface GlobalSearchResult {
  type: 'room' | 'mob' | 'object';
  zoneId: string;
  zoneName: string;
  vnum: number;
  name: string; // room name, mob shortDesc, or object shortDesc
  keywords?: string; // For mobs and objects
  level?: number; // For mobs
  itemType?: number; // For objects
}

export interface GlobalSearchResponse {
  results: GlobalSearchResult[];
  total: number;
  page: number;
  totalPages: number;
}

// Helper to strip ANSI codes for search matching
function stripAnsiForSearch(text: string): string {
  return text.replace(/&[+=-][A-Za-z]|&[nN]/g, '').toLowerCase();
}

async function findMatchingSourceFiles(
  directory: string,
  extension: 'mob' | 'obj' | 'wld',
  query: string,
): Promise<string[]> {
  const files = await listMudDirectory('zone_builder_parsing', directory);
  const compactQuery = query.replace(/\s+/g, '');
  const matches: string[] = [];

  for (const file of files.filter((entry) => entry.endsWith(`.${extension}`))) {
    const filePath = path.join(directory, file);
    try {
      const content = await readFile(filePath);
      const compactContent = stripAnsiForSearch(content).replace(/\s+/g, '');
      if (compactContent.includes(compactQuery)) {
        matches.push(filePath);
      }
    } catch {
      // A rejected source cannot produce a search result.
    }
  }

  return matches;
}

// Global search across all zones through the validated parser boundary.
// MAX_RESULTS limits total results to avoid long processing times
const MAX_SEARCH_RESULTS = 500;

export async function globalSearch(
  query: string,
  type: 'all' | 'room' | 'mob' | 'object' = 'all',
  page: number = 1,
  limit: number = 20,
): Promise<GlobalSearchResponse> {
  const results: GlobalSearchResult[] = [];
  const queryLower = query.toLowerCase().trim();

  // Check if query is a number (VNUM search)
  const queryIsNumber = /^\d+$/.test(queryLower);

  // Get zone index for name lookups
  const allZones = await buildZoneIndex();
  const zoneMap = new Map(allZones.map((z) => [z.id, z]));

  // Resolve contained source directories once, then prefilter through the same
  // bounded read boundary before constructing parser objects.
  const areasDir = getAreasDir();
  const searchDirs = {
    room: resolveSafeZoneDirectoryPath(areasDir, 'wld'),
    mob: resolveSafeZoneDirectoryPath(areasDir, 'mob'),
    object: resolveSafeZoneDirectoryPath(areasDir, 'obj'),
  };

  // Helper to check if we have enough results
  const hasEnoughResults = () => results.length >= MAX_SEARCH_RESULTS;

  if ((type === 'all' || type === 'room') && !hasEnoughResults()) {
    const matchingFiles = await findMatchingSourceFiles(searchDirs.room, 'wld', queryLower);

    for (const filePath of matchingFiles) {
      if (hasEnoughResults()) break;

      const zoneId = path.basename(filePath, '.wld');
      const zone = zoneMap.get(zoneId);
      if (!zone) continue;

      try {
        const rooms = await parseWldFileById(zoneId);
        for (const room of rooms) {
          if (hasEnoughResults()) break;

          const vnumMatch = queryIsNumber && room.vnum.toString().includes(queryLower);
          const nameMatch = !queryIsNumber && stripAnsiForSearch(room.name).includes(queryLower);

          if (vnumMatch || nameMatch) {
            results.push({
              type: 'room',
              zoneId: zone.id,
              zoneName: zone.name,
              vnum: room.vnum,
              name: room.name,
            });
          }
        }
      } catch {
        // Skip zones that fail to parse
      }
    }
  }

  if ((type === 'all' || type === 'mob') && !hasEnoughResults()) {
    const matchingFiles = await findMatchingSourceFiles(searchDirs.mob, 'mob', queryLower);

    for (const filePath of matchingFiles) {
      if (hasEnoughResults()) break;

      const zoneId = path.basename(filePath, '.mob');
      const zone = zoneMap.get(zoneId);
      if (!zone) continue;

      try {
        const mobs = await parseMobFile(zoneId);
        for (const mob of mobs) {
          if (hasEnoughResults()) break;

          const vnumMatch = queryIsNumber && mob.vnum.toString().includes(queryLower);
          const shortDescMatch =
            !queryIsNumber && stripAnsiForSearch(mob.shortDesc).includes(queryLower);
          const keywordsMatch =
            !queryIsNumber && stripAnsiForSearch(mob.keywords).includes(queryLower);

          if (vnumMatch || shortDescMatch || keywordsMatch) {
            results.push({
              type: 'mob',
              zoneId: zone.id,
              zoneName: zone.name,
              vnum: mob.vnum,
              name: mob.shortDesc,
              keywords: mob.keywords,
              level: mob.level,
            });
          }
        }
      } catch {
        // Skip zones that fail to parse
      }
    }
  }

  if ((type === 'all' || type === 'object') && !hasEnoughResults()) {
    const matchingFiles = await findMatchingSourceFiles(searchDirs.object, 'obj', queryLower);

    for (const filePath of matchingFiles) {
      if (hasEnoughResults()) break;

      const zoneId = path.basename(filePath, '.obj');
      const zone = zoneMap.get(zoneId);
      if (!zone) continue;

      try {
        const objects = await parseObjFile(zoneId);
        for (const obj of objects) {
          if (hasEnoughResults()) break;

          const vnumMatch = queryIsNumber && obj.vnum.toString().includes(queryLower);
          const shortDescMatch =
            !queryIsNumber && stripAnsiForSearch(obj.shortDesc).includes(queryLower);
          const keywordsMatch =
            !queryIsNumber && stripAnsiForSearch(obj.keywords).includes(queryLower);

          if (vnumMatch || shortDescMatch || keywordsMatch) {
            results.push({
              type: 'object',
              zoneId: zone.id,
              zoneName: zone.name,
              vnum: obj.vnum,
              name: obj.shortDesc,
              keywords: obj.keywords,
              itemType: obj.itemType,
            });
          }
        }
      } catch {
        // Skip zones that fail to parse
      }
    }
  }

  // Sort results by vnum for consistency
  results.sort((a, b) => a.vnum - b.vnum);

  // Calculate pagination
  const total = results.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  return {
    results: results.slice(startIndex, endIndex),
    total,
    page,
    totalPages,
  };
}

// =============================================================================
// Shop File Parser
// =============================================================================

export interface ShopData {
  keeperVnum: number; // Mob vnum of the shopkeeper
  producedItems: number[]; // Item vnums the shop sells
  buyMultiplier: number; // Price multiplier when buying from shop
  sellMultiplier: number; // Price multiplier when selling to shop
  tradedItemTypes: number[]; // Item types the shop will buy
  roomVnum: number; // Room where the shop is located
}

// Cache for all shops across all zones
let shopDataCache: Map<number, ShopData> | null = null;

// Parse all shop files and build a global shopkeeper map
export async function parseAllShopFiles(): Promise<Map<number, ShopData>> {
  assertZoneBuilderParsingEnabled();
  if (shopDataCache) return shopDataCache;

  const shopMap = new Map<number, ShopData>();
  const shpDir = path.join(getAreasDir(), 'shp');

  try {
    if (!(await fileExists(shpDir))) {
      shopDataCache = shopMap;
      return shopMap;
    }
    const files = await listMudDirectory('zone_builder_parsing', shpDir);
    const shpFiles = files.filter((f) => f.endsWith('.shp'));

    for (const file of shpFiles) {
      const filePath = path.join(shpDir, file);
      try {
        const content = await readFile(filePath);
        const shops = parseShopFileContent(content);
        for (const shop of shops) {
          shopMap.set(shop.keeperVnum, shop);
        }
      } catch {
        // Skip files that fail to parse
        logger.error(`Failed to parse shop file ${safeSourceName(file)}.`);
      }
    }
  } catch (e) {
    logger.error('Error reading shop directory:', e);
  }

  shopDataCache = shopMap;
  return shopMap;
}

// Parse shop file content into ShopData entries
function parseShopFileContent(content: string): ShopData[] {
  const shops: ShopData[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Find shop keeper vnum: #<vnum>~
    const keeperMatch = lines[i]?.match(/^#(\d+)~$/);
    if (!keeperMatch) {
      i++;
      continue;
    }

    const keeperVnum = parseInt(keeperMatch[1], 10);
    i++;

    // Skip format flag (N or O for new/old format)
    if (i < lines.length && (lines[i] === 'N' || lines[i] === 'O')) {
      i++;
    }

    // Read produced items (until 0)
    const producedItems: number[] = [];
    while (i < lines.length) {
      const line = lines[i]?.trim();
      if (!line) {
        i++;
        continue;
      }
      const itemVnum = parseInt(line, 10);
      if (itemVnum === 0) {
        i++;
        break;
      }
      if (!isNaN(itemVnum) && itemVnum > 0) {
        producedItems.push(itemVnum);
      }
      i++;
    }

    // Read buy and sell multipliers
    const buyMultiplier = parseFloat(lines[i]?.trim() || '1.0') || 1.0;
    i++;
    const sellMultiplier = parseFloat(lines[i]?.trim() || '1.0') || 1.0;
    i++;

    // Read traded item types (until 0)
    const tradedItemTypes: number[] = [];
    while (i < lines.length) {
      const line = lines[i]?.trim();
      if (!line) {
        i++;
        continue;
      }
      const itemType = parseInt(line, 10);
      if (itemType === 0) {
        i++;
        break;
      }
      if (!isNaN(itemType)) {
        tradedItemTypes.push(itemType);
      }
      i++;
    }

    // Skip 7 message strings (each ends with ~)
    let messagesSkipped = 0;
    while (i < lines.length && messagesSkipped < 7) {
      if (hasTildeTerminator(lines[i])) {
        messagesSkipped++;
      }
      i++;
    }

    // Skip 2 numbers (temper1, temper2)
    i += 2;

    // Room vnum is next
    const roomVnum = parseInt(lines[i]?.trim() || '0', 10) || 0;
    i++;

    // Skip until we hit X (end of shop entry) or next shop
    while (i < lines.length && lines[i]?.trim() !== 'X' && !lines[i]?.match(/^#\d+~$/)) {
      i++;
    }

    // Skip the X marker
    if (lines[i]?.trim() === 'X') {
      i++;
    }

    shops.push({
      keeperVnum,
      producedItems,
      buyMultiplier,
      sellMultiplier,
      tradedItemTypes,
      roomVnum,
    });
  }

  return shops;
}

// Get shop data for a specific mob vnum
export async function getShopDataByMobVnum(mobVnum: number): Promise<ShopData | null> {
  const shops = await parseAllShopFiles();
  return shops.get(mobVnum) || null;
}

// Invalidate shop cache (call when shop files are modified)
export function invalidateShopCache(): void {
  shopDataCache = null;
}

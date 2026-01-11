import { pool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import { getCache, setCache, mapToObject, objectToMapNumeric, objectToMap } from '../db/redis.js';
import sharp from 'sharp';
import { parseWldFile, parseObjFile, getZonePositions, getZoneBaseName, listZones, parseZonFile, parseMobFile } from './zoneBuilderParser.js';
import type { Room } from '../types/builder.js';
import logger from '../utils/logger.js';
import { EQUIP_SLOTS } from '../types/builder.js';

// exit flag for secret doors (from mud defines.h)
const EX_SECRET = 64; // BIT_7

// Cache TTLs in seconds
const CACHE_TTL = {
  mapTiles: 60 * 60,        // 1 hour - map data rarely changes
  zoneEntrances: 60 * 60,   // 1 hour
  mapBounds: 60 * 60 * 24,  // 24 hours - very static
  continents: 60 * 60 * 24, // 24 hours - very static
  zones: 5 * 60,            // 5 minutes
  objects: 5 * 60,          // 5 minutes
};

// =============================================================================
// Types
// =============================================================================

export interface WikiContinent {
  id: number;
  name: string;
  nameAnsi: string | null;
  seedRoomVnum: number;
  centerX: number | null;
  centerY: number | null;
}

export interface WikiMapTile {
  roomVnum: number;
  x: number;
  y: number;
  z: number;
  sectorType: number;
  zoneNumber: number;
  zoneName: string | null;
  roomName: string | null;
  continentId: number | null;
  isMapRoom: boolean;
}

export interface WikiZoneEntrance {
  id: number;
  fromRoomVnum: number;
  toRoomVnum: number;
  toZoneNumber: number;
  toZoneName: string | null;
  direction: string;
  x: number | null;
  y: number | null;
}

export interface WikiZone {
  number: number;
  name: string;
  nameAnsi?: string;
  minLevel: number;
  maxLevel: number;
  difficulty: number;
  alignment: number;
  epicType: number;
  roomCount: number;
  mobCount: number;
  objectCount: number;
}

export interface WikiZoneDetail extends WikiZone {
  description?: string;
  rooms: WikiRoom[];
}

export interface WikiRoom {
  vnum: number;
  name: string;
  description?: string;
  sectorType: number;
  zoneNumber: number;
  exits: WikiRoomExit[];
}

export interface WikiRoomExit {
  direction: string;
  toRoom: number;
  hasDoor: boolean;
  doorName?: string;
}

export interface WikiObject {
  vnum: number;
  name: string;
  nameAnsi?: string;
  type: number;
  typeName: string;
  level: number;
  weight: number;
  slots: string[];
  affects: WikiObjectAffect[];
  spellEffects: string[];
  zoneNumber: number;  // Zone where this object is defined
}

export interface WikiObjectAffect {
  location: number;
  locationName: string;
  modifier: number;
}

export interface WikiObjectDetail extends WikiObject {
  description?: string;
  values: number[];
  extraFlags: number;
  wearFlags: number;
  extraFlagNames: string[];
  classRestrictions: { className: string; isAllowed: boolean }[];
  raceRestrictions: { raceName: string; isAllowed: boolean }[];
  zoneLocations: { zoneNumber: number; zoneName: string }[];
  roomLoads: { roomVnum: number; roomName: string; zoneNumber: number }[];
  mobDrops: { mobVnum: number; mobName: string; zoneNumber: number }[];
  containerLoads: { containerVnum: number; containerName: string }[];
}

export interface MapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface WikiZoneFilters {
  search?: string;
  alignmentMin?: number;
  alignmentMax?: number;
  difficultyMin?: number;
  difficultyMax?: number;
  epicTypes?: number[];
  minLevel?: number;
  maxLevel?: number;
}

export interface WikiObjectFilters {
  search?: string;
  type?: number;
  excludeTypes?: number[];  // Exclude these object types (e.g., Trash)
  slot?: number;
  minLevel?: number;
  maxLevel?: number;
  affectType?: number;
  zone?: number;  // Filter by zone number
  // Advanced filters - multiple conditions (AND logic)
  affects?: { location: number; minModifier?: number }[];  // e.g., [{location: 19, minModifier: 5}] for +5 damroll
  spellEffects?: string[];  // e.g., ['Detect Invisible', 'Sense Life']
  allowedClass?: number;  // class bit value - filter items usable by this class
  allowedRace?: number;   // race id - filter items usable by this race
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// =============================================================================
// Row Types
// =============================================================================

interface ContinentRow extends RowDataPacket {
  id: number;
  name: string;
  name_ansi: string | null;
  seed_room_vnum: number;
  center_x: number | null;
  center_y: number | null;
}

interface MapTileRow extends RowDataPacket {
  room_vnum: number;
  x_coord: number;
  y_coord: number;
  z_coord: number;
  sector_type: number;
  zone_number: number;
  zone_name: string | null;
  room_name: string | null;
  continent_id: number | null;
  is_map_room: number;
}

interface ZoneEntranceRow extends RowDataPacket {
  id: number;
  from_room_vnum: number;
  to_room_vnum: number;
  to_zone_number: number;
  to_zone_name: string | null;
  direction: string;
  x_coord: number | null;
  y_coord: number | null;
}

interface ZoneRow extends RowDataPacket {
  number: number;
  name: string;
  epic_type: number;
  alignment: number;
  difficulty: number;
  room_count?: number;
  mob_count?: number;
  object_count?: number;
}

// row types for wiki objects/mobs queries
interface WikiObjectRow extends RowDataPacket {
  vnum: number;
  name: string;
  name_ansi: string | null;
  type: number;
  level: number;
  weight: number;
  extra_flags: number;
  wear_flags: number;
  zone_number: number;
  obj_values: string | null;
  description: string | null;
  slot_ids: string | null;      // GROUP_CONCAT result
  affect_data: string | null;   // JSON_ARRAYAGG result
  spell_effects: string | null; // GROUP_CONCAT result
}

interface WikiMobRow extends RowDataPacket {
  zone_number: number;
  vnum: number;
  name: string;
  name_ansi: string | null;
  keywords: string | null;
  level: number;
  alignment: number;
  mob_class: number;
  species: number;
  gold: number;
  exp: number;
  act_flags: number;
  hit_dice: string | null;
  dam_dice: string | null;
  ac: number;
  thac0: number;
  long_desc: string | null;
  detailed_desc: string | null;
  zone_name: string | null;
}

// =============================================================================
// Wiki Settings
// =============================================================================

export async function getWikiAccessLevel(): Promise<'public' | 'registered'> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT value FROM wiki_settings WHERE `key` = 'access_level'"
  );

  if (rows.length > 0 && rows[0].value === 'registered') {
    return 'registered';
  }

  return 'public';
}

export async function setWikiAccessLevel(level: 'public' | 'registered'): Promise<void> {
  await pool.query(
    "UPDATE wiki_settings SET value = ?, updated_at = NOW() WHERE `key` = 'access_level'",
    [level]
  );
}

export async function getRealtimeEnabled(): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT value FROM wiki_settings WHERE `key` = 'realtime_enabled'"
  );

  return rows.length > 0 && rows[0].value === 'true';
}

// =============================================================================
// Continents
// =============================================================================

export async function getContinents(): Promise<WikiContinent[]> {
  const cacheKey = 'wiki:continents';

  // Try cache first
  const cached = await getCache<WikiContinent[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const [rows] = await pool.query<ContinentRow[]>(
    `SELECT id, name, name_ansi, seed_room_vnum, center_x, center_y
     FROM wiki_continents
     ORDER BY id`
  );

  const result = rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameAnsi: row.name_ansi,
    seedRoomVnum: row.seed_room_vnum,
    centerX: row.center_x,
    centerY: row.center_y,
  }));

  // Cache the result
  await setCache(cacheKey, result, CACHE_TTL.continents);

  return result;
}

// =============================================================================
// Map Tiles
// =============================================================================

const MAX_TILES_PER_REQUEST = 10000;

export async function getMapTiles(bounds: MapBounds, zLevel: number = 0): Promise<WikiMapTile[]> {
  // Validate bounds to prevent excessive data requests
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const area = width * height;

  if (area > MAX_TILES_PER_REQUEST) {
    throw new Error(`Requested area too large (${area} tiles). Maximum is ${MAX_TILES_PER_REQUEST}. Zoom in or reduce viewport.`);
  }

  if (width <= 0 || height <= 0) {
    throw new Error('Invalid bounds: width and height must be positive');
  }

  // Cache key based on bounds and layer
  const cacheKey = `wiki:tiles:${bounds.minX}:${bounds.maxX}:${bounds.minY}:${bounds.maxY}:${zLevel}`;

  // Try cache first
  const cached = await getCache<WikiMapTile[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const [rows] = await pool.query<MapTileRow[]>(
    `SELECT room_vnum, x_coord, y_coord, z_coord, sector_type, zone_number, zone_name, room_name, continent_id, is_map_room
     FROM wiki_map_positions
     WHERE x_coord >= ? AND x_coord <= ? AND y_coord >= ? AND y_coord <= ? AND z_coord = ?
     ORDER BY y_coord, x_coord`,
    [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, zLevel]
  );

  const result = rows.map((row) => ({
    roomVnum: row.room_vnum,
    x: row.x_coord,
    y: row.y_coord,
    z: row.z_coord,
    sectorType: row.sector_type,
    zoneNumber: row.zone_number,
    zoneName: row.zone_name,
    roomName: row.room_name,
    continentId: row.continent_id,
    isMapRoom: Boolean(row.is_map_room),
  }));

  // Cache the result
  await setCache(cacheKey, result, CACHE_TTL.mapTiles);

  return result;
}

export async function getZoneEntrances(bounds: MapBounds, zLevel: number = 0): Promise<WikiZoneEntrance[]> {
  // Cache key based on bounds and layer
  const cacheKey = `wiki:entrances:${bounds.minX}:${bounds.maxX}:${bounds.minY}:${bounds.maxY}:${zLevel}`;

  // Try cache first
  const cached = await getCache<WikiZoneEntrance[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // Join with zones table to get zone names, and filter out map-internal zones (5000, 6600-6899, 7000 series)
  // These are the map coordinate zones themselves, not playable zones
  // Also join with wiki_map_positions to filter by z_coord (layer)
  const [rows] = await pool.query<ZoneEntranceRow[]>(
    `SELECT wze.id, wze.from_room_vnum, wze.to_room_vnum, wze.to_zone_number,
            COALESCE(z.name, wze.to_zone_name) as to_zone_name,
            wze.direction, wze.x_coord, wze.y_coord
     FROM wiki_zone_entrances wze
     LEFT JOIN zones z ON wze.to_zone_number = z.number
     INNER JOIN wiki_map_positions wmp ON wze.from_room_vnum = wmp.room_vnum
     WHERE wze.x_coord >= ? AND wze.x_coord <= ? AND wze.y_coord >= ? AND wze.y_coord <= ?
       AND wmp.z_coord = ?
       AND wze.to_zone_number NOT IN (5000, 7000)
       AND wze.to_zone_number NOT BETWEEN 6600 AND 6899
     ORDER BY wze.y_coord, wze.x_coord`,
    [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, zLevel]
  );

  const result = rows.map((row) => ({
    id: row.id,
    fromRoomVnum: row.from_room_vnum,
    toRoomVnum: row.to_room_vnum,
    toZoneNumber: row.to_zone_number,
    toZoneName: row.to_zone_name,
    direction: row.direction,
    x: row.x_coord,
    y: row.y_coord,
  }));

  // Cache the result
  await setCache(cacheKey, result, CACHE_TTL.zoneEntrances);

  return result;
}

export async function getMapBounds(layer?: number): Promise<{ minX: number; maxX: number; minY: number; maxY: number }> {
  const cacheKey = layer !== undefined ? `wiki:mapBounds:${layer}` : 'wiki:mapBounds';

  // Try cache first
  const cached = await getCache<{ minX: number; maxX: number; minY: number; maxY: number }>(cacheKey);
  if (cached) {
    return cached;
  }

  let query = `SELECT MIN(x_coord) as minX, MAX(x_coord) as maxX, MIN(y_coord) as minY, MAX(y_coord) as maxY
     FROM wiki_map_positions`;
  const params: number[] = [];

  if (layer !== undefined) {
    query += ' WHERE z_coord = ?';
    params.push(layer);
  }

  const [rows] = await pool.query<RowDataPacket[]>(query, params);

  if (rows.length === 0 || rows[0].minX === null) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  const result = {
    minX: rows[0].minX || 0,
    maxX: rows[0].maxX || 0,
    minY: rows[0].minY || 0,
    maxY: rows[0].maxY || 0,
  };

  // Cache the result
  await setCache(cacheKey, result, CACHE_TTL.mapBounds);

  return result;
}

// =============================================================================
// Zones
// =============================================================================

export async function getZones(
  filters: WikiZoneFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20, sortBy: 'number', sortOrder: 'asc' }
): Promise<{ zones: WikiZone[]; total: number; page: number; limit: number; totalPages: number }> {
  const { page, limit, sortBy = 'number', sortOrder = 'asc' } = pagination;
  const offset = (page - 1) * limit;

  // Build WHERE clause
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.search) {
    // Strip ANSI codes from name for search
    conditions.push("(REGEXP_REPLACE(name, '&\\\\+[a-zA-Z]|&n', '') LIKE ? OR number LIKE ?)");
    const searchPattern = `%${filters.search}%`;
    params.push(searchPattern, searchPattern);
  }

  if (filters.alignmentMin !== undefined) {
    conditions.push('alignment >= ?');
    params.push(filters.alignmentMin);
  }

  if (filters.alignmentMax !== undefined) {
    conditions.push('alignment <= ?');
    params.push(filters.alignmentMax);
  }

  if (filters.difficultyMin !== undefined) {
    conditions.push('difficulty >= ?');
    params.push(filters.difficultyMin);
  }

  if (filters.difficultyMax !== undefined) {
    conditions.push('difficulty <= ?');
    params.push(filters.difficultyMax);
  }

  if (filters.epicTypes && filters.epicTypes.length > 0) {
    conditions.push(`epic_type IN (${filters.epicTypes.map(() => '?').join(',')})`);
    params.push(...filters.epicTypes);
  }

  // Level filters would need zone-level data which requires parsing or a different table
  // For now, we'll skip these as we'd need to add level columns to zones table

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate sortBy to prevent SQL injection
  const allowedSortColumns = ['number', 'name', 'epic_type', 'alignment', 'difficulty'];
  const validSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'number';
  const validSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC';

  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM zones ${whereClause}`;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
  const total = countRows[0].total as number;

  // Get paginated zones (room counts would need flatfile parsing, skip for list view)
  const query = `
    SELECT z.number, z.name, z.epic_type, z.alignment, z.difficulty
    FROM zones z
    ${whereClause}
    ORDER BY ${validSortBy} ${validSortOrder}
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query<ZoneRow[]>(query, [...params, limit, offset]);

  const zones: WikiZone[] = rows.map((row) => ({
    number: row.number,
    name: row.name,
    minLevel: 0, // Would need to calculate from zone data
    maxLevel: 0, // Would need to calculate from zone data
    difficulty: row.difficulty,
    alignment: row.alignment,
    epicType: row.epic_type,
    roomCount: 0, // Counts require flatfile parsing, shown on detail page
    mobCount: 0,
    objectCount: 0,
  }));

  return {
    zones,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get simple zone list for dropdowns (no pagination, minimal data)
 */
export async function searchZones(query: string, limit: number = 20, offset: number = 0): Promise<{ zones: { number: number; name: string }[]; hasMore: boolean }> {
  // If no query, return zones ordered by number with pagination
  if (!query) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT number, name FROM zones ORDER BY number LIMIT ? OFFSET ?`,
      [limit + 1, offset]  // Fetch one extra to check if there's more
    );
    const hasMore = rows.length > limit;
    const zones = rows.slice(0, limit).map((row) => ({
      number: row.number,
      name: row.name,
    }));
    return { zones, hasMore };
  }

  // Strip ANSI codes from query for matching
  const cleanQuery = query.replace(/&[+\-=][a-zA-Z]/g, '').replace(/&n/g, '');

  // Search zones - match by number or name (with ANSI stripped for comparison)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT number, name FROM zones
     WHERE CAST(number AS CHAR) LIKE ?
        OR REPLACE(REPLACE(REPLACE(name, '&+', ''), '&-', ''), '&n', '') LIKE ?
     ORDER BY number
     LIMIT ? OFFSET ?`,
    [`${cleanQuery}%`, `%${cleanQuery}%`, limit + 1, offset]
  );

  const hasMore = rows.length > limit;
  const zones = rows.slice(0, limit).map((row) => ({
    number: row.number,
    name: row.name,
  }));
  return { zones, hasMore };
}

export async function getZoneByNumber(zoneNumber: number): Promise<WikiZoneDetail | null> {
  // Get zone info from database
  const [zoneRows] = await pool.query<ZoneRow[]>(
    `SELECT z.number, z.name, z.epic_type, z.alignment, z.difficulty
     FROM zones z
     WHERE z.number = ?`,
    [zoneNumber]
  );

  if (zoneRows.length === 0) {
    return null;
  }

  const zone = zoneRows[0];

  // Get zone base name for parsing files
  const zoneBaseName = await getZoneBaseName(zoneNumber);

  // Parse rooms from the .wld flatfile
  let parsedRooms: Room[] = [];
  try {
    parsedRooms = await parseWldFile(zoneNumber);
  } catch {
    // Zone file not found, return zone info without rooms
  }

  // Parse mob and object counts from flatfiles
  let mobCount = 0;
  let objectCount = 0;

  if (zoneBaseName) {
    try {
      const { parseMobFile, parseObjFile } = await import('./zoneBuilderParser.js');
      const [mobs, objects] = await Promise.all([
        parseMobFile(zoneBaseName).catch(() => []),
        parseObjFile(zoneBaseName).catch(() => []),
      ]);
      mobCount = mobs.length;
      objectCount = objects.length;
    } catch {
      // Files not found or parse error, counts stay 0
    }
  }

  // Convert parsed rooms to WikiRoom format
  const rooms: WikiRoom[] = parsedRooms.map((room) => ({
    vnum: room.vnum,
    name: room.name,
    description: room.description,
    sectorType: room.sectorType,
    zoneNumber: room.zoneNumber,
    exits: room.exits.map((exit) => ({
      direction: exit.direction,
      toRoom: exit.toRoom,
      hasDoor: exit.doorFlag > 0,
      doorName: exit.keywords || undefined,
    })),
  }));

  return {
    number: zone.number,
    name: zone.name,
    minLevel: 0,
    maxLevel: 0,
    difficulty: zone.difficulty,
    alignment: zone.alignment,
    epicType: zone.epic_type,
    roomCount: rooms.length,
    mobCount,
    objectCount,
    rooms,
  };
}

export async function getZoneMapData(zoneNumber: number): Promise<{
  nodes: { id: number; name: string; sectorType: number; x?: number; y?: number }[];
  edges: { from: number; to: number; direction: string }[];
}> {
  // Parse rooms from the .wld flatfile
  const rooms = await parseWldFile(zoneNumber);

  // Get the zone base name (file name without extension)
  const zoneBaseName = await getZoneBaseName(zoneNumber);

  // Try to get saved positions from the map file
  let positions: Record<number, { x: number; y: number }> = {};
  if (zoneBaseName) {
    try {
      const zonePositions = await getZonePositions(zoneBaseName);
      if (zonePositions) {
        positions = zonePositions.positions;
      }
    } catch {
      // No positions saved, will use auto-layout
    }
  }

  // Build nodes with positions
  const nodes = rooms.map((room) => ({
    id: room.vnum,
    name: room.name,
    sectorType: room.sectorType,
    x: positions[room.vnum]?.x,
    y: positions[room.vnum]?.y,
  }));

  // Build edges from room exits (excluding secret exits)
  const edges: { from: number; to: number; direction: string }[] = [];
  for (const room of rooms) {
    for (const exit of room.exits) {
      // skip secret exits - they shouldn't be visible on the map
      if (exit.doorFlag & EX_SECRET) {
        continue;
      }
      edges.push({
        from: room.vnum,
        to: exit.toRoom,
        direction: exit.direction,
      });
    }
  }

  return { nodes, edges };
}

// =============================================================================
// Objects
// =============================================================================

// Object type names mapping
const OBJECT_TYPE_NAMES: Record<number, string> = {
  0: 'Undefined',
  1: 'Light',
  2: 'Scroll',
  3: 'Wand',
  4: 'Staff',
  5: 'Weapon',
  6: 'Fire Weapon',
  7: 'Missile',
  8: 'Treasure',
  9: 'Armor',
  10: 'Potion',
  11: 'Worn',
  12: 'Other',
  13: 'Trash',
  14: 'Trap',
  15: 'Container',
  16: 'Note',
  17: 'Drink Container',
  18: 'Key',
  19: 'Food',
  20: 'Money',
  21: 'Pen',
  22: 'Boat',
  23: 'Audio',
  24: 'Board',
  25: 'Tree',
  26: 'Rock',
  27: 'Quiver',
  28: 'Bow',
  29: 'Sling',
  30: 'Crossbow',
  31: 'Bolt',
  32: 'Arrow',
  33: 'Hand Xbow',
  34: 'Stone',
  35: 'Dart',
  36: 'Throwing',
  37: 'Spellbag',
  38: 'Totem',
  39: 'Component',
  40: 'Comp Container',
  41: 'Portal',
  42: 'Instrument',
  43: 'Keyring',
};

// Extra flags names (BIT_1 to BIT_32)
const EXTRA_FLAG_NAMES: Record<number, string> = {
  1: 'Glow',
  2: 'No Show',
  4: 'Buried',
  8: 'No Sell',
  16: 'Thrown Ranged',
  32: 'Invisible',
  64: 'Non-Repairable',
  128: 'No Drop',
  256: 'Auto-Returning',
  512: 'Allowed Races',
  1024: 'Allowed Classes',
  2048: 'Generic Proc',
  4096: 'Secret',
  8192: 'Floats',
  16384: 'No Reset',
  32768: 'No Locate',
  65536: 'No Identify',
  131072: 'No Summon',
  262144: 'Lit',
  524288: 'Transient',
  1048576: 'No Sleep',
  2097152: 'No Charm',
  4194304: 'Two-Handed',
  8388608: 'No Rent',
  16777216: 'Thrown Close',
  33554432: 'Hum',
  67108864: 'Levitates',
  134217728: 'Ignore Item',
  268435456: 'Artifact',
  536870912: 'Whole Body',
  1073741824: 'Whole Head',
  2147483648: 'Was Encrusted',
};

// Extra2 flags names
const EXTRA2_FLAG_NAMES: Record<number, string> = {
  1: 'Silver',
  2: 'Blessed',
  4: 'Slaying Good',
  8: 'Slaying Evil',
  16: 'Slaying Undead',
  32: 'Slaying Living',
  64: 'Magic',
  128: 'Linkable',
  256: 'Ignore Proc',
  512: 'Ignore Timer',
  1024: 'Not Lootable',
  2048: 'Crumble Loot',
  4096: 'Store Item',
  8192: 'Soul Bound',
  16384: 'Crafted',
  32768: 'Quest Item',
  65536: 'Transparent',
};

// parse extra flags bitvector into names
function parseExtraFlags(extraFlags: number, extraFlags2: number = 0): string[] {
  const names: string[] = [];
  for (const [bit, name] of Object.entries(EXTRA_FLAG_NAMES)) {
    if (extraFlags & parseInt(bit)) {
      // skip internal flags that users don't care about
      if (!['No Show', 'Buried', 'Generic Proc', 'No Reset', 'Ignore Item', 'Was Encrusted', 'Allowed Races', 'Allowed Classes'].includes(name)) {
        names.push(name);
      }
    }
  }
  for (const [bit, name] of Object.entries(EXTRA2_FLAG_NAMES)) {
    if (extraFlags2 & parseInt(bit)) {
      // skip internal flags
      if (!['Ignore Proc', 'Ignore Timer', 'Store Item'].includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}

// Wear slot names mapping (from DurisMUD defines.h BIT_X values)
// Note: BIT_1 = 1 (ITEM_TAKE), not a wear slot
const WEAR_SLOT_NAMES: Record<number, string> = {
  // 1: ITEM_TAKE - not a wear slot
  2: 'finger',      // BIT_2 = ITEM_WEAR_FINGER
  4: 'neck',        // BIT_3 = ITEM_WEAR_NECK
  8: 'body',        // BIT_4 = ITEM_WEAR_BODY
  16: 'head',       // BIT_5 = ITEM_WEAR_HEAD
  32: 'legs',       // BIT_6 = ITEM_WEAR_LEGS
  64: 'feet',       // BIT_7 = ITEM_WEAR_FEET
  128: 'hands',     // BIT_8 = ITEM_WEAR_HANDS
  256: 'arms',      // BIT_9 = ITEM_WEAR_ARMS
  512: 'shield',    // BIT_10 = ITEM_WEAR_SHIELD
  1024: 'about',    // BIT_11 = ITEM_WEAR_ABOUT
  2048: 'waist',    // BIT_12 = ITEM_WEAR_WAIST
  4096: 'wrist',    // BIT_13 = ITEM_WEAR_WRIST
  8192: 'wield',    // BIT_14 = ITEM_WIELD
  16384: 'hold',    // BIT_15 = ITEM_HOLD
  32768: 'throw',   // BIT_16 = ITEM_THROW
  65536: 'light',   // BIT_17 = ITEM_LIGHT_SOURCE
  131072: 'eyes',   // BIT_18 = ITEM_WEAR_EYES
  262144: 'face',   // BIT_19 = ITEM_WEAR_FACE
  524288: 'ear',    // BIT_20 = ITEM_WEAR_EARRING
};

// slot_id (sequential) to name - matches import script mapping
const SLOT_ID_NAMES: Record<number, string> = {
  1: 'finger', 2: 'neck', 3: 'body', 4: 'head', 5: 'legs',
  6: 'feet', 7: 'hands', 8: 'arms', 9: 'shield', 10: 'about',
  11: 'waist', 12: 'wrist', 13: 'wield', 14: 'hold', 15: 'throw',
  16: 'light', 17: 'eyes', 18: 'face', 19: 'ear', 20: 'quiver',
  21: 'insignia', 22: 'back', 23: 'belt', 24: 'horse body',
  25: 'tail', 26: 'nose', 27: 'horn', 28: 'ioun', 29: 'spider body',
};

// Affect location names (APPLY_* from MUD)
const AFFECT_LOCATION_NAMES: Record<number, string> = {
  0: 'None',
  1: 'STR',
  2: 'DEX',
  3: 'INT',
  4: 'WIS',
  5: 'CON',
  6: 'SEX',
  7: 'Class',
  8: 'Level',
  9: 'Age',
  10: 'Weight',
  11: 'Height',
  12: 'Mana',
  13: 'Hit Points',
  14: 'Move',
  15: 'Gold',
  16: 'EXP',
  17: 'AC',
  18: 'Hitroll',
  19: 'Damroll',
  20: 'Save Para',
  21: 'Save Rod',
  22: 'Save Fear',
  23: 'Save Breath',
  24: 'Save Spell',
  25: 'Fire Prot',
  26: 'AGI',
  27: 'POW',
  28: 'CHA',
  29: 'Karma',
  30: 'Luck',
  31: 'Max STR',
  32: 'Max DEX',
  33: 'Max INT',
  34: 'Max WIS',
  35: 'Max CON',
  36: 'Max AGI',
  37: 'Max POW',
  38: 'Max CHA',
  39: 'Max Karma',
  40: 'Max Luck',
  41: 'Race STR',
  42: 'Race DEX',
  43: 'Race INT',
  44: 'Race WIS',
  45: 'Race CON',
  46: 'Race AGI',
  47: 'Race POW',
  48: 'Race CHA',
  49: 'Race Karma',
  50: 'Race Luck',
  51: 'Curse',
  52: 'Skill Grant',
  53: 'Skill Add',
  54: 'Hit Regen',
  55: 'Move Regen',
  56: 'Mana Regen',
  57: 'Spell Pulse',
  58: 'Combat Pulse',
};

// Bitvector (AFF_) spell effect names - BIT_X where BIT_1=1, BIT_2=2, etc.
const AFF_NAMES: Record<number, string> = {
  1: 'Blind',
  2: 'Invisible',
  4: 'Farsee',
  8: 'Detect Invisible',
  16: 'Haste',
  32: 'Sense Life',
  64: 'Minor Globe',
  128: 'Stone Skin',
  256: 'Ultravision',
  512: 'Armor',
  1024: 'Wraithform',
  2048: 'Waterbreath',
  8192: 'Protect Evil',
  32768: 'Slow Poison',
  65536: 'Protect Good',
  524288: 'Sneak',
  1048576: 'Hide',
  16777216: 'Barkskin',
  33554432: 'Infravision',
  67108864: 'Levitate',
  134217728: 'Fly',
  268435456: 'Aware',
  536870912: 'Prot Fire',
};

// Bitvector2 (AFF2_) spell effect names
const AFF2_NAMES: Record<number, string> = {
  1: 'Fireshield',
  2: 'Ultravision',
  4: 'Detect Evil',
  8: 'Detect Good',
  16: 'Detect Magic',
  32: 'Major Physical',
  64: 'Prot Cold',
  128: 'Prot Lightning',
  2048: 'Globe',
  4096: 'Prot Gas',
  8192: 'Prot Acid',
  32768: 'Soulshield',
  1048576: 'Earth Aura',
  2097152: 'Water Aura',
  4194304: 'Fire Aura',
  8388608: 'Air Aura',
  134217728: 'Passdoor',
};

// Bitvector3 (AFF3_) spell effect names
const AFF3_NAMES: Record<number, string> = {
  1: 'Tensors Disc',
  8: 'Ectoplasmic Form',
  32: 'Prot Animal',
  64: 'Spirit Ward',
  128: 'Greater Spirit Ward',
  256: 'Non Detection',
  32768: 'Enlarge',
  65536: 'Reduce',
  524288: 'Inertial Barrier',
  1048576: 'Lightning Shield',
  2097152: 'Cold Shield',
  33554432: 'Blur',
  67108864: 'Enhance Healing',
  134217728: 'Elemental Form',
  268435456: 'Pass Without Trace',
  536870912: 'Paladin Aura',
};

// Bitvector4 (AFF4_) spell effect names
const AFF4_NAMES: Record<number, string> = {
  8: 'Sense Follower',
  16: 'Stornogs Spheres',
  32: 'Stornogs Greater Spheres',
  256: 'Holy Sacrifice',
  512: 'Battle Ecstasy',
  4096: 'No Fear',
  8192: 'Regeneration',
  32768: 'Battletide',
  262144: 'Mage Flame',
  524288: 'Globe of Darkness',
  1048576: 'Deflect',
  2097152: 'Hawk Vision',
  4194304: 'Sanctuary',
  8388608: 'Hellfire',
  16777216: 'Sense Holiness',
  33554432: 'Prot Living',
  67108864: 'Detect Illusion',
  134217728: 'Ice Aura',
};

// Get spell effects from bitvectors
function getSpellEffects(
  bitvector: number,
  bitvector2: number,
  bitvector3: number,
  bitvector4: number
): string[] {
  const effects: string[] = [];

  for (const [flag, name] of Object.entries(AFF_NAMES)) {
    if (bitvector & parseInt(flag)) {
      effects.push(name);
    }
  }
  for (const [flag, name] of Object.entries(AFF2_NAMES)) {
    if (bitvector2 & parseInt(flag)) {
      effects.push(name);
    }
  }
  for (const [flag, name] of Object.entries(AFF3_NAMES)) {
    if (bitvector3 & parseInt(flag)) {
      effects.push(name);
    }
  }
  for (const [flag, name] of Object.entries(AFF4_NAMES)) {
    if (bitvector4 & parseInt(flag)) {
      effects.push(name);
    }
  }

  return effects;
}

function getWearSlots(wearFlags: number): string[] {
  const slots: string[] = [];
  for (const [flag, name] of Object.entries(WEAR_SLOT_NAMES)) {
    if (wearFlags & parseInt(flag)) {
      slots.push(name);
    }
  }
  return slots;
}

// Cache TTL for objects (in seconds for Redis)
const OBJECTS_CACHE_TTL_SECONDS = 30 * 60; // 30 minutes - data rarely changes

// Extended cache for full object details (includes zone info)
interface CachedObjectDetail {
  obj: WikiObject;
  zoneId: string;
  zoneNumber: number;
  zoneName: string;
  longDesc: string;
  values: number[];
  extraFlags: number;
  extraFlags2: number;
  wearFlags: number;
  bitvector: number;
  bitvector2: number;
  bitvector3: number;
  bitvector4: number;
  cost: number;
}

// Redis cache key for object details (list now comes from database)
const REDIS_KEY_OBJECTS_DETAILS = 'wiki:objects:details';

// build object details cache from flatfiles (for getObjectByVnum which needs extra info)
// note: list data now comes from wiki_objects table, only details need flatfile parsing
async function buildObjectDetailsCacheFromSource(): Promise<Map<number, CachedObjectDetail>> {
  const { zones } = await listZones({ page: 1, limit: 10000 });
  const detailsCache = new Map<number, CachedObjectDetail>();

  for (const zone of zones) {
    try {
      const zoneObjects = await parseObjFile(zone.id);
      for (const obj of zoneObjects) {
        if (detailsCache.has(obj.vnum)) continue;

        const level = obj.values[0] || 0;
        const spellEffects = getSpellEffects(
          obj.bitvector || 0,
          obj.bitvector2 || 0,
          obj.bitvector3 || 0,
          obj.bitvector4 || 0
        );

        const wikiObject: WikiObject = {
          vnum: obj.vnum,
          name: obj.shortDesc,
          type: obj.itemType,
          typeName: OBJECT_TYPE_NAMES[obj.itemType] || `Unknown (${obj.itemType})`,
          level,
          weight: obj.weight,
          slots: getWearSlots(obj.wearFlags),
          affects: obj.applies.map((a) => ({
            location: a.location,
            locationName: AFFECT_LOCATION_NAMES[a.location] || `Unknown (${a.location})`,
            modifier: a.modifier,
          })),
          spellEffects,
          zoneNumber: zone.number,
        };

        detailsCache.set(obj.vnum, {
          obj: wikiObject,
          zoneId: zone.id,
          zoneNumber: zone.number,
          zoneName: zone.name,
          longDesc: obj.longDesc,
          values: obj.values,
          extraFlags: obj.extraFlags,
          extraFlags2: obj.extraFlags2 || 0,
          wearFlags: obj.wearFlags,
          bitvector: obj.bitvector || 0,
          bitvector2: obj.bitvector2 || 0,
          bitvector3: obj.bitvector3 || 0,
          bitvector4: obj.bitvector4 || 0,
          cost: obj.cost,
        });
      }
    } catch {
      // zone has no .obj file
    }
  }

  await setCache(REDIS_KEY_OBJECTS_DETAILS, mapToObject(detailsCache), OBJECTS_CACHE_TTL_SECONDS);
  return detailsCache;
}

// get object details cache (from redis or rebuild from flatfiles)
async function getObjectDetailsCached(): Promise<Map<number, CachedObjectDetail>> {
  const cached = await getCache<Record<string, CachedObjectDetail>>(REDIS_KEY_OBJECTS_DETAILS);
  if (cached) {
    return objectToMapNumeric(cached);
  }
  return buildObjectDetailsCacheFromSource();
}

export async function getObjects(
  filters: WikiObjectFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20, sortBy: 'vnum', sortOrder: 'asc' }
): Promise<{ objects: WikiObject[]; total: number; page: number; limit: number; totalPages: number }> {
  const { page, limit, sortBy = 'vnum', sortOrder = 'asc' } = pagination;

  // build WHERE conditions
  const conditions: string[] = ['1=1'];
  const params: (string | number)[] = [];

  if (filters.search) {
    conditions.push('(o.name LIKE ? OR o.name_ansi LIKE ?)');
    const searchPattern = `%${filters.search}%`;
    params.push(searchPattern, searchPattern);
  }

  if (filters.type !== undefined) {
    conditions.push('o.type = ?');
    params.push(filters.type);
  }

  if (filters.excludeTypes && filters.excludeTypes.length > 0) {
    conditions.push(`o.type NOT IN (${filters.excludeTypes.map(() => '?').join(',')})`);
    params.push(...filters.excludeTypes);
  }

  if (filters.minLevel !== undefined) {
    conditions.push('o.level >= ?');
    params.push(filters.minLevel);
  }

  if (filters.maxLevel !== undefined) {
    conditions.push('o.level <= ?');
    params.push(filters.maxLevel);
  }

  if (filters.zone !== undefined) {
    conditions.push('o.zone_number = ?');
    params.push(filters.zone);
  }

  // slot filter - check wiki_object_slots
  if (filters.slot !== undefined) {
    conditions.push('EXISTS (SELECT 1 FROM wiki_object_slots WHERE object_vnum = o.vnum AND slot_id = ?)');
    params.push(filters.slot);
  }

  // single affect type filter
  if (filters.affectType !== undefined) {
    conditions.push('EXISTS (SELECT 1 FROM wiki_object_affects WHERE object_vnum = o.vnum AND location = ?)');
    params.push(filters.affectType);
  }

  // multiple affects filter (AND logic)
  if (filters.affects && filters.affects.length > 0) {
    for (const reqAffect of filters.affects) {
      if (reqAffect.minModifier !== undefined) {
        conditions.push('EXISTS (SELECT 1 FROM wiki_object_affects WHERE object_vnum = o.vnum AND location = ? AND modifier >= ?)');
        params.push(reqAffect.location, reqAffect.minModifier);
      } else {
        conditions.push('EXISTS (SELECT 1 FROM wiki_object_affects WHERE object_vnum = o.vnum AND location = ?)');
        params.push(reqAffect.location);
      }
    }
  }

  // spell effects filter (AND logic)
  if (filters.spellEffects && filters.spellEffects.length > 0) {
    for (const effectName of filters.spellEffects) {
      conditions.push('EXISTS (SELECT 1 FROM wiki_object_spell_effects WHERE object_vnum = o.vnum AND LOWER(effect_name) = LOWER(?))');
      params.push(effectName);
    }
  }

  // class restriction filter - find items usable by this class
  // if is_allowed=true: class must be in wiki_object_classes OR no restrictions exist
  // if is_allowed=false: class must NOT be in wiki_object_classes
  if (filters.allowedClass !== undefined) {
    conditions.push(`(
      NOT EXISTS (SELECT 1 FROM wiki_object_classes WHERE object_vnum = o.vnum)
      OR EXISTS (SELECT 1 FROM wiki_object_classes WHERE object_vnum = o.vnum AND class_id = ? AND is_allowed = 1)
      OR (
        EXISTS (SELECT 1 FROM wiki_object_classes WHERE object_vnum = o.vnum AND is_allowed = 0)
        AND NOT EXISTS (SELECT 1 FROM wiki_object_classes WHERE object_vnum = o.vnum AND class_id = ? AND is_allowed = 0)
      )
    )`);
    params.push(filters.allowedClass, filters.allowedClass);
  }

  // race restriction filter - find items usable by this race
  if (filters.allowedRace !== undefined) {
    conditions.push(`(
      NOT EXISTS (SELECT 1 FROM wiki_object_races WHERE object_vnum = o.vnum)
      OR EXISTS (SELECT 1 FROM wiki_object_races WHERE object_vnum = o.vnum AND race_id = ? AND is_allowed = 1)
      OR (
        EXISTS (SELECT 1 FROM wiki_object_races WHERE object_vnum = o.vnum AND is_allowed = 0)
        AND NOT EXISTS (SELECT 1 FROM wiki_object_races WHERE object_vnum = o.vnum AND race_id = ? AND is_allowed = 0)
      )
    )`);
    params.push(filters.allowedRace, filters.allowedRace);
  }

  const whereClause = conditions.join(' AND ');

  // determine sort column
  let orderBy = 'o.vnum';
  switch (sortBy) {
    case 'short_desc':
      orderBy = 'o.name';
      break;
    case 'obj_type':
      orderBy = 'o.type';
      break;
    case 'level':
      orderBy = 'o.level';
      break;
    case 'weight':
      orderBy = 'o.weight';
      break;
  }
  const orderDir = sortOrder === 'desc' ? 'DESC' : 'ASC';

  // get total count first
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM wiki_objects o WHERE ${whereClause}`,
    params
  );
  const total = countRows[0].total as number;

  // get paginated results with related data
  const offset = (page - 1) * limit;
  const [rows] = await pool.query<WikiObjectRow[]>(
    `SELECT o.*,
       (SELECT GROUP_CONCAT(DISTINCT slot_id) FROM wiki_object_slots WHERE object_vnum = o.vnum) as slot_ids,
       (SELECT JSON_ARRAYAGG(JSON_OBJECT('location', location, 'modifier', modifier))
        FROM wiki_object_affects WHERE object_vnum = o.vnum) as affect_data,
       (SELECT GROUP_CONCAT(DISTINCT effect_name) FROM wiki_object_spell_effects WHERE object_vnum = o.vnum) as spell_effects
     FROM wiki_objects o
     WHERE ${whereClause}
     ORDER BY ${orderBy} ${orderDir}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // transform rows to WikiObject
  const objects: WikiObject[] = rows.map((row) => {
    // parse slots
    const slotIds = row.slot_ids ? row.slot_ids.split(',').map((s) => parseInt(s)) : [];
    const slots = slotIds.map((id) => SLOT_ID_NAMES[id]).filter(Boolean);

    // parse affects
    let affects: WikiObjectAffect[] = [];
    if (row.affect_data) {
      try {
        const parsed = typeof row.affect_data === 'string' ? JSON.parse(row.affect_data) : row.affect_data;
        if (Array.isArray(parsed)) {
          affects = parsed
            .filter((a: { location: number; modifier: number }) => a && a.location > 0)
            .map((a: { location: number; modifier: number }) => ({
              location: a.location,
              locationName: AFFECT_LOCATION_NAMES[a.location] || `Unknown (${a.location})`,
              modifier: a.modifier,
            }));
        }
      } catch {
        // ignore parse errors
      }
    }

    // parse spell effects
    const spellEffects = row.spell_effects ? row.spell_effects.split(',') : [];

    return {
      vnum: row.vnum,
      name: row.name_ansi || row.name, // prefer ansi version for display
      nameAnsi: row.name_ansi || undefined,
      type: row.type,
      typeName: OBJECT_TYPE_NAMES[row.type] || `Unknown (${row.type})`,
      level: row.level,
      weight: row.weight,
      slots,
      affects,
      spellEffects,
      zoneNumber: row.zone_number,
    };
  });

  return {
    objects,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getObjectByVnum(vnum: number): Promise<WikiObjectDetail | null> {
  // Use the shared detailed cache
  const cache = await getObjectDetailsCached();
  const cached = cache.get(vnum);

  if (!cached) {
    return null;
  }

  // Find where this object loads by parsing zone resets
  const roomLoads: { roomVnum: number; roomName: string; zoneNumber: number }[] = [];
  const mobDrops: { mobVnum: number; mobName: string; zoneNumber: number }[] = [];
  const containerLoads: { containerVnum: number; containerName: string }[] = [];

  try {
    const zoneBaseName = await getZoneBaseName(cached.zoneNumber);
    if (zoneBaseName) {
      const [zonData, mobs, objects, rooms] = await Promise.all([
        parseZonFile(zoneBaseName),
        parseMobFile(zoneBaseName),
        parseObjFile(zoneBaseName),
        parseWldFile(cached.zoneNumber),
      ]);

      // Build lookup maps
      const mobMap = new Map(mobs.map((m) => [m.vnum, m]));
      const objMap = new Map(objects.map((o) => [o.vnum, o]));
      const roomMap = new Map(rooms.map((r) => [r.vnum, r.name]));

      // Process reset commands to find all load locations
      let currentMobVnum: number | null = null;

      for (const reset of zonData.resets) {
        if (reset.command === 'M') {
          // Load mobile: arg1=mobVnum
          currentMobVnum = reset.arg1;
        } else if (reset.command === 'O' && reset.arg1 === vnum) {
          // Load object in room: arg1=objVnum, arg3=roomVnum
          const roomVnum = reset.arg3;
          if (roomVnum > 0) {
            const existing = roomLoads.find((r) => r.roomVnum === roomVnum);
            if (!existing) {
              roomLoads.push({
                roomVnum,
                roomName: roomMap.get(roomVnum) || `Room #${roomVnum}`,
                zoneNumber: cached.zoneNumber,
              });
            }
          }
        } else if ((reset.command === 'G' || reset.command === 'E') && currentMobVnum !== null && reset.arg1 === vnum) {
          // Give/Equip object to current mob: arg1=objVnum
          const mob = mobMap.get(currentMobVnum);
          if (mob) {
            const existing = mobDrops.find((d) => d.mobVnum === currentMobVnum);
            if (!existing) {
              mobDrops.push({
                mobVnum: currentMobVnum,
                mobName: mob.shortDesc,
                zoneNumber: cached.zoneNumber,
              });
            }
          }
        } else if (reset.command === 'P' && reset.arg1 === vnum) {
          // Put object in container: arg1=objVnum, arg3=containerVnum
          const containerVnum = reset.arg3;
          const container = objMap.get(containerVnum);
          if (container) {
            const existing = containerLoads.find((c) => c.containerVnum === containerVnum);
            if (!existing) {
              containerLoads.push({
                containerVnum,
                containerName: container.shortDesc,
              });
            }
          }
        }
      }
    }
  } catch (e) {
    // If we can't get load locations, just return empty arrays
    logger.error('Failed to get load locations for object:', e);
  }

  // Parse extra flag names
  const extraFlagNames = parseExtraFlags(cached.extraFlags, cached.extraFlags2);

  // Query class restrictions from database
  const classRestrictions: { className: string; isAllowed: boolean }[] = [];
  const raceRestrictions: { raceName: string; isAllowed: boolean }[] = [];

  try {
    const [classRows] = await pool.query<RowDataPacket[]>(
      'SELECT class_id, is_allowed FROM wiki_object_classes WHERE object_vnum = ?',
      [vnum]
    );
    for (const row of classRows) {
      classRestrictions.push({
        className: OBJECT_CLASS_NAMES[row.class_id] || `Class ${row.class_id}`,
        isAllowed: row.is_allowed === 1,
      });
    }

    const [raceRows] = await pool.query<RowDataPacket[]>(
      'SELECT race_id, is_allowed FROM wiki_object_races WHERE object_vnum = ?',
      [vnum]
    );
    for (const row of raceRows) {
      raceRestrictions.push({
        raceName: RACE_NAMES[row.race_id] || `Race ${row.race_id}`,
        isAllowed: row.is_allowed === 1,
      });
    }
  } catch (e) {
    logger.error('Failed to get class/race restrictions for object:', e);
  }

  return {
    vnum: cached.obj.vnum,
    name: cached.obj.name,
    description: cached.longDesc,
    type: cached.obj.type,
    typeName: cached.obj.typeName,
    level: cached.obj.level,
    weight: cached.obj.weight,
    slots: cached.obj.slots,
    affects: cached.obj.affects,
    spellEffects: cached.obj.spellEffects,
    zoneNumber: cached.zoneNumber,
    values: cached.values.slice(0, 4),
    extraFlags: cached.extraFlags,
    wearFlags: cached.wearFlags,
    extraFlagNames,
    classRestrictions,
    raceRestrictions,
    zoneLocations: [{ zoneNumber: cached.zoneNumber, zoneName: cached.zoneName }],
    roomLoads,
    mobDrops,
    containerLoads,
  };
}

// =============================================================================
// Object Type and Affect Lists (for filters) - dynamic from database
// =============================================================================

export async function getObjectTypes(): Promise<{ id: number; name: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT type FROM wiki_objects ORDER BY type'
  );
  return rows.map((row) => ({
    id: row.type,
    name: OBJECT_TYPE_NAMES[row.type] || `Unknown (${row.type})`,
  }));
}

export async function getWearSlotTypes(): Promise<{ id: number; name: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT slot_id FROM wiki_object_slots ORDER BY slot_id'
  );
  return rows.map((row) => ({
    id: row.slot_id,
    name: SLOT_ID_NAMES[row.slot_id] || `Slot ${row.slot_id}`,
  }));
}

export async function getAffectTypes(): Promise<{ id: number; name: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT location FROM wiki_object_affects WHERE location > 0 ORDER BY location'
  );
  return rows.map((row) => ({
    id: row.location,
    name: AFFECT_LOCATION_NAMES[row.location] || `Unknown (${row.location})`,
  }));
}

export async function getSpellEffectTypes(): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT effect_name FROM wiki_object_spell_effects ORDER BY effect_name'
  );
  return rows.map((row) => row.effect_name);
}

// class bit values for object restrictions (same as mob classes)
const OBJECT_CLASS_NAMES: Record<number, string> = {
  1: 'Warrior',
  2: 'Ranger',
  4: 'Psionicist',
  8: 'Paladin',
  16: 'Anti-Paladin',
  32: 'Cleric',
  64: 'Monk',
  128: 'Druid',
  256: 'Shaman',
  512: 'Sorcerer',
  1024: 'Necromancer',
  2048: 'Conjurer',
  4096: 'Rogue',
  8192: 'Assassin',
  16384: 'Mercenary',
  32768: 'Bard',
  65536: 'Thief',
  131072: 'Warlock',
  262144: 'Mindflayer',
  524288: 'Alchemist',
  1048576: 'Berserker',
  2097152: 'Reaver',
  4194304: 'Illusionist',
  8388608: 'Blighter',
  16777216: 'Dreadlord',
  33554432: 'Ethermancer',
  67108864: 'Avenger',
  134217728: 'Theurgist',
  268435456: 'Summoner',
};

// classes that have items with restrictions in the database
export async function getObjectClasses(): Promise<{ id: number; name: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT class_id FROM wiki_object_classes ORDER BY class_id'
  );
  return rows.map((row) => ({
    id: row.class_id,
    name: OBJECT_CLASS_NAMES[row.class_id] || `Class ${row.class_id}`,
  }));
}

// races that have items with restrictions in the database
export async function getObjectRaces(): Promise<{ id: number; name: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT race_id FROM wiki_object_races ORDER BY race_id'
  );
  return rows.map((row) => ({
    id: row.race_id,
    name: RACE_NAMES[row.race_id] || `Race ${row.race_id}`,
  }));
}

// =============================================================================
// Mobs
// =============================================================================

// Mob class names mapping (based on DurisMUD defines.h CLASS_* BIT values)
// These are BIT flags: BIT_1=1, BIT_2=2, BIT_3=4, etc.
const MOB_CLASS_NAMES: Record<number, string> = {
  0: 'None',
  1: 'Warrior',
  2: 'Ranger',
  4: 'Psionicist',
  8: 'Paladin',
  16: 'Anti-Paladin',
  32: 'Cleric',
  64: 'Monk',
  128: 'Druid',
  256: 'Shaman',
  512: 'Sorcerer',
  1024: 'Necromancer',
  2048: 'Conjurer',
  4096: 'Rogue',
  8192: 'Assassin',
  16384: 'Mercenary',
  32768: 'Bard',
  65536: 'Thief',
  131072: 'Warlock',
  262144: 'Mindflayer',
  524288: 'Alchemist',
  1048576: 'Berserker',
  2097152: 'Reaver',
  4194304: 'Illusionist',
  8388608: 'Blighter',
  16777216: 'Dreadlord',
  33554432: 'Ethermancer',
  67108864: 'Avenger',
  134217728: 'Theurgist',
  268435456: 'Summoner',
};

// Race names mapping (from DurisMUD defines.h)
const RACE_NAMES: Record<number, string> = {
  0: 'None',
  1: 'Human',
  2: 'Barbarian',
  3: 'Drow',
  4: 'Grey Elf',
  5: 'Mountain Dwarf',
  6: 'Duergar',
  7: 'Halfling',
  8: 'Gnome',
  9: 'Ogre',
  10: 'Troll',
  11: 'Half-Elf',
  12: 'Illithid',
  13: 'Orc',
  14: 'Thri-Kreen',
  15: 'Centaur',
  16: 'Githyanki',
  17: 'Minotaur',
  18: 'Shade',
  19: 'Revenant',
  20: 'Goblin',
  21: 'Lich',
  22: 'Vampire',
  23: 'Death Knight',
  24: 'Spectral Beast',
  25: 'Stone Giant',
  26: 'Wight',
  27: 'Phantom',
  28: 'Harpy',
  29: 'Orog',
  30: 'Githzerai',
  31: 'Drider',
  32: 'Kobold',
  33: 'Psionic Illithid',
  34: 'Kuo-Toa',
  35: 'Wood Elf',
  36: 'Firbolg',
  37: 'Tiefling',
  38: 'Agathinon',
  39: 'Eladrin',
  40: 'Gargoyle',
  41: 'Fire Elemental',
  42: 'Air Elemental',
  43: 'Water Elemental',
  44: 'Earth Elemental',
  45: 'Demon',
  46: 'Devil',
  47: 'Undead',
  48: 'Vampire',
  49: 'Ghost',
  50: 'Lycanthrope',
  51: 'Giant',
  52: 'Half-Orc',
  53: 'Golem',
  54: 'Faerie',
  55: 'Dragon',
  56: 'Dragonkin',
  57: 'Reptile',
  58: 'Snake',
  59: 'Insect',
  60: 'Arachnid',
  61: 'Aquatic Animal',
  62: 'Flying Animal',
  63: 'Quadruped',
  64: 'Primate',
  65: 'Humanoid',
  66: 'Animal',
  67: 'Plant',
  68: 'Herbivore',
  69: 'Carnivore',
  70: 'Parasite',
  71: 'Beholder',
  72: 'Dracolich',
  73: 'Slime',
  74: 'Angel',
  75: 'Rakshasa',
  76: 'Construct',
  77: 'Efreet',
  78: 'Snow Ogre',
  79: 'Beholderkin',
  80: 'Zombie',
  81: 'Spectre',
  82: 'Skeleton',
  83: 'Wraith',
  84: 'Shadow',
  85: 'Purple Worm',
  86: 'Void Elemental',
  87: 'Ice Elemental',
  88: 'Phoenix',
  89: 'Archon',
  90: 'Asura',
  91: 'Titan',
  92: 'Avatar',
  93: 'Ghaele',
  94: 'Bralani',
  95: 'Whiner',
  96: 'Incubus',
  97: 'Succubus',
  98: 'Fire Giant',
  99: 'Frost Giant',
  100: 'Deva',
};

// ACT flag names (from DurisMUD defines.h - bit flags)
const ACT_FLAG_NAMES: Record<number, { name: string; description: string }> = {
  1: { name: 'SPEC', description: 'Mob has a special routine' },
  2: { name: 'SENTINEL', description: 'Mob is stationary' },
  4: { name: 'SCAVENGER', description: 'Picks up items lying around' },
  8: { name: 'ISNPC', description: 'This bit is set for NPCs' },
  16: { name: 'NICE_THIEF', description: 'Thief should NOT be killed' },
  32: { name: 'BREATHES_FIRE', description: 'Breathes fire' },
  64: { name: 'STAY_ZONE', description: 'Must stay inside its own zone' },
  128: { name: 'WIMPY', description: 'Flees when injured' },
  256: { name: 'BREATHES_LIGHTNING', description: 'Breathes lightning' },
  512: { name: 'BREATHES_FROST', description: 'Breathes frost' },
  1024: { name: 'BREATHES_ACID', description: 'Breathes acid' },
  2048: { name: 'MEMORY', description: 'Remembers attackers' },
  4096: { name: 'IMMUNE_TO_PARA', description: 'Immune to paralysis' },
  8192: { name: 'NO_SUMMON', description: 'Cannot be summoned' },
  16384: { name: 'NO_BASH', description: 'Cannot be bashed' },
  32768: { name: 'TEACHER', description: 'Guildmaster (can train/scribe)' },
  65536: { name: 'IGNORE', description: 'Ignores players' },
  131072: { name: 'CANFLY', description: 'Can fly' },
  262144: { name: 'CANSWIM', description: 'Can swim' },
  524288: { name: 'BREATHES_GAS', description: 'Breathes gas' },
  1048576: { name: 'BREATHES_SHADOW', description: 'Breathes shadow' },
  2097152: { name: 'BREATHES_BLIND_GAS', description: 'Breathes blinding gas' },
  4194304: { name: 'GUILD_GOLEM', description: 'Has guild golem proc' },
  8388608: { name: 'SPEC_DIE', description: 'Special on death' },
  16777216: { name: 'ELITE', description: 'Elite mob' },
  33554432: { name: 'BREAK_CHARM', description: 'Can break charm' },
  67108864: { name: 'PROTECTOR', description: 'Protector mob' },
  134217728: { name: 'MOUNT', description: 'Can be mounted by player' },
  268435456: { name: 'WILDMAGIC', description: 'Wild magic mob' },
  536870912: { name: 'PATROL', description: 'Patrol mob' },
  1073741824: { name: 'HUNTER', description: 'Hunter mode' },
  2147483648: { name: 'SPEC_TEACHER', description: 'Special teacher' },
};

// Get flag names from actFlags bitvector
function getActFlagNames(actFlags: number): string[] {
  const flags: string[] = [];
  for (const [flag, info] of Object.entries(ACT_FLAG_NAMES)) {
    if (actFlags & parseInt(flag)) {
      flags.push(info.name);
    }
  }
  return flags;
}

// Get race name from species ID
function getRaceName(species: number): string {
  return RACE_NAMES[species] || `Unknown (${species})`;
}

export interface WikiMob {
  vnum: number;
  name: string;           // shortDesc
  keywords: string;
  level: number;
  alignment: number;
  mobClass: number;
  classname: string;
  gold: number;
  exp: number;
  zoneNumber: number;
  zoneName: string;
  // New fields
  species: number;        // Race ID
  raceName: string;       // Race name
  actFlags: number;       // Raw ACT flags bitvector
  flags: string[];        // Parsed flag names (without ACT_ prefix)
}

export interface WikiMobEquipment {
  vnum: number;
  name: string;
  slot: string;        // 'inventory', 'wielded', 'held', 'worn on body', etc.
  itemType: number;
  itemTypeName: string;
}

export interface WikiMobDetail extends WikiMob {
  longDesc: string;       // Room description (what you see when in room)
  detailedDesc: string;   // Look description (when you look at mob)
  hitDice: string;
  damDice: string;
  ac: number;
  thac0: number;
  zoneLocations: { zoneNumber: number; zoneName: string }[];
  spawnRooms: { roomVnum: number; roomName: string }[];
  equipment: WikiMobEquipment[];  // Objects that load on this mob
}

export interface WikiMobFilters {
  search?: string;
  minLevel?: number;
  maxLevel?: number;
  alignmentMin?: number;
  alignmentMax?: number;
  mobClass?: number;
  // New filters
  race?: number;          // Filter by species/race
  flag?: number;          // Filter by ACT flag (bitvector value, e.g., 1 for SPEC, 32768 for TEACHER)
  zone?: number;          // Filter by zone number
}

// Extended cache for full mob details (includes zone info)
interface CachedMobDetail {
  mob: WikiMob;
  zoneId: string;
  zoneNumber: number;
  zoneName: string;
  longDesc: string;
  detailedDesc: string;
  hitDice: string;
  damDice: string;
  ac: number;
  thac0: number;
}

// Redis cache key for mob details (list now comes from database)
const REDIS_KEY_MOBS_DETAILS = 'wiki:mobs:details';
const MOBS_CACHE_TTL_SECONDS = 30 * 60; // 30 minutes

// get connected zone numbers (zones with entrances from the world map)
async function getConnectedZoneNumbers(): Promise<Set<number>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT to_zone_number FROM wiki_zone_entrances WHERE to_zone_number > 0`
  );
  return new Set(rows.map((r) => r.to_zone_number as number));
}

// build mob details cache from flatfiles (for getMobByZoneAndVnum which needs extra info)
// note: list data now comes from wiki_mobs table, only details need flatfile parsing
async function buildMobDetailsCacheFromSource(): Promise<Map<string, CachedMobDetail>> {
  const [{ zones }, connectedZones] = await Promise.all([
    listZones({ page: 1, limit: 10000 }),
    getConnectedZoneNumbers(),
  ]);

  const detailsCache = new Map<string, CachedMobDetail>();

  for (const zone of zones) {
    if (!connectedZones.has(zone.number)) continue;
    try {
      const zoneMobs = await parseMobFile(zone.id);
      for (const mob of zoneMobs) {
        const compositeKey = `${zone.number}:${mob.vnum}`;
        const classname = MOB_CLASS_NAMES[mob.mobClass] || `Unknown (${mob.mobClass})`;
        const raceName = getRaceName(mob.species);
        const flags = getActFlagNames(mob.actFlags);

        const wikiMob: WikiMob = {
          vnum: mob.vnum,
          name: mob.shortDesc,
          keywords: mob.keywords,
          level: mob.level,
          alignment: mob.alignment,
          mobClass: mob.mobClass,
          classname,
          gold: mob.gold,
          exp: mob.exp,
          zoneNumber: zone.number,
          zoneName: zone.name,
          species: mob.species,
          raceName,
          actFlags: mob.actFlags,
          flags,
        };

        detailsCache.set(compositeKey, {
          mob: wikiMob,
          zoneId: zone.id,
          zoneNumber: zone.number,
          zoneName: zone.name,
          longDesc: mob.longDesc,
          detailedDesc: mob.detailedDesc,
          hitDice: mob.hitDice,
          damDice: mob.damDice,
          ac: mob.ac,
          thac0: mob.thac0,
        });
      }
    } catch {
      // zone has no .mob file
    }
  }

  await setCache(REDIS_KEY_MOBS_DETAILS, mapToObject(detailsCache), MOBS_CACHE_TTL_SECONDS);
  return detailsCache;
}

// get mob details cache (from redis or rebuild from flatfiles)
async function getMobDetailsCached(): Promise<Map<string, CachedMobDetail>> {
  const cached = await getCache<Record<string, CachedMobDetail>>(REDIS_KEY_MOBS_DETAILS);
  if (cached) {
    return objectToMap(cached);
  }
  return buildMobDetailsCacheFromSource();
}

export async function getMobs(
  filters: WikiMobFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20, sortBy: 'vnum', sortOrder: 'asc' }
): Promise<{ mobs: WikiMob[]; total: number; page: number; limit: number; totalPages: number }> {
  const { page, limit, sortBy = 'vnum', sortOrder = 'asc' } = pagination;

  // build WHERE conditions
  const conditions: string[] = ['1=1'];
  const params: (string | number)[] = [];

  if (filters.search) {
    conditions.push('(m.name LIKE ? OR m.name_ansi LIKE ? OR m.keywords LIKE ?)');
    const searchPattern = `%${filters.search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  if (filters.minLevel !== undefined) {
    conditions.push('m.level >= ?');
    params.push(filters.minLevel);
  }

  if (filters.maxLevel !== undefined) {
    conditions.push('m.level <= ?');
    params.push(filters.maxLevel);
  }

  if (filters.alignmentMin !== undefined) {
    conditions.push('m.alignment >= ?');
    params.push(filters.alignmentMin);
  }

  if (filters.alignmentMax !== undefined) {
    conditions.push('m.alignment <= ?');
    params.push(filters.alignmentMax);
  }

  if (filters.mobClass !== undefined) {
    conditions.push('m.mob_class = ?');
    params.push(filters.mobClass);
  }

  if (filters.race !== undefined) {
    conditions.push('m.species = ?');
    params.push(filters.race);
  }

  if (filters.flag !== undefined) {
    // bitwise AND check for act flag
    conditions.push('(m.act_flags & ?) != 0');
    params.push(filters.flag);
  }

  if (filters.zone !== undefined) {
    conditions.push('m.zone_number = ?');
    params.push(filters.zone);
  }

  const whereClause = conditions.join(' AND ');

  // determine sort column
  let orderBy = 'm.vnum';
  switch (sortBy) {
    case 'name':
      orderBy = 'm.name';
      break;
    case 'level':
      orderBy = 'm.level';
      break;
    case 'alignment':
      orderBy = 'm.alignment';
      break;
    case 'class':
      orderBy = 'm.mob_class';
      break;
    case 'race':
      orderBy = 'm.species';
      break;
    case 'zone':
      orderBy = 'z.name';
      break;
  }
  const orderDir = sortOrder === 'desc' ? 'DESC' : 'ASC';

  // get total count first
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM wiki_mobs m WHERE ${whereClause}`,
    params
  );
  const total = countRows[0].total as number;

  // get paginated results with zone name
  const offset = (page - 1) * limit;
  const [rows] = await pool.query<WikiMobRow[]>(
    `SELECT m.*, z.name as zone_name
     FROM wiki_mobs m
     LEFT JOIN zones z ON m.zone_number = z.number
     WHERE ${whereClause}
     ORDER BY ${orderBy} ${orderDir}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // transform rows to WikiMob
  const mobs: WikiMob[] = rows.map((row) => {
    const classname = MOB_CLASS_NAMES[row.mob_class] || `Unknown (${row.mob_class})`;
    const raceName = RACE_NAMES[row.species] || `Unknown (${row.species})`;
    const flags = getActFlagNames(row.act_flags);

    return {
      vnum: row.vnum,
      name: row.name_ansi || row.name, // prefer ansi version for display
      keywords: row.keywords || '',
      level: row.level,
      alignment: row.alignment,
      mobClass: Number(row.mob_class), // bigint comes as string
      classname,
      gold: row.gold,
      exp: row.exp,
      zoneNumber: row.zone_number,
      zoneName: row.zone_name || `Zone ${row.zone_number}`,
      species: row.species,
      raceName,
      actFlags: row.act_flags,
      flags,
    };
  });

  return {
    mobs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getMobByZoneAndVnum(zoneNumber: number, vnum: number): Promise<WikiMobDetail | null> {
  // Use the shared detailed cache with composite key
  const cache = await getMobDetailsCached();
  const compositeKey = `${zoneNumber}:${vnum}`;
  const cached = cache.get(compositeKey);

  if (!cached) {
    return null;
  }

  // Get spawn rooms and equipment for this mob from zone resets
  const spawnRooms: { roomVnum: number; roomName: string }[] = [];
  const equipment: WikiMobEquipment[] = [];

  try {
    // Get zone base name for parsing files
    const zoneBaseName = await getZoneBaseName(zoneNumber);
    if (zoneBaseName) {
      // Parse zone data in parallel
      const [zonData, rooms, objects] = await Promise.all([
        parseZonFile(zoneBaseName),
        parseWldFile(zoneNumber),
        parseObjFile(zoneBaseName),
      ]);

      // Build lookup maps
      const roomNameMap = new Map(rooms.map((r) => [r.vnum, r.name]));
      const objMap = new Map(objects.map((o) => [o.vnum, o]));

      // Build equip slot name lookup from EQUIP_SLOTS
      const slotNameMap = new Map<number, string>(EQUIP_SLOTS.map((s) => [s.value, s.name]));

      // Process reset commands to find spawn rooms and equipment
      let currentMobVnum: number | null = null;

      for (const reset of zonData.resets) {
        if (reset.command === 'M') {
          // Load mobile: arg1=mobVnum, arg3=roomVnum
          const mobVnum = reset.arg1;
          const roomVnum = reset.arg3;
          currentMobVnum = mobVnum;

          // If this is our mob, record the spawn room
          if (mobVnum === vnum && roomVnum > 0) {
            const existing = spawnRooms.find((r) => r.roomVnum === roomVnum);
            if (!existing) {
              spawnRooms.push({
                roomVnum,
                roomName: roomNameMap.get(roomVnum) || `Room #${roomVnum}`,
              });
            }
          }
        } else if (reset.command === 'G' && currentMobVnum === vnum) {
          // Give object to current mob: arg1=objVnum
          const objVnum = reset.arg1;
          const obj = objMap.get(objVnum);

          if (obj) {
            // Check if we already have this object in inventory
            const existing = equipment.find((e) => e.vnum === objVnum && e.slot === 'Inventory');
            if (!existing) {
              equipment.push({
                vnum: objVnum,
                name: obj.shortDesc,
                slot: 'Inventory',
                itemType: obj.itemType,
                itemTypeName: OBJECT_TYPE_NAMES[obj.itemType] || `Unknown (${obj.itemType})`,
              });
            }
          }
        } else if (reset.command === 'E' && currentMobVnum === vnum) {
          // Equip object on current mob: arg1=objVnum, arg3=position
          const objVnum = reset.arg1;
          const position = reset.arg3;
          const obj = objMap.get(objVnum);

          if (obj) {
            const slotName = slotNameMap.get(position) || `Slot ${position}`;
            // Check if we already have this object in this slot
            const existing = equipment.find((e) => e.vnum === objVnum && e.slot === slotName);
            if (!existing) {
              equipment.push({
                vnum: objVnum,
                name: obj.shortDesc,
                slot: slotName,
                itemType: obj.itemType,
                itemTypeName: OBJECT_TYPE_NAMES[obj.itemType] || `Unknown (${obj.itemType})`,
              });
            }
          }
        }
      }
    }
  } catch (e) {
    // If we can't get spawn/equipment data, just return empty arrays
    logger.error('Failed to get spawn/equipment data for mob:', e);
  }

  return {
    vnum: cached.mob.vnum,
    name: cached.mob.name,
    keywords: cached.mob.keywords,
    level: cached.mob.level,
    alignment: cached.mob.alignment,
    mobClass: cached.mob.mobClass,
    classname: cached.mob.classname,
    gold: cached.mob.gold,
    exp: cached.mob.exp,
    zoneNumber: cached.zoneNumber,
    zoneName: cached.zoneName,
    // New fields
    species: cached.mob.species,
    raceName: cached.mob.raceName,
    actFlags: cached.mob.actFlags,
    flags: cached.mob.flags,
    // Detail fields
    longDesc: cached.longDesc,
    detailedDesc: cached.detailedDesc,
    hitDice: cached.hitDice,
    damDice: cached.damDice,
    ac: cached.ac,
    thac0: cached.thac0,
    zoneLocations: [{ zoneNumber: cached.zoneNumber, zoneName: cached.zoneName }],
    spawnRooms,
    equipment,
  };
}

export async function getMobClasses(): Promise<{ id: number; name: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT mob_class FROM wiki_mobs ORDER BY mob_class'
  );
  return rows.map((row) => ({
    id: Number(row.mob_class), // bigint comes as string
    name: MOB_CLASS_NAMES[row.mob_class] || `Unknown (${row.mob_class})`,
  }));
}

// export races list for filter dropdown - dynamic from database
export async function getMobRaces(): Promise<{ id: number; name: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT species FROM wiki_mobs ORDER BY species'
  );
  return rows.map((row) => ({
    id: row.species,
    name: RACE_NAMES[row.species] || `Unknown (${row.species})`,
  }));
}

// export act flags for legend - dynamic from database
export async function getActFlags(): Promise<{ id: number; name: string; description: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT flag_id FROM wiki_mob_flags ORDER BY flag_id'
  );
  // convert flag_id back to bitvector value for lookup
  const flagBitValues: Record<number, number> = {
    1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 64, 8: 128,
    9: 256, 10: 512, 11: 1024, 12: 2048, 13: 4096, 14: 8192,
    15: 16384, 16: 32768, 17: 65536, 18: 131072, 19: 262144,
    20: 524288, 21: 1048576, 22: 2097152, 23: 4194304, 24: 8388608,
    25: 16777216, 26: 33554432, 27: 67108864, 28: 134217728,
    29: 268435456, 30: 536870912, 31: 1073741824, 32: 2147483648,
  };
  return rows.map((row) => {
    const bitValue = flagBitValues[row.flag_id] || 0;
    const info = ACT_FLAG_NAMES[bitValue] || { name: `Flag ${row.flag_id}`, description: '' };
    return {
      id: bitValue,
      name: info.name,
      description: info.description,
    };
  }).filter((f) => f.id > 0);
}

// =============================================================================
// Room Spawns (what mobs/objects spawn in each room)
// =============================================================================

export interface WikiShopItem {
  vnum: number;
  name: string;           // shortDesc of the item
  itemType?: number;
  itemTypeName?: string;
  price?: number;         // Calculated price (cost * sellMultiplier)
}

export interface WikiRoomSpawn {
  type: 'mob' | 'object';
  vnum: number;
  name: string;           // longDesc (what you see in room)
  shortDesc: string;      // For tooltips/links
  level?: number;         // For mobs
  itemType?: number;      // For objects
  itemTypeName?: string;
  isShopkeeper?: boolean; // True if this mob is a shopkeeper
  shopItems?: WikiShopItem[]; // Items the shopkeeper sells
}

export interface WikiZoneSpawns {
  roomSpawns: Record<number, WikiRoomSpawn[]>;  // roomVnum -> spawns
}

export async function getZoneSpawns(zoneNumber: number): Promise<WikiZoneSpawns> {
  const { getZoneBaseName, parseZonFile, parseMobFile, parseObjFile, parseAllShopFiles } = await import('./zoneBuilderParser.js');

  // Get zone base name
  const zoneBaseName = await getZoneBaseName(zoneNumber);
  if (!zoneBaseName) {
    return { roomSpawns: {} };
  }

  // Parse zone data, shop data, and global object cache in parallel
  const [zonData, mobs, objects, shopMap, globalObjectCache] = await Promise.all([
    parseZonFile(zoneBaseName),
    parseMobFile(zoneBaseName),
    parseObjFile(zoneBaseName),
    parseAllShopFiles(),
    getObjectDetailsCached(),
  ]);

  // Build lookup maps
  const mobMap = new Map(mobs.map((m) => [m.vnum, m]));
  const objMap = new Map(objects.map((o) => [o.vnum, o]));

  // Build a global object lookup for shop items (they may be from other zones)
  // sellMultiplier is the shop's price markup (e.g., 1.10 means 10% markup)
  const getObjectInfo = (objVnum: number, sellMultiplier: number): WikiShopItem | null => {
    // First check local objects
    const localObj = objMap.get(objVnum);
    if (localObj) {
      const price = Math.floor(localObj.cost * sellMultiplier);
      return {
        vnum: objVnum,
        name: localObj.shortDesc,
        itemType: localObj.itemType,
        itemTypeName: OBJECT_TYPE_NAMES[localObj.itemType] || `Unknown (${localObj.itemType})`,
        price: price > 0 ? price : undefined,
      };
    }
    // Check global object cache for objects from other zones
    const globalObj = globalObjectCache.get(objVnum);
    if (globalObj) {
      const price = Math.floor(globalObj.cost * sellMultiplier);
      return {
        vnum: objVnum,
        name: globalObj.obj.name,
        itemType: globalObj.obj.type,
        itemTypeName: globalObj.obj.typeName,
        price: price > 0 ? price : undefined,
      };
    }
    // Object not found anywhere
    return {
      vnum: objVnum,
      name: `Item #${objVnum}`,
    };
  };

  // Process reset commands to build room -> spawns mapping
  const roomSpawns: Record<number, WikiRoomSpawn[]> = {};

  for (const reset of zonData.resets) {
    if (reset.command === 'M') {
      // Load mobile: arg1=mobVnum, arg3=roomVnum
      const mobVnum = reset.arg1;
      const roomVnum = reset.arg3;
      const mob = mobMap.get(mobVnum);

      if (mob && roomVnum > 0) {
        if (!roomSpawns[roomVnum]) {
          roomSpawns[roomVnum] = [];
        }

        // Check if mob already in room (avoid duplicates from multiple resets)
        const existing = roomSpawns[roomVnum].find((s) => s.type === 'mob' && s.vnum === mobVnum);
        if (!existing) {
          // Check if this mob is a shopkeeper
          const shopData = shopMap.get(mobVnum);
          const isShopkeeper = !!shopData;

          // Get shop items if this is a shopkeeper
          let shopItems: WikiShopItem[] | undefined;
          if (shopData && shopData.producedItems.length > 0) {
            shopItems = shopData.producedItems
              .map((itemVnum) => getObjectInfo(itemVnum, shopData.sellMultiplier))
              .filter((item): item is WikiShopItem => item !== null);
          }

          roomSpawns[roomVnum].push({
            type: 'mob',
            vnum: mobVnum,
            name: mob.longDesc,
            shortDesc: mob.shortDesc,
            level: mob.level,
            isShopkeeper,
            shopItems,
          });
        }
      }
    } else if (reset.command === 'O') {
      // Load object in room: arg1=objVnum, arg3=roomVnum
      const objVnum = reset.arg1;
      const roomVnum = reset.arg3;
      const obj = objMap.get(objVnum);

      if (obj && roomVnum > 0) {
        if (!roomSpawns[roomVnum]) {
          roomSpawns[roomVnum] = [];
        }

        // Check if object already in room (avoid duplicates)
        const existing = roomSpawns[roomVnum].find((s) => s.type === 'object' && s.vnum === objVnum);
        if (!existing) {
          roomSpawns[roomVnum].push({
            type: 'object',
            vnum: objVnum,
            name: obj.longDesc,
            shortDesc: obj.shortDesc,
            itemType: obj.itemType,
            itemTypeName: OBJECT_TYPE_NAMES[obj.itemType] || `Unknown (${obj.itemType})`,
          });
        }
      }
    }
    // Note: G (give to mob) and E (equip on mob) commands are for mob inventory,
    // not room contents, so we don't process them here
  }

  return { roomSpawns };
}

// =============================================================================
// World Map Image Generation
// =============================================================================

// Sector type colors as RGB values (from MUD defines.h)
const SECTOR_COLORS_RGB: Record<number, [number, number, number]> = {
  0: [120, 113, 108],   // SECT_INSIDE - stone gray
  1: [255, 255, 255],   // SECT_CITY - white
  2: [74, 222, 128],    // SECT_FIELD - green
  3: [22, 163, 74],     // SECT_FOREST - darker green
  4: [234, 179, 8],     // SECT_HILLS - yellow
  5: [161, 98, 7],      // SECT_MOUNTAIN - brown
  6: [34, 211, 238],    // SECT_WATER_SWIM - cyan
  7: [59, 130, 246],    // SECT_WATER_NOSWIM - blue
  8: [125, 211, 252],   // SECT_NO_GROUND - sky blue (air)
  9: [29, 78, 216],     // SECT_UNDERWATER - dark blue
  10: [30, 64, 175],    // SECT_UNDERWATER_GR - darker blue
  11: [239, 68, 68],    // SECT_FIREPLANE - red/orange
  12: [30, 58, 138],    // SECT_OCEAN - deep blue
  13: [126, 34, 206],   // SECT_UNDRWLD_WILD - dark purple
  14: [216, 180, 254],  // SECT_UNDRWLD_CITY - light purple
  15: [68, 64, 60],     // SECT_UNDRWLD_INSIDE - dark stone
  16: [99, 102, 241],   // SECT_UNDRWLD_WATER - indigo
  17: [79, 70, 229],    // SECT_UNDRWLD_NOSWIM - indigo darker
  18: [28, 25, 23],     // SECT_UNDRWLD_NOGROUND - near black
  19: [125, 211, 252],  // SECT_AIR_PLANE - sky blue
  20: [6, 182, 212],    // SECT_WATER_PLANE - cyan
  21: [120, 113, 108],  // SECT_EARTH_PLANE - stone
  22: [196, 181, 253],  // SECT_ETHEREAL - light violet
  23: [167, 139, 250],  // SECT_ASTRAL - violet
  24: [254, 240, 138],  // SECT_DESERT - light yellow
  25: [241, 245, 249],  // SECT_ARCTIC - white/light gray
  26: [168, 85, 247],   // SECT_SWAMP - purple
  27: [88, 28, 135],    // SECT_UNDRWLD_MOUNTAIN - dark purple
  28: [132, 204, 22],   // SECT_UNDRWLD_SLIME - lime
  29: [88, 28, 135],    // SECT_UNDRWLD_LOWCEIL - dark purple
};

// Default background color (ocean)
const DEFAULT_BG_RGB: [number, number, number] = [30, 58, 138];

/**
 * Generate a PNG image of the world map from tile data
 * @param layer - The z_coord layer (0=surface, -1=underdark, etc.)
 * @returns PNG buffer
 */
export async function generateMapImage(layer: number = 0, scale: number = 4): Promise<Buffer> {
  const cacheKey = `wiki:mapImage:${layer}:${scale}`;

  // Try cache first (store as base64 in Redis)
  const cached = await getCache<string>(cacheKey);
  if (cached) {
    return Buffer.from(cached, 'base64');
  }

  // Get map bounds
  const bounds = await getMapBounds(layer);
  const baseWidth = bounds.maxX - bounds.minX + 1;
  const baseHeight = bounds.maxY - bounds.minY + 1;
  const width = baseWidth * scale;
  const height = baseHeight * scale;

  if (baseWidth <= 0 || baseHeight <= 0) {
    throw new Error('Invalid map bounds');
  }

  logger.info(`Generating map image for layer ${layer}: ${width}x${height} pixels (scale ${scale}x)`);

  // Query all tiles for this layer
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT x_coord, y_coord, sector_type
     FROM wiki_map_positions
     WHERE z_coord = ?`,
    [layer]
  );

  // Create RGBA buffer (4 bytes per pixel)
  const buffer = Buffer.alloc(width * height * 4);

  // Fill with default background color (ocean)
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    buffer[offset] = DEFAULT_BG_RGB[0];     // R
    buffer[offset + 1] = DEFAULT_BG_RGB[1]; // G
    buffer[offset + 2] = DEFAULT_BG_RGB[2]; // B
    buffer[offset + 3] = 255;               // A (fully opaque)
  }

  // Draw each tile as a scaled block
  for (const row of rows) {
    const baseX = row.x_coord - bounds.minX;
    const baseY = row.y_coord - bounds.minY;
    const sectorType = row.sector_type;
    const color = SECTOR_COLORS_RGB[sectorType] || DEFAULT_BG_RGB;

    // Draw scale x scale block for each room
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const x = baseX * scale + dx;
        const y = baseY * scale + dy;

        if (x >= 0 && x < width && y >= 0 && y < height) {
          const offset = (y * width + x) * 4;
          buffer[offset] = color[0];     // R
          buffer[offset + 1] = color[1]; // G
          buffer[offset + 2] = color[2]; // B
          buffer[offset + 3] = 255;      // A
        }
      }
    }
  }

  // Generate PNG using sharp
  const pngBuffer = await sharp(buffer, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  logger.info(`Generated map image: ${pngBuffer.length} bytes`);

  // Cache for 1 hour
  await setCache(cacheKey, pngBuffer.toString('base64'), 60 * 60);

  return pngBuffer;
}

/**
 * Generate and save static map images to disk for all layers
 */
export async function generateStaticMapImages(): Promise<{ layer: number; path: string; size: number }[]> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const layers = [0, -1, -2]; // surface, underdark, alatorin
  const results: { layer: number; path: string; size: number }[] = [];
  const outputDir = path.join(process.cwd(), 'public', 'maps');

  // ensure output dir exists
  await fs.mkdir(outputDir, { recursive: true });

  for (const layer of layers) {
    try {
      logger.info(`Generating static map for layer ${layer}...`);
      const pngBuffer = await generateMapImage(layer);

      const filename = `layer-${layer}.png`;
      const filePath = path.join(outputDir, filename);

      await fs.writeFile(filePath, pngBuffer);

      results.push({
        layer,
        path: `/maps/${filename}`,
        size: pngBuffer.length
      });

      logger.info(`Saved static map: ${filePath} (${pngBuffer.length} bytes)`);
    } catch (error) {
      logger.error(`Failed to generate map for layer ${layer}:`, error);
    }
  }

  return results;
}

/**
 * Get static map info (check if files exist)
 */
export async function getStaticMapInfo(): Promise<{ layer: number; path: string; exists: boolean; size: number }[]> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const layers = [0, -1, -2];
  const results: { layer: number; path: string; exists: boolean; size: number }[] = [];
  const outputDir = path.join(process.cwd(), 'public', 'maps');

  for (const layer of layers) {
    const filename = `layer-${layer}.png`;
    const filePath = path.join(outputDir, filename);

    try {
      const stats = await fs.stat(filePath);
      results.push({
        layer,
        path: `/maps/${filename}`,
        exists: true,
        size: stats.size
      });
    } catch {
      results.push({
        layer,
        path: `/maps/${filename}`,
        exists: false,
        size: 0
      });
    }
  }

  return results;
}

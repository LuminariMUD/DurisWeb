import { pool } from '../db/connection.js';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface Zone {
  id: number;
  number: number;
  name: string;
  epicType: number;
  frequencyMod: number;
  zoneFreqMod: number;
  epicLevel: number;
  taskZone: boolean;
  questZone: boolean;
  trophyZone: boolean;
  suggestedGroupSize: number;
  epicPayout: number;
  difficulty: number;
  randomsZone: boolean;
  alignment: number;
  lastTouch: number;
  resetPerc: number;
}

export interface ZoneFilters {
  epicTypes?: number[];
  search?: string;
  alignmentMin?: number;
  alignmentMax?: number;
  difficultyMin?: number;
  difficultyMax?: number;
  onlyEpicZones?: boolean;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ZoneUpdateData {
  epicType?: number;
  alignment?: number;
  suggestedGroupSize?: number;
  difficulty?: number;
  epicPayout?: number;
  taskZone?: boolean;
  questZone?: boolean;
  trophyZone?: boolean;
  randomsZone?: boolean;
}

interface ZoneRow extends RowDataPacket {
  id: number;
  number: number;
  name: string;
  epic_type: number;
  frequency_mod: number;
  zone_freq_mod: number;
  epic_level: number;
  task_zone: number;
  quest_zone: number;
  trophy_zone: number;
  suggested_group_size: number;
  epic_payout: number;
  difficulty: number;
  randoms_zone: number;
  alignment: number;
  last_touch: number;
  reset_perc: number;
  total_count?: number;
}

function mapZoneRow(row: ZoneRow): Zone {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    epicType: row.epic_type,
    frequencyMod: row.frequency_mod,
    zoneFreqMod: row.zone_freq_mod,
    epicLevel: row.epic_level,
    taskZone: Boolean(row.task_zone),
    questZone: Boolean(row.quest_zone),
    trophyZone: Boolean(row.trophy_zone),
    suggestedGroupSize: row.suggested_group_size,
    epicPayout: row.epic_payout,
    difficulty: row.difficulty,
    randomsZone: Boolean(row.randoms_zone),
    alignment: row.alignment,
    lastTouch: row.last_touch,
    resetPerc: row.reset_perc,
  };
}

export async function getZones(
  filters: ZoneFilters = {},
  pagination: PaginationParams = { page: 1, limit: 50, sortBy: 'number', sortOrder: 'asc' },
): Promise<{ zones: Zone[]; total: number; page: number; limit: number; totalPages: number }> {
  const { page, limit, sortBy = 'number', sortOrder = 'asc' } = pagination;
  const offset = (page - 1) * limit;

  // Build WHERE clause
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.epicTypes && filters.epicTypes.length > 0) {
    conditions.push(`epic_type IN (${filters.epicTypes.map(() => '?').join(',')})`);
    params.push(...filters.epicTypes);
  }

  if (filters.search) {
    // Strip ANSI codes from name for search: &+X (colors) and &n (reset)
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

  if (filters.onlyEpicZones) {
    conditions.push('epic_type > 0');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Validate sortBy to prevent SQL injection
  const allowedSortColumns = [
    'number',
    'name',
    'epic_type',
    'alignment',
    'difficulty',
    'suggested_group_size',
    'epic_payout',
  ];
  const validSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'number';
  const validSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC';

  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM zones ${whereClause}`;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, params);
  const total = countRows[0].total as number;

  // Get paginated zones
  const query = `
    SELECT
      id, number, name, epic_type, frequency_mod, zone_freq_mod, epic_level,
      task_zone, quest_zone, trophy_zone, suggested_group_size, epic_payout,
      difficulty, randoms_zone, alignment, last_touch, reset_perc
    FROM zones
    ${whereClause}
    ORDER BY ${validSortBy} ${validSortOrder}
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query<ZoneRow[]>(query, [...params, limit, offset]);
  const zones = rows.map(mapZoneRow);

  return {
    zones,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getZoneByNumber(zoneNumber: number): Promise<Zone | null> {
  const query = `
    SELECT
      id, number, name, epic_type, frequency_mod, zone_freq_mod, epic_level,
      task_zone, quest_zone, trophy_zone, suggested_group_size, epic_payout,
      difficulty, randoms_zone, alignment, last_touch, reset_perc
    FROM zones
    WHERE number = ?
  `;

  const [rows] = await pool.query<ZoneRow[]>(query, [zoneNumber]);

  if (rows.length === 0) {
    return null;
  }

  return mapZoneRow(rows[0]);
}

export async function updateZone(
  zoneNumber: number,
  data: ZoneUpdateData,
  updatedBy: string,
): Promise<Zone | null> {
  // Validate data
  if (data.epicType !== undefined && (data.epicType < 0 || data.epicType > 3)) {
    throw new Error('Epic type must be between 0 and 3');
  }

  if (data.alignment !== undefined && (data.alignment < -5 || data.alignment > 5)) {
    throw new Error('Alignment must be between -5 and 5');
  }

  if (
    data.suggestedGroupSize !== undefined &&
    (data.suggestedGroupSize < 1 || data.suggestedGroupSize > 20)
  ) {
    throw new Error('Suggested group size must be between 1 and 20');
  }

  if (data.difficulty !== undefined && (data.difficulty < 0 || data.difficulty > 10)) {
    throw new Error('Difficulty must be between 0 and 10');
  }

  if (data.epicPayout !== undefined && (data.epicPayout < 0 || data.epicPayout > 500)) {
    throw new Error('Epic payout must be between 0 and 500');
  }

  // Build UPDATE clause
  const updates: string[] = [];
  const params: any[] = [];

  if (data.epicType !== undefined) {
    updates.push('epic_type = ?');
    params.push(data.epicType);
  }

  if (data.alignment !== undefined) {
    updates.push('alignment = ?');
    params.push(data.alignment);
  }

  if (data.suggestedGroupSize !== undefined) {
    updates.push('suggested_group_size = ?');
    params.push(data.suggestedGroupSize);
  }

  if (data.difficulty !== undefined) {
    updates.push('difficulty = ?');
    params.push(data.difficulty);
  }

  if (data.epicPayout !== undefined) {
    updates.push('epic_payout = ?');
    params.push(data.epicPayout);
  }

  if (data.taskZone !== undefined) {
    updates.push('task_zone = ?');
    params.push(data.taskZone ? 1 : 0);
  }

  if (data.questZone !== undefined) {
    updates.push('quest_zone = ?');
    params.push(data.questZone ? 1 : 0);
  }

  if (data.trophyZone !== undefined) {
    updates.push('trophy_zone = ?');
    params.push(data.trophyZone ? 1 : 0);
  }

  if (data.randomsZone !== undefined) {
    updates.push('randoms_zone = ?');
    params.push(data.randomsZone ? 1 : 0);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  params.push(zoneNumber);

  const query = `UPDATE zones SET ${updates.join(', ')} WHERE number = ?`;

  const [result] = await pool.query<ResultSetHeader>(query, params);

  if (result.affectedRows === 0) {
    return null;
  }

  // Log the modification
  await logZoneModification(zoneNumber, updatedBy, data);

  // Return updated zone
  return getZoneByNumber(zoneNumber);
}

export async function bulkUpdateZones(
  zoneNumbers: number[],
  data: ZoneUpdateData,
  updatedBy: string,
): Promise<number> {
  if (zoneNumbers.length === 0) {
    throw new Error('No zones specified for bulk update');
  }

  // Validate data (same as updateZone)
  if (data.epicType !== undefined && (data.epicType < 0 || data.epicType > 3)) {
    throw new Error('Epic type must be between 0 and 3');
  }

  if (data.alignment !== undefined && (data.alignment < -5 || data.alignment > 5)) {
    throw new Error('Alignment must be between -5 and 5');
  }

  if (
    data.suggestedGroupSize !== undefined &&
    (data.suggestedGroupSize < 1 || data.suggestedGroupSize > 20)
  ) {
    throw new Error('Suggested group size must be between 1 and 20');
  }

  if (data.difficulty !== undefined && (data.difficulty < 0 || data.difficulty > 10)) {
    throw new Error('Difficulty must be between 0 and 10');
  }

  if (data.epicPayout !== undefined && (data.epicPayout < 0 || data.epicPayout > 500)) {
    throw new Error('Epic payout must be between 0 and 500');
  }

  // Build UPDATE clause
  const updates: string[] = [];
  const params: any[] = [];

  if (data.epicType !== undefined) {
    updates.push('epic_type = ?');
    params.push(data.epicType);
  }

  if (data.alignment !== undefined) {
    updates.push('alignment = ?');
    params.push(data.alignment);
  }

  if (data.suggestedGroupSize !== undefined) {
    updates.push('suggested_group_size = ?');
    params.push(data.suggestedGroupSize);
  }

  if (data.difficulty !== undefined) {
    updates.push('difficulty = ?');
    params.push(data.difficulty);
  }

  if (data.epicPayout !== undefined) {
    updates.push('epic_payout = ?');
    params.push(data.epicPayout);
  }

  if (data.taskZone !== undefined) {
    updates.push('task_zone = ?');
    params.push(data.taskZone ? 1 : 0);
  }

  if (data.questZone !== undefined) {
    updates.push('quest_zone = ?');
    params.push(data.questZone ? 1 : 0);
  }

  if (data.trophyZone !== undefined) {
    updates.push('trophy_zone = ?');
    params.push(data.trophyZone ? 1 : 0);
  }

  if (data.randomsZone !== undefined) {
    updates.push('randoms_zone = ?');
    params.push(data.randomsZone ? 1 : 0);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  // Add zone numbers to params
  params.push(...zoneNumbers);

  const placeholders = zoneNumbers.map(() => '?').join(',');
  const query = `UPDATE zones SET ${updates.join(', ')} WHERE number IN (${placeholders})`;

  const [result] = await pool.query<ResultSetHeader>(query, params);

  // Log each zone modification
  for (const zoneNumber of zoneNumbers) {
    await logZoneModification(zoneNumber, updatedBy, data);
  }

  return result.affectedRows;
}

async function logZoneModification(
  zoneNumber: number,
  updatedBy: string,
  changes: ZoneUpdateData,
): Promise<void> {
  const notes = `Zone ${zoneNumber} updated: ${JSON.stringify(changes)}`;

  const query = `
    INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, timestamp)
    VALUES (?, 'property_change', ?, NULL, ?, ?, NOW())
  `;

  await pool.query(query, [updatedBy, `zone_${zoneNumber}`, JSON.stringify(changes), notes]);
}

export async function getZoneStats(): Promise<{
  total: number;
  byEpicType: { type: number; count: number }[];
  byAlignment: { alignment: number; count: number }[];
  avgDifficulty: number;
  zonesWithEpics: number;
}> {
  const [totalRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as total FROM zones');
  const total = totalRows[0].total as number;

  const [epicTypeRows] = await pool.query<RowDataPacket[]>(`
    SELECT epic_type as type, COUNT(*) as count
    FROM zones
    GROUP BY epic_type
    ORDER BY epic_type
  `);

  const [alignmentRows] = await pool.query<RowDataPacket[]>(`
    SELECT alignment, COUNT(*) as count
    FROM zones
    GROUP BY alignment
    ORDER BY alignment
  `);

  const [avgRows] = await pool.query<RowDataPacket[]>('SELECT AVG(difficulty) as avg FROM zones');
  const avgDifficulty = avgRows[0].avg as number;

  const [epicZonesRows] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) as count FROM zones WHERE epic_type > 0',
  );
  const zonesWithEpics = epicZonesRows[0].count as number;

  return {
    total,
    byEpicType: epicTypeRows.map((row) => ({ type: row.type, count: row.count })),
    byAlignment: alignmentRows.map((row) => ({ alignment: row.alignment, count: row.count })),
    avgDifficulty,
    zonesWithEpics,
  };
}

import { pool as db } from '../db/connection.js';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface DupedItem {
  /** BIGINT UNSIGNED, carried as a canonical decimal string. */
  obj_uid: string;
  vnum: number;
  /** Distinct vnums sharing this UID; > 1 means inconsistent item metadata. */
  vnum_count: number;
  item_name: string | null;
  item_name_ansi: string | null;
  players: string;
  total_count: number;
  player_count: number;
  created_at: string | null;
}

interface DupeDetail {
  id: number;
  obj_uid: string;
  vnum: number;
  item_name: string | null;
  item_name_ansi: string | null;
  player_name: string;
  pid: number;
  location: string;
  source: 'inventory' | 'locker';
  created_at: string | null;
}

interface DupeSummary {
  total_duped_uids: number;
  total_duped_records: number;
  player_pairs: Array<{ players: string; duped_items: number }>;
}

/**
 * Gets all items whose global UID appears more than once across player_items
 * and locker_items. Grouping is by obj_uid alone: grouping by (obj_uid, vnum)
 * hid a UID attached to two different vnums when each pair occurred once.
 * Aggregation runs before the metadata joins so those joins scale with
 * duplicate candidates rather than every item row. See
 * docs/ARCHITECTURE.md#mutation-authority-and-default-closed-gates.
 */
export async function getDupedItems(): Promise<DupedItem[]> {
  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT
      CAST(candidates.obj_uid AS CHAR) as obj_uid,
      candidates.vnum,
      candidates.vnum_count,
      wo.name as item_name,
      wo.name_ansi as item_name_ansi,
      candidates.players,
      candidates.total_count,
      candidates.player_count,
      candidates.created_at
    FROM (
      SELECT
        obj_uid,
        MIN(vnum) as vnum,
        COUNT(DISTINCT vnum) as vnum_count,
        GROUP_CONCAT(DISTINCT player_name ORDER BY player_name) as players,
        COUNT(*) as total_count,
        COUNT(DISTINCT pid) as player_count,
        MIN(created_at) as created_at
      FROM (
        SELECT pi.obj_uid, pi.vnum, pd.name as player_name, pi.pid, pi.created_at
        FROM player_items pi
        JOIN player_data pd ON pi.pid = pd.pid
        WHERE pi.obj_uid IS NOT NULL AND pi.obj_uid > 0

        UNION ALL

        SELECT li.obj_uid, li.vnum, pd.name as player_name, l.owner_pid as pid, NULL as created_at
        FROM locker_items li
        JOIN lockers l ON li.locker_id = l.id
        JOIN player_data pd ON l.owner_pid = pd.pid
        WHERE li.obj_uid IS NOT NULL AND li.obj_uid > 0
      ) combined
      GROUP BY obj_uid
      HAVING total_count > 1
    ) candidates
    LEFT JOIN wiki_objects wo ON candidates.vnum = wo.vnum
    ORDER BY candidates.total_count DESC, candidates.obj_uid
  `);

  return rows as DupedItem[];
}

/**
 * Gets detailed location and holder information for a specific duplicated obj_uid
 * across both player_items and locker_items.
 */
export async function getDupeDetails(objUid: string): Promise<DupeDetail[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `
    SELECT * FROM (
      SELECT
        pi.id,
        CAST(pi.obj_uid AS CHAR) as obj_uid,
        pi.vnum,
        wo.name as item_name,
        wo.name_ansi as item_name_ansi,
        pd.name as player_name,
        pi.pid,
        CASE
          WHEN pi.equip_slot > 0 THEN 'Equipped'
          WHEN pi.container_id IS NOT NULL THEN 'In Container'
          ELSE 'Inventory'
        END as location,
        'inventory' as source,
        pi.created_at
      FROM player_items pi
      JOIN player_data pd ON pi.pid = pd.pid
      LEFT JOIN wiki_objects wo ON pi.vnum = wo.vnum
      WHERE pi.obj_uid = ?

      UNION ALL

      SELECT
        li.id,
        CAST(li.obj_uid AS CHAR) as obj_uid,
        li.vnum,
        wo.name as item_name,
        wo.name_ansi as item_name_ansi,
        pd.name as player_name,
        l.owner_pid as pid,
        CONCAT('Locker: ', l.locker_name) as location,
        'locker' as source,
        NULL as created_at
      FROM locker_items li
      JOIN lockers l ON li.locker_id = l.id
      JOIN player_data pd ON l.owner_pid = pd.pid
      LEFT JOIN wiki_objects wo ON li.vnum = wo.vnum
      WHERE li.obj_uid = ?
    ) combined
    ORDER BY player_name, source, location
  `,
    [objUid, objUid],
  );

  return rows as DupeDetail[];
}

/**
 * Calculates summary statistics for duplicate item detection, including total
 * duplicated UIDs, record counts, and top player pairs involved in duplication.
 */
export async function getDupeSummary(): Promise<DupeSummary> {
  const [statsRows] = await db.query<RowDataPacket[]>(`
    SELECT
      COUNT(DISTINCT obj_uid) as total_duped_uids,
      SUM(cnt) as total_duped_records
    FROM (
      SELECT obj_uid, COUNT(*) as cnt
      FROM (
        SELECT pi.obj_uid
        FROM player_items pi
        JOIN player_data pd ON pi.pid = pd.pid
        WHERE pi.obj_uid > 0
        UNION ALL
        SELECT li.obj_uid
        FROM locker_items li
        JOIN lockers l ON li.locker_id = l.id
        JOIN player_data pd ON l.owner_pid = pd.pid
        WHERE li.obj_uid > 0
      ) all_items
      GROUP BY obj_uid
      HAVING cnt > 1
    ) duped
  `);

  // player pairs/names with most dupes
  const [pairRows] = await db.query<RowDataPacket[]>(`
    SELECT
      players,
      COUNT(*) as duped_items
    FROM (
      SELECT
        obj_uid,
        GROUP_CONCAT(DISTINCT player_name ORDER BY player_name) as players
      FROM (
        SELECT pi.obj_uid, pd.name as player_name
        FROM player_items pi
        JOIN player_data pd ON pi.pid = pd.pid
        WHERE pi.obj_uid > 0
        UNION ALL
        SELECT li.obj_uid, pd.name as player_name
        FROM locker_items li
        JOIN lockers l ON li.locker_id = l.id
        JOIN player_data pd ON l.owner_pid = pd.pid
        WHERE li.obj_uid > 0
      ) combined
      GROUP BY obj_uid
      HAVING COUNT(*) > 1
    ) grouped
    GROUP BY players
    ORDER BY duped_items DESC
    LIMIT 10
  `);

  return {
    total_duped_uids: (statsRows[0] as any)?.total_duped_uids || 0,
    total_duped_records: (statsRows[0] as any)?.total_duped_records || 0,
    player_pairs: pairRows as Array<{ players: string; duped_items: number }>,
  };
}

/**
 * Deletes a specific inventory item row by its primary key id from player_items.
 */
export async function deletePlayerItem(itemId: number): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>('DELETE FROM player_items WHERE id = ?', [
    itemId,
  ]);
  return result.affectedRows > 0;
}

/**
 * Deletes a specific locker item row by its primary key id from locker_items.
 */
export async function deleteLockerItem(itemId: number): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>('DELETE FROM locker_items WHERE id = ?', [
    itemId,
  ]);
  return result.affectedRows > 0;
}

/**
 * Bulk deletes multiple inventory items by primary key ids from player_items.
 */
export async function deletePlayerItems(itemIds: number[]): Promise<number> {
  if (itemIds.length === 0) return 0;
  const [result] = await db.query<ResultSetHeader>('DELETE FROM player_items WHERE id IN (?)', [
    itemIds,
  ]);
  return result.affectedRows;
}

/**
 * Deletes all duplicate copies for an obj_uid, keeping one copy.
 * Preference is given to the lowest id in player_items; if none exist in player_items,
 * the lowest id in locker_items is retained.
 * Uses locking reads (FOR UPDATE) to serialize against concurrent writes on the same obj_uid.
 * Rejects bulk deletion if the UID spans multiple distinct VNUMs.
 */
export async function deleteAllDupesForUid(objUid: string, vnum?: number): Promise<number> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Lock all current records for this obj_uid in both tables
    const [playerRows] = await connection.query<RowDataPacket[]>(
      'SELECT id, vnum FROM player_items WHERE obj_uid = ? FOR UPDATE',
      [objUid],
    );
    const [lockerRows] = await connection.query<RowDataPacket[]>(
      'SELECT id, vnum FROM locker_items WHERE obj_uid = ? FOR UPDATE',
      [objUid],
    );

    const distinctVnums = new Set<number>();
    for (const row of playerRows) {
      distinctVnums.add(Number(row.vnum));
    }
    for (const row of lockerRows) {
      distinctVnums.add(Number(row.vnum));
    }

    if (distinctVnums.size > 1) {
      throw new Error(
        `Cannot bulk delete UID ${objUid}: item spans ${distinctVnums.size} distinct VNUMs. Explicit item selection required.`,
      );
    }

    if (vnum !== undefined && distinctVnums.size === 1 && !distinctVnums.has(vnum)) {
      throw new Error(
        `VNUM mismatch for UID ${objUid}: expected ${vnum}, found ${[...distinctVnums][0]}`,
      );
    }

    let deletedCount = 0;

    if (playerRows.length > 0) {
      const playerKeeperId = Math.min(...playerRows.map((r) => Number(r.id)));
      const [playerResult] = await connection.query<ResultSetHeader>(
        'DELETE FROM player_items WHERE obj_uid = ? AND id != ?',
        [objUid, playerKeeperId],
      );
      const [lockerResult] = await connection.query<ResultSetHeader>(
        'DELETE FROM locker_items WHERE obj_uid = ?',
        [objUid],
      );
      deletedCount = playerResult.affectedRows + lockerResult.affectedRows;
    } else if (lockerRows.length > 0) {
      const lockerKeeperId = Math.min(...lockerRows.map((r) => Number(r.id)));
      const [lockerResult] = await connection.query<ResultSetHeader>(
        'DELETE FROM locker_items WHERE obj_uid = ? AND id != ?',
        [objUid, lockerKeeperId],
      );
      deletedCount = lockerResult.affectedRows;
    }

    await connection.commit();
    return deletedCount;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

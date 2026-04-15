import { pool as db } from '../db/connection.js';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface DupedItem {
  obj_uid: number;
  vnum: number;
  item_name: string | null;
  item_name_ansi: string | null;
  players: string;
  total_count: number;
  player_count: number;
  created_at: string | null;
}

interface DupeDetail {
  id: number;
  obj_uid: number;
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

// gets all items with same uid appearing more than once (same or different players, including lockers)
export async function getDupedItems(): Promise<DupedItem[]> {
  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT
      obj_uid,
      vnum,
      MAX(item_name) as item_name,
      MAX(item_name_ansi) as item_name_ansi,
      GROUP_CONCAT(DISTINCT player_name ORDER BY player_name) as players,
      COUNT(*) as total_count,
      COUNT(DISTINCT pid) as player_count,
      MIN(created_at) as created_at
    FROM (
      SELECT
        pi.obj_uid,
        pi.vnum,
        wo.name as item_name,
        wo.name_ansi as item_name_ansi,
        pd.name as player_name,
        pi.pid,
        pi.created_at
      FROM player_items pi
      JOIN player_data pd ON pi.pid = pd.pid
      LEFT JOIN wiki_objects wo ON pi.vnum = wo.vnum
      WHERE pi.obj_uid IS NOT NULL AND pi.obj_uid > 0

      UNION ALL

      SELECT
        li.obj_uid,
        li.vnum,
        wo.name as item_name,
        wo.name_ansi as item_name_ansi,
        pd.name as player_name,
        l.owner_pid as pid,
        NULL as created_at
      FROM locker_items li
      JOIN lockers l ON li.locker_id = l.id
      JOIN player_data pd ON l.owner_pid = pd.pid
      LEFT JOIN wiki_objects wo ON li.vnum = wo.vnum
      WHERE li.obj_uid IS NOT NULL AND li.obj_uid > 0
    ) combined
    GROUP BY obj_uid, vnum
    HAVING total_count > 1
    ORDER BY total_count DESC, obj_uid
  `);

  return rows as DupedItem[];
}

// gets detailed info for a specific duped uid (from both player_items and locker_items)
export async function getDupeDetails(objUid: number): Promise<DupeDetail[]> {
  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT * FROM (
      SELECT
        pi.id,
        pi.obj_uid,
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
        li.obj_uid,
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
  `, [objUid, objUid]);

  return rows as DupeDetail[];
}

// summary stats for the page header
export async function getDupeSummary(): Promise<DupeSummary> {
  const [statsRows] = await db.query<RowDataPacket[]>(`
    SELECT
      COUNT(DISTINCT obj_uid) as total_duped_uids,
      SUM(cnt) as total_duped_records
    FROM (
      SELECT obj_uid, COUNT(*) as cnt
      FROM (
        SELECT pi.obj_uid, pi.vnum
        FROM player_items pi
        JOIN player_data pd ON pi.pid = pd.pid
        WHERE pi.obj_uid > 0
        UNION ALL
        SELECT li.obj_uid, li.vnum
        FROM locker_items li
        JOIN lockers l ON li.locker_id = l.id
        JOIN player_data pd ON l.owner_pid = pd.pid
        WHERE li.obj_uid > 0
      ) all_items
      GROUP BY obj_uid, vnum
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
        vnum,
        GROUP_CONCAT(DISTINCT player_name ORDER BY player_name) as players
      FROM (
        SELECT pi.obj_uid, pi.vnum, pd.name as player_name
        FROM player_items pi
        JOIN player_data pd ON pi.pid = pd.pid
        WHERE pi.obj_uid > 0
        UNION ALL
        SELECT li.obj_uid, li.vnum, pd.name as player_name
        FROM locker_items li
        JOIN lockers l ON li.locker_id = l.id
        JOIN player_data pd ON l.owner_pid = pd.pid
        WHERE li.obj_uid > 0
      ) combined
      GROUP BY obj_uid, vnum
      HAVING COUNT(*) > 1
    ) grouped
    GROUP BY players
    ORDER BY duped_items DESC
    LIMIT 10
  `);

  return {
    total_duped_uids: (statsRows[0] as any)?.total_duped_uids || 0,
    total_duped_records: (statsRows[0] as any)?.total_duped_records || 0,
    player_pairs: pairRows as Array<{ players: string; duped_items: number }>
  };
}

// delete specific item by id from player_items
export async function deletePlayerItem(itemId: number): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'DELETE FROM player_items WHERE id = ?',
    [itemId]
  );
  return result.affectedRows > 0;
}

// delete specific item by id from locker_items
export async function deleteLockerItem(itemId: number): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    'DELETE FROM locker_items WHERE id = ?',
    [itemId]
  );
  return result.affectedRows > 0;
}

// bulk delete items by ids
export async function deletePlayerItems(itemIds: number[]): Promise<number> {
  if (itemIds.length === 0) return 0;
  const [result] = await db.query<ResultSetHeader>(
    'DELETE FROM player_items WHERE id IN (?)',
    [itemIds]
  );
  return result.affectedRows;
}

// deletes all dupes for a uid, keeps one copy (lowest id gets to keep it)
export async function deleteAllDupesForUid(objUid: number, vnum: number): Promise<number> {
  // delete from player_items, keep lowest id
  const [playerResult] = await db.query<ResultSetHeader>(`
    DELETE FROM player_items
    WHERE obj_uid = ? AND vnum = ?
    AND id NOT IN (
      SELECT id FROM (
        SELECT MIN(id) as id FROM player_items WHERE obj_uid = ? AND vnum = ?
      ) as keeper
    )
  `, [objUid, vnum, objUid, vnum]);

  // delete ALL from locker_items with same uid (since we kept one in player_items)
  const [lockerResult] = await db.query<ResultSetHeader>(`
    DELETE FROM locker_items
    WHERE obj_uid = ? AND vnum = ?
  `, [objUid, vnum]);

  return playerResult.affectedRows + lockerResult.affectedRows;
}

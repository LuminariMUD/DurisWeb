import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '../db/connection.js';

const BOOTSTRAP_LOCK = 'durisweb:forum-bootstrap';

export interface InitialForumCategory {
  name: string;
  description: string;
  accessType: 'public' | 'authenticated';
  icon: string;
  sortOrder: number;
}

/** Minimal approved taxonomy; operators may add, reorder, or customize other categories. */
export const INITIAL_FORUM_CATEGORIES: readonly InitialForumCategory[] = [
  {
    name: 'General Discussion',
    description: 'General topics about DurisMUD',
    accessType: 'public',
    icon: 'MessageSquare',
    sortOrder: 10,
  },
  {
    name: 'Game Mechanics & Guides',
    description: 'Strategy, builds, and how-to guides',
    accessType: 'authenticated',
    icon: 'BookOpen',
    sortOrder: 20,
  },
  {
    name: 'PvP & Combat',
    description: 'Battle stories and PvP discussion',
    accessType: 'authenticated',
    icon: 'Swords',
    sortOrder: 30,
  },
  {
    name: 'Roleplaying',
    description: 'In-character stories and events',
    accessType: 'public',
    icon: 'Drama',
    sortOrder: 40,
  },
  {
    name: 'Bug Reports & Suggestions',
    description: 'Help improve DurisMUD',
    accessType: 'authenticated',
    icon: 'Bug',
    sortOrder: 50,
  },
] as const;

/** Insert only absent approved categories while preserving all existing rows and identifiers. */
export async function bootstrapForumCategories(): Promise<string[]> {
  const connection = await pool.getConnection();
  let hasLock = false;
  let transactionStarted = false;
  try {
    const [lockRows] = await connection.query<RowDataPacket[]>(
      'SELECT GET_LOCK(?, 10) AS acquired',
      [BOOTSTRAP_LOCK],
    );
    hasLock = Number(lockRows[0]?.acquired) === 1;
    if (!hasLock) throw new Error('forum bootstrap lock is unavailable');

    await connection.beginTransaction();
    transactionStarted = true;
    const [existingRows] = await connection.query<RowDataPacket[]>(
      'SELECT name FROM forum_categories FOR UPDATE',
    );
    const existingNames = new Set(existingRows.map((row) => String(row.name).trim().toLowerCase()));
    const inserted: string[] = [];

    for (const category of INITIAL_FORUM_CATEGORIES) {
      const normalizedName = category.name.toLowerCase();
      if (existingNames.has(normalizedName)) continue;

      await connection.query<ResultSetHeader>(
        `INSERT INTO forum_categories
          (name, description, access_type, icon, sort_order, parent_id, is_archived)
         VALUES (?, ?, ?, ?, ?, NULL, 0)`,
        [
          category.name,
          category.description,
          category.accessType,
          category.icon,
          category.sortOrder,
        ],
      );
      existingNames.add(normalizedName);
      inserted.push(category.name);
    }

    await connection.commit();
    transactionStarted = false;
    return inserted;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    try {
      if (hasLock) await connection.query('SELECT RELEASE_LOCK(?)', [BOOTSTRAP_LOCK]);
    } finally {
      connection.release();
    }
  }
}

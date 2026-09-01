import { pool } from '../db/connection.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

// ===== TYPE DEFINITIONS =====

// Help Files (pages table)
export interface HelpPage extends RowDataPacket {
  id: number;
  title: string | null;
  text: string | null;
  last_update: Date | null;
  last_update_by: string | null;
  category_id: number | null;
  category_name?: string | null;
  ip_number: string | null;
}

export interface HelpCategory extends RowDataPacket {
  id: number;
  name: string | null;
  desc: string | null;
}

// MUD Info (mud_info table - key-value store)
export interface MudInfo extends RowDataPacket {
  name: string;
  content: string;
}

// ===== HELP FILES SERVICE (pages table) =====

// category name sql fragment (based on MUD wikihelp.c)
const CATEGORY_NAME_SQL = `
  CASE p.category_id
    WHEN 0 THEN 'General'
    WHEN 1 THEN 'Redirect'
    WHEN 9 THEN 'Class'
    WHEN 10 THEN 'Class Skillsets'
    WHEN 16 THEN 'Spec'
    WHEN 25 THEN 'Race'
    ELSE 'Uncategorized'
  END as category_name`;

export async function getAllHelpPages(page: number = 1, limit: number = 50, categoryId?: number) {
  const offset = (page - 1) * limit;

  let query = `
    SELECT p.*, ${CATEGORY_NAME_SQL}
    FROM pages p
  `;
  const params: any[] = [];

  if (categoryId !== undefined) {
    query += ' WHERE p.category_id = ?';
    params.push(categoryId);
  }

  query += ' ORDER BY p.title ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.query<HelpPage[]>(query, params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM pages';
  if (categoryId !== undefined) {
    countQuery += ' WHERE category_id = ?';
  }
  const [countRows] = await pool.query<RowDataPacket[]>(
    countQuery,
    categoryId !== undefined ? [categoryId] : [],
  );
  const total = countRows[0].total;

  return {
    pages: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getHelpPageById(id: number) {
  const [rows] = await pool.query<HelpPage[]>(
    `SELECT p.*, ${CATEGORY_NAME_SQL} FROM pages p WHERE p.id = ?`,
    [id],
  );
  return rows[0] || null;
}

export async function getHelpPageByTitle(title: string) {
  const [rows] = await pool.query<HelpPage[]>(
    `SELECT p.*, ${CATEGORY_NAME_SQL} FROM pages p WHERE p.title = ?`,
    [title],
  );
  return rows[0] || null;
}

export async function createHelpPage(data: {
  title: string;
  text: string;
  category_id?: number;
  last_update_by: string;
  ip_number?: string;
}) {
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO pages (title, text, category_id, last_update, last_update_by, ip_number) VALUES (?, ?, ?, NOW(), ?, ?)',
    [data.title, data.text, data.category_id ?? 0, data.last_update_by, data.ip_number || null],
  );
  return getHelpPageById(result.insertId);
}

export async function updateHelpPage(
  id: number,
  data: {
    title?: string;
    text?: string;
    category_id?: number;
    last_update_by: string;
    ip_number?: string;
  },
) {
  const updates: string[] = ['last_update = NOW()', 'last_update_by = ?'];
  const params: any[] = [data.last_update_by];

  if (data.title !== undefined) {
    updates.push('title = ?');
    params.push(data.title);
  }
  if (data.text !== undefined) {
    updates.push('text = ?');
    params.push(data.text);
  }
  if (data.category_id !== undefined) {
    updates.push('category_id = ?');
    params.push(data.category_id ?? 0);
  }
  if (data.ip_number !== undefined) {
    updates.push('ip_number = ?');
    params.push(data.ip_number);
  }

  params.push(id);

  await pool.query(`UPDATE pages SET ${updates.join(', ')} WHERE id = ?`, params);

  return getHelpPageById(id);
}

export async function deleteHelpPage(id: number) {
  await pool.query('DELETE FROM pages WHERE id = ?', [id]);
  return true;
}

export async function searchHelpPages(query: string) {
  // escape sql wildcards to match literal % and _ characters
  const escaped = query.replace(/[%_]/g, '\\$&');
  const searchTerm = `%${escaped}%`;
  const [rows] = await pool.query<HelpPage[]>(
    `SELECT p.*, ${CATEGORY_NAME_SQL}
     FROM pages p
     WHERE p.title LIKE ?
     ORDER BY p.title ASC
     LIMIT 100`,
    [searchTerm],
  );
  return rows;
}

export async function getAllCategories() {
  const [rows] = await pool.query<HelpCategory[]>('SELECT * FROM categories ORDER BY name ASC');
  return rows;
}

export async function getCategoryById(id: number) {
  const [rows] = await pool.query<HelpCategory[]>('SELECT * FROM categories WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function createCategory(data: { name: string; desc?: string }) {
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO categories (name, desc) VALUES (?, ?)',
    [data.name, data.desc || null],
  );
  return getCategoryById(result.insertId);
}

export async function updateCategory(id: number, data: { name?: string; desc?: string }) {
  const updates: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.desc !== undefined) {
    updates.push('desc = ?');
    params.push(data.desc || null);
  }

  if (updates.length === 0) {
    return getCategoryById(id);
  }

  params.push(id);

  await pool.query(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, params);

  return getCategoryById(id);
}

export async function deleteCategory(id: number) {
  // Set category_id to NULL for all pages in this category
  await pool.query('UPDATE pages SET category_id = NULL WHERE category_id = ?', [id]);
  await pool.query('DELETE FROM categories WHERE id = ?', [id]);
  return true;
}

// ===== MUD INFO SERVICE (mud_info table - key-value store) =====

export async function getMudInfo(name: string) {
  try {
    const [rows] = await pool.query<MudInfo[]>('SELECT * FROM mud_info WHERE name = ?', [name]);
    return rows[0] || null;
  } catch (error: any) {
    // table might not exist in dev
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return null;
    }
    throw error;
  }
}

export async function getAllMudInfo() {
  try {
    const [rows] = await pool.query<MudInfo[]>('SELECT * FROM mud_info ORDER BY name ASC');
    return rows;
  } catch (error: any) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return [];
    }
    throw error;
  }
}

export async function setMudInfo(name: string, content: string) {
  try {
    // upsert to avoid race condition between UPDATE check and INSERT
    await pool.query(
      'INSERT INTO mud_info (name, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
      [name, content],
    );
    return { name, content } as MudInfo;
  } catch (error: any) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return null;
    }
    throw error;
  }
}

export async function deleteMudInfo(name: string) {
  try {
    await pool.query('DELETE FROM mud_info WHERE name = ?', [name]);
    return true;
  } catch (error: any) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return true; // delete is idempotent
    }
    throw error;
  }
}

// Convenience functions for specific mud_info entries
export async function getMotd() {
  return getMudInfo('motd');
}

export async function setMotd(content: string) {
  return setMudInfo('motd', content);
}

export async function getNews() {
  return getMudInfo('news');
}

export async function setNews(content: string) {
  return setMudInfo('news', content);
}

export async function getWizMotd() {
  return getMudInfo('wizmotd');
}

export async function setWizMotd(content: string) {
  return setMudInfo('wizmotd', content);
}

export async function getRules() {
  return getMudInfo('rules');
}

export async function setRules(content: string) {
  return setMudInfo('rules', content);
}

export async function getCredits() {
  return getMudInfo('credits');
}

export async function setCredits(content: string) {
  return setMudInfo('credits', content);
}

export async function getWizlist() {
  return getMudInfo('wizlist');
}

export async function setWizlist(content: string) {
  return setMudInfo('wizlist', content);
}

export async function getFaq() {
  return getMudInfo('faq');
}

export async function setFaq(content: string) {
  return setMudInfo('faq', content);
}

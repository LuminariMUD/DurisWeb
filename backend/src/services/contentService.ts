import { pool } from '../db/connection.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { promises as fs } from 'fs';
import path from 'path';

// MUD directory for flat file storage
const MUD_DIR = process.env.MUD_DIR || '/home/resakse/Coding/DurisMUD';
const INFORMATION_DIR = path.join(MUD_DIR, 'lib', 'information');

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

export async function getAllHelpPages(page: number = 1, limit: number = 50, categoryId?: number) {
  const offset = (page - 1) * limit;

  // Hardcoded category names based on MUD wikihelp.c
  let query = `
    SELECT p.*,
      CASE p.category_id
        WHEN 0 THEN 'General'
        WHEN 1 THEN 'Redirect'
        WHEN 9 THEN 'Class'
        WHEN 10 THEN 'Class Skillsets'
        WHEN 16 THEN 'Spec'
        WHEN 25 THEN 'Race'
        ELSE 'Uncategorized'
      END as category_name
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
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, categoryId !== undefined ? [categoryId] : []);
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
    `SELECT p.*,
      CASE p.category_id
        WHEN 0 THEN 'General'
        WHEN 1 THEN 'Redirect'
        WHEN 9 THEN 'Class'
        WHEN 10 THEN 'Class Skillsets'
        WHEN 16 THEN 'Spec'
        WHEN 25 THEN 'Race'
        ELSE 'Uncategorized'
      END as category_name
     FROM pages p
     WHERE p.id = ?`,
    [id]
  );
  return rows[0] || null;
}

export async function getHelpPageByTitle(title: string) {
  const [rows] = await pool.query<HelpPage[]>(
    `SELECT p.*,
      CASE p.category_id
        WHEN 0 THEN 'General'
        WHEN 1 THEN 'Redirect'
        WHEN 9 THEN 'Class'
        WHEN 10 THEN 'Class Skillsets'
        WHEN 16 THEN 'Spec'
        WHEN 25 THEN 'Race'
        ELSE 'Uncategorized'
      END as category_name
     FROM pages p
     WHERE p.title = ?`,
    [title]
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
    [data.title, data.text, data.category_id ?? 0, data.last_update_by, data.ip_number || null]
  );
  return getHelpPageById(result.insertId);
}

export async function updateHelpPage(id: number, data: {
  title?: string;
  text?: string;
  category_id?: number;
  last_update_by: string;
  ip_number?: string;
}) {
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

  await pool.query(
    `UPDATE pages SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  return getHelpPageById(id);
}

export async function deleteHelpPage(id: number) {
  await pool.query('DELETE FROM pages WHERE id = ?', [id]);
  return true;
}

export async function searchHelpPages(query: string) {
  const searchTerm = `%${query}%`;
  const [rows] = await pool.query<HelpPage[]>(
    `SELECT p.*,
      CASE p.category_id
        WHEN 0 THEN 'General'
        WHEN 1 THEN 'Redirect'
        WHEN 9 THEN 'Class'
        WHEN 10 THEN 'Class Skillsets'
        WHEN 16 THEN 'Spec'
        WHEN 25 THEN 'Race'
        ELSE 'Uncategorized'
      END as category_name
     FROM pages p
     WHERE p.title LIKE ?
     ORDER BY p.title ASC
     LIMIT 100`,
    [searchTerm]
  );
  return rows;
}

export async function getAllCategories() {
  const [rows] = await pool.query<HelpCategory[]>(
    'SELECT * FROM categories ORDER BY name ASC'
  );
  return rows;
}

export async function getCategoryById(id: number) {
  const [rows] = await pool.query<HelpCategory[]>(
    'SELECT * FROM categories WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

export async function createCategory(data: { name: string; desc?: string }) {
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO categories (name, desc) VALUES (?, ?)',
    [data.name, data.desc || null]
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

  await pool.query(
    `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

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
  const [rows] = await pool.query<MudInfo[]>(
    'SELECT * FROM mud_info WHERE name = ?',
    [name]
  );
  return rows[0] || null;
}

// ===== FLAT FILE HELPERS =====

// map content names to their flat file paths
const FLAT_FILE_MAP: Record<string, string> = {
  rules: 'rules',
  credits: 'credits',
  info: 'info',
  wizlist: 'wizlist',
  faq: 'faq',
};

async function readFlatFile(name: string): Promise<{ name: string; content: string } | null> {
  const fileName = FLAT_FILE_MAP[name];
  if (!fileName) return null;

  const filePath = path.join(INFORMATION_DIR, fileName);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { name, content };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeFlatFile(name: string, content: string): Promise<{ name: string; content: string } | null> {
  const fileName = FLAT_FILE_MAP[name];
  if (!fileName) return null;

  const filePath = path.join(INFORMATION_DIR, fileName);
  await fs.writeFile(filePath, content, 'utf-8');
  return { name, content };
}

export async function getAllMudInfo() {
  const [rows] = await pool.query<MudInfo[]>(
    'SELECT * FROM mud_info ORDER BY name ASC'
  );
  return rows;
}

export async function setMudInfo(name: string, content: string) {
  // Try to update first
  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE mud_info SET content = ? WHERE name = ?',
    [content, name]
  );

  // If no rows affected, insert new row
  if (result.affectedRows === 0) {
    await pool.query(
      'INSERT INTO mud_info (name, content) VALUES (?, ?)',
      [name, content]
    );
  }

  return getMudInfo(name);
}

export async function deleteMudInfo(name: string) {
  await pool.query('DELETE FROM mud_info WHERE name = ?', [name]);
  return true;
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

// ===== FLAT FILE CONTENT (reads/writes directly to MUD lib/information/) =====

export async function getRules() {
  return readFlatFile('rules');
}

export async function setRules(content: string) {
  return writeFlatFile('rules', content);
}

export async function getCredits() {
  return readFlatFile('credits');
}

export async function setCredits(content: string) {
  return writeFlatFile('credits', content);
}

export async function getInfo() {
  return readFlatFile('info');
}

export async function setInfo(content: string) {
  return writeFlatFile('info', content);
}

export async function getWizlist() {
  return readFlatFile('wizlist');
}

export async function setWizlist(content: string) {
  return writeFlatFile('wizlist', content);
}

export async function getFaq() {
  return readFlatFile('faq');
}

export async function setFaq(content: string) {
  return writeFlatFile('faq', content);
}

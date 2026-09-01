import { Router, type Router as ExpressRouter } from 'express';
import { pool } from '../db/connection.js';
import { getErrorMessage } from '../utils/logger.js';
import { validateIdParam } from '../utils/validation.js';
import type { RowDataPacket } from 'mysql2';

const router: ExpressRouter = Router();

// Hardcoded category names based on MUD wikihelp.c
const CATEGORY_NAMES: Record<number, string> = {
  0: 'General',
  1: 'Redirect',
  9: 'Class',
  10: 'Class Skillsets',
  16: 'Spec',
  25: 'Race',
};

function getCategoryName(categoryId: number | null): string {
  if (categoryId === null) return 'Uncategorized';
  return CATEGORY_NAMES[categoryId] || 'Uncategorized';
}

interface HelpPage extends RowDataPacket {
  id: number;
  title: string | null;
  text: string | null;
  last_update: Date | null;
  last_update_by: string | null;
  category_id: number | null;
}

interface CategoryCount extends RowDataPacket {
  category_id: number;
  count: number;
}

// GET /api/guide/categories - Get all categories with counts
router.get('/categories', async (_req, res) => {
  try {
    // Get counts per category
    const [rows] = await pool.query<CategoryCount[]>(
      `SELECT category_id, COUNT(*) as count FROM pages GROUP BY category_id ORDER BY category_id ASC`,
    );

    const categories = rows.map((row) => ({
      id: row.category_id ?? -1,
      name: getCategoryName(row.category_id),
      count: row.count,
    }));

    // Sort: known categories first (by ID), then uncategorized
    categories.sort((a, b) => {
      if (a.id === -1) return 1;
      if (b.id === -1) return -1;
      return a.id - b.id;
    });

    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/guide/help/search - Quick search for help files
router.get('/help/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const searchTerm = `%${query}%`;
    const [rows] = await pool.query<HelpPage[]>(
      `SELECT id, title, category_id, last_update
       FROM pages
       WHERE title LIKE ?
       ORDER BY title ASC
       LIMIT ?`,
      [searchTerm, limit],
    );

    const results = rows.map((row) => ({
      id: row.id,
      title: row.title,
      category_id: row.category_id,
      category_name: getCategoryName(row.category_id),
      last_update: row.last_update,
    }));

    return res.json({ results });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/guide/help/:id - Get single help file by ID
router.get('/help/:id', async (req, res) => {
  try {
    const id = validateIdParam(req.params.id);

    if (id === null) {
      return res.status(400).json({ error: 'Invalid help file ID' });
    }

    const [rows] = await pool.query<HelpPage[]>(
      `SELECT id, title, text, category_id, last_update, last_update_by
       FROM pages
       WHERE id = ?`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Help file not found' });
    }

    const page = rows[0];
    return res.json({
      id: page.id,
      title: page.title,
      text: page.text,
      category_id: page.category_id,
      category_name: getCategoryName(page.category_id),
      last_update: page.last_update,
      last_update_by: page.last_update_by,
    });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/guide/help - List help files with pagination and filtering
router.get('/help', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 100);
    const categoryId =
      req.query.category_id !== undefined ? parseInt(req.query.category_id as string) : undefined;
    const search = req.query.search as string | undefined;
    const sort = (req.query.sort as string) || 'title';
    const sortDir = (req.query.sort_dir as string) || 'asc';

    const offset = (page - 1) * limit;
    const params: any[] = [];
    const whereConditions: string[] = [];

    // Build WHERE clause
    if (categoryId !== undefined && !isNaN(categoryId)) {
      whereConditions.push('category_id = ?');
      params.push(categoryId);
    }

    if (search && search.length >= 2) {
      whereConditions.push('title LIKE ?');
      params.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Build ORDER BY clause
    const validSortColumns: Record<string, string> = {
      title: 'title',
      category: 'category_id',
      last_update_by: 'last_update_by',
      last_update: 'last_update',
    };
    const sortColumn = validSortColumns[sort] || 'title';
    const sortDirection = sortDir === 'desc' ? 'DESC' : 'ASC';

    // Get paginated results
    const [rows] = await pool.query<HelpPage[]>(
      `SELECT id, title, category_id, last_update, last_update_by
       FROM pages
       ${whereClause}
       ORDER BY ${sortColumn} ${sortDirection}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    // Get total count
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM pages ${whereClause}`,
      params,
    );
    const total = countRows[0].total;

    const pages = rows.map((row) => ({
      id: row.id,
      title: row.title,
      category_id: row.category_id,
      category_name: getCategoryName(row.category_id),
      last_update: row.last_update,
      last_update_by: row.last_update_by,
    }));

    res.json({
      pages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

export default router;

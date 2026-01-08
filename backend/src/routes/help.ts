import { Router, Request, Response, type IRouter } from 'express';
import logger from '../utils/logger.js';
import { pool as db } from '../db/connection.js';
import type { RowDataPacket } from 'mysql2';

const router: IRouter = Router();

interface HelpPage extends RowDataPacket {
  title: string;
  text: string;
  last_update: Date;
}

/**
 * GET /api/help/:type/:name
 * Get help text for a race or class
 * @param type - "race" or "class"
 * @param name - Name of the race/class (e.g., "Human", "Cleric")
 */
router.get('/:type/:name', async (req: Request, res: Response) => {
  try {
    const { type, name } = req.params;

    // Validate type
    if (type !== 'race' && type !== 'class') {
      return res.status(400).json({ error: 'Invalid type. Use "race" or "class".' });
    }

    // Query the pages table by exact title match (case-insensitive)
    const [rows] = await db.query<HelpPage[]>(
      `SELECT title, text, last_update
       FROM pages
       WHERE LOWER(title) = LOWER(?)
       LIMIT 1`,
      [name]
    );

    if (rows.length === 0) {
      // Try partial match for compound names (e.g., "Drow Elf" vs "Drow_elf")
      const searchName = name.replace(/_/g, ' ');
      const [fuzzyRows] = await db.query<HelpPage[]>(
        `SELECT title, text, last_update
         FROM pages
         WHERE LOWER(title) = LOWER(?)
         LIMIT 1`,
        [searchName]
      );

      if (fuzzyRows.length === 0) {
        return res.status(404).json({ error: `Help not found for ${type}: ${name}` });
      }

      return res.json({
        title: fuzzyRows[0].title,
        text: fuzzyRows[0].text,
        type,
        lastUpdate: fuzzyRows[0].last_update,
      });
    }

    return res.json({
      title: rows[0].title,
      text: rows[0].text,
      type,
      lastUpdate: rows[0].last_update,
    });
  } catch (error) {
    logger.error('Get help error:', error);
    return res.status(500).json({ error: 'Failed to get help text' });
  }
});

export default router;

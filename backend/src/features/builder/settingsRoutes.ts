import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { requireAuth } from '../../middleware/auth.js';
import { pool } from '../../db/connection.js';
import type { RowDataPacket } from 'mysql2';
import { sendRouteError } from '../../utils/routeError.js';

export const builderSettingsRoutes: IRouter = Router();

// ========== Builder Settings ==========

interface BuilderSetting extends RowDataPacket {
  id: number;
  account_name: string;
  setting_key: string;
  setting_value: string;
  created_at: Date;
  updated_at: Date;
}

// GET /api/builder/settings - Get builder settings for current user
builderSettingsRoutes.get(
  '/settings',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const accountName = req.user?.accountName;
      if (!accountName) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const [rows] = await pool.query<BuilderSetting[]>(
        'SELECT setting_key, setting_value FROM builder_settings WHERE account_name = ?',
        [accountName],
      );

      // Convert to object
      const settings: Record<string, string> = {};
      for (const row of rows) {
        settings[row.setting_key] = row.setting_value;
      }

      res.json({ settings });
    } catch (error) {
      // Table might not exist, return empty settings
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ER_NO_SUCH_TABLE'
      ) {
        res.json({ settings: {} });
        return;
      }
      logger.error('Error getting builder settings:', error);
      sendRouteError(res, error, 'Failed to get settings', 'Failed to get settings');
    }
  },
);

// PUT /api/builder/settings - Update builder settings for current user
builderSettingsRoutes.put(
  '/settings',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const accountName = req.user?.accountName;
      if (!accountName) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { settings } = req.body;
      if (!settings || typeof settings !== 'object') {
        res.status(400).json({ error: 'Settings object is required' });
        return;
      }

      // Upsert each setting
      for (const [key, value] of Object.entries(settings)) {
        if (typeof value !== 'string') continue;

        await pool.query(
          `INSERT INTO builder_settings (account_name, setting_key, setting_value, updated_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
          [accountName, key, value, value],
        );
      }

      res.json({ success: true });
    } catch (error) {
      // Table might not exist
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ER_NO_SUCH_TABLE'
      ) {
        res.status(500).json({ error: 'Builder settings table not found. Please run migrations.' });
        return;
      }
      logger.error('Error updating builder settings:', error);
      sendRouteError(res, error, 'Failed to update settings', 'Failed to update settings');
    }
  },
);

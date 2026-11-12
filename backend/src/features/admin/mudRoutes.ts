import { safeFailureCode } from '../../utils/safeFailureCode.js';
import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { body, param, validationResult } from 'express-validator';
import { requireAuth, requireOverlord, requirePermission } from '../../middleware/auth.js';
import { pool as db } from '../../db/connection.js';
import {
  getCategorizedProperties,
  searchProperties,
  updateProperty,
  validatePropertyValue,
  getPropertyHistory,
} from '../../services/propertiesParser.js';
import { RowDataPacket } from 'mysql2';
import {
  getCurrentMudTime,
  formatMudTime,
  getMudTimeDescription,
} from '../../services/mudTimeService.js';
import { sendRouteError } from '../../utils/routeError.js';

export const adminMudRoutes: IRouter = Router();

// ============================================================================
// MUD Settings Routes (Phase 1: Read-Only)
// ============================================================================

/**
 * GET /api/admin/mud/dashboard
 * Get overview statistics for MUD settings dashboard
 */
adminMudRoutes.get(
  '/mud/dashboard',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      // Get level cap data
      const [levelCapRows] = await db.query<RowDataPacket[]>('SELECT * FROM level_cap LIMIT 1');
      const levelCap = levelCapRows[0] || null;

      // Get global timers (convert Unix timestamp to ISO string)
      const [timerRows] = await db.query<RowDataPacket[]>(
        'SELECT name, date FROM timers ORDER BY name',
      );

      // Get last wipe date (from wipe_history if exists, otherwise null)
      let lastWipeDate = null;
      try {
        const [wipeRows] = await db.query<RowDataPacket[]>(
          'SELECT executed_at FROM wipe_history ORDER BY executed_at DESC LIMIT 1',
        );
        lastWipeDate = wipeRows[0]?.executed_at || null;
      } catch (_error) {
        // Table might not exist yet - that's okay for Phase 1
        logger.info('wipe_history table not found (expected for Phase 1)');
      }

      // Parse properties file to get key settings
      const properties = await getCategorizedProperties();

      // Extract key properties for dashboard
      const levelingCategory = properties.find((cat) => cat.name === 'Leveling');
      const epicCategory = properties.find((cat) => cat.name === 'Epic');

      const keySettings = {
        maxExpLevel:
          levelingCategory?.properties.find((p) => p.key === 'exp.maxExpLevel')?.value ?? null,
        globalXpRate:
          levelingCategory?.properties.find((p) => p.key === 'exp.factor.global')?.value ?? null,
        goodXpRate:
          levelingCategory?.properties.find((p) => p.key === 'exp.factor.racewar.good')?.value ??
          null,
        evilXpRate:
          levelingCategory?.properties.find((p) => p.key === 'exp.factor.racewar.evil')?.value ??
          null,
        maxEpicLevel:
          epicCategory?.properties.find((p) => p.key === 'epic.maxFreeLevel')?.value ?? null,
        epicErrandStep:
          epicCategory?.properties.find((p) => p.key === 'epic.errandStep')?.value ?? null,
      };

      return res.json({
        levelCap: levelCap
          ? {
              level: levelCap.level,
              mostFrags: levelCap.most_frags,
              racewarLeader: levelCap.racewar_leader, // 1 = Good, 2 = Evil
              nextUpdate: levelCap.next_update,
            }
          : null,
        timers: timerRows.map((row) => ({
          name: row.name,
          date: new Date(row.date * 1000).toISOString(), // Convert Unix timestamp to ISO string
        })),
        lastWipeDate,
        keySettings,
      });
    } catch (error) {
      logger.error('Error fetching MUD dashboard data:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to fetch MUD dashboard data' });
    }
  },
);

/**
 * GET /api/admin/mud/time
 * Get current MUD time
 * No authentication required - public endpoint
 */
adminMudRoutes.get('/mud/time', async (_req: Request, res: Response) => {
  try {
    const mudTime = getCurrentMudTime();

    return res.json({
      time: mudTime,
      formatted: formatMudTime(mudTime),
      description: getMudTimeDescription(mudTime),
    });
  } catch (error) {
    logger.error('Error calculating MUD time:', { code: safeFailureCode(error) });
    return res.status(500).json({ error: 'Failed to calculate MUD time' });
  }
});

/**
 * GET /api/admin/mud/properties
 * Get all properties grouped by category
 * Query params:
 *   - search: Filter by property key (optional)
 */
adminMudRoutes.get(
  '/mud/properties',
  requireAuth,
  requirePermission('manage_mud_properties'),
  async (req: Request, res: Response) => {
    try {
      const searchQuery = req.query.search as string | undefined;

      if (searchQuery) {
        const results = await searchProperties(searchQuery);
        return res.json({
          search: searchQuery,
          results,
        });
      } else {
        const categories = await getCategorizedProperties();
        return res.json({ categories });
      }
    } catch (error) {
      logger.error('Error fetching properties:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to fetch properties' });
    }
  },
);

/**
 * GET /api/admin/mud/level-cap
 * Get current level cap data from database
 */
adminMudRoutes.get(
  '/mud/level-cap',
  requireAuth,
  requirePermission('manage_level_cap'),
  async (_req: Request, res: Response) => {
    try {
      const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM level_cap LIMIT 1');

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Level cap data not found' });
      }

      const row = rows[0];
      return res.json({
        level: row.level,
        mostFrags: row.most_frags,
        racewarLeader: row.racewar_leader, // 1 = Good, 2 = Evil
        nextUpdate: row.next_update,
      });
    } catch (error) {
      logger.error('Error fetching level cap:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to fetch level cap data' });
    }
  },
);

/**
 * GET /api/admin/mud/timers
 * Get all global game timers
 */
adminMudRoutes.get(
  '/mud/timers',
  requireAuth,
  requirePermission('manage_timers'),
  async (_req: Request, res: Response) => {
    try {
      const [rows] = await db.query<RowDataPacket[]>('SELECT name, date FROM timers ORDER BY name');

      return res.json({
        timers: rows.map((row) => ({
          name: row.name,
          date: row.date,
          timestamp: new Date(row.date).getTime(),
        })),
      });
    } catch (error) {
      logger.error('Error fetching timers:', { code: safeFailureCode(error) });
      return res.status(500).json({ error: 'Failed to fetch timers' });
    }
  },
);

/**
 * PUT /api/admin/mud/properties/:key
 * Update a single property value (Phase 2)
 */
adminMudRoutes.put(
  '/mud/properties/:key',
  requireAuth,
  requirePermission('manage_mud_properties'),
  [
    param('key').trim().isLength({ min: 1, max: 200 }).withMessage('Property key is required'),
    body('value').isNumeric().withMessage('Value must be a number'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { key } = req.params;
      const { value, notes } = req.body;
      const numericValue = parseFloat(value);

      // Validate property value
      const validation = validatePropertyValue(key, numericValue);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Update property file (creates backup automatically)
      const { oldValue } = await updateProperty(key, numericValue);

      // Log to audit trail
      await db.query(
        `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'property_change', ?, ?, ?, ?, ?)`,
        [
          req.user.accountName,
          key,
          oldValue.toString(),
          numericValue.toString(),
          notes || null,
          req.ip || null,
        ],
      );

      return res.json({
        success: true,
        message: `Property '${key}' updated from ${oldValue} to ${numericValue}. Restart MUD to apply changes.`,
        oldValue,
        newValue: numericValue,
      });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to update property', 'Failed to update property');
    }
  },
);

/**
 * GET /api/admin/mud/properties/:key/history
 * Get change history for a specific property
 */
adminMudRoutes.get(
  '/mud/properties/:key/history',
  requireAuth,
  requirePermission('manage_mud_properties'),
  [param('key').trim().isLength({ min: 1, max: 200 }).withMessage('Property key is required')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { key } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const history = await getPropertyHistory(key, limit);

      return res.json({ history });
    } catch (error) {
      return sendRouteError(
        res,
        error,
        'Failed to fetch property history',
        'Failed to fetch property history',
      );
    }
  },
);

/**
 * PUT /api/admin/mud/level-cap
 * Manually update the level cap
 */
adminMudRoutes.put(
  '/mud/level-cap',
  requireAuth,
  requirePermission('manage_level_cap'),
  [
    body('level').isInt({ min: 25, max: 60 }).withMessage('Level must be between 25 and 60'),
    body('racewarLeader')
      .optional()
      .isInt({ min: 0, max: 2 })
      .withMessage('Racewar leader must be 0 (neutral), 1 (Good), or 2 (Evil)'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { level, racewarLeader, notes } = req.body;

      // Get current level cap
      const [currentRows] = await db.query<any[]>(
        'SELECT level, racewar_leader, most_frags FROM level_cap LIMIT 1',
      );
      if (!currentRows || currentRows.length === 0) {
        return res.status(500).json({ error: 'Level cap not found in database' });
      }

      const oldLevel = currentRows[0].level;
      const oldRacewar = currentRows[0].racewar_leader;

      // Update level cap
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      updateFields.push('level = ?');
      updateValues.push(level);

      if (racewarLeader !== undefined) {
        updateFields.push('racewar_leader = ?');
        updateValues.push(racewarLeader);
      }

      await db.query(`UPDATE level_cap SET ${updateFields.join(', ')}`, updateValues);

      // Log to audit trail
      const oldValue = `Level: ${oldLevel}, Racewar: ${oldRacewar === 1 ? 'Good' : oldRacewar === 2 ? 'Evil' : 'Neutral'}`;
      const newValue = `Level: ${level}, Racewar: ${racewarLeader !== undefined ? (racewarLeader === 1 ? 'Good' : racewarLeader === 2 ? 'Evil' : 'Neutral') : oldRacewar === 1 ? 'Good' : oldRacewar === 2 ? 'Evil' : 'Neutral'}`;

      await db.query(
        `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'level_cap_change', 'level_cap', ?, ?, ?, ?)`,
        [
          req.user.accountName,
          oldValue,
          newValue,
          notes || 'Manual level cap override',
          req.ip || null,
        ],
      );

      return res.json({
        success: true,
        message: `Level cap updated to ${level}. Players can now level up to this new cap.`,
        level,
        racewarLeader: racewarLeader !== undefined ? racewarLeader : oldRacewar,
      });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to update level cap', 'Failed to update level cap');
    }
  },
);

/**
 * POST /api/admin/mud/level-cap/reset
 * Reset level cap to defaults (25, 0 frags, neutral)
 */
adminMudRoutes.post(
  '/mud/level-cap/reset',
  requireAuth,
  requirePermission('manage_level_cap'),
  [body('notes').optional().isString().withMessage('Notes must be a string')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { notes } = req.body;

      // Get current level cap for logging
      const [currentRows] = await db.query<any[]>(
        'SELECT level, racewar_leader, most_frags FROM level_cap LIMIT 1',
      );
      const oldValue =
        currentRows && currentRows.length > 0
          ? `Level: ${currentRows[0].level}, Racewar: ${currentRows[0].racewar_leader === 1 ? 'Good' : currentRows[0].racewar_leader === 2 ? 'Evil' : 'Neutral'}, Frags: ${currentRows[0].most_frags}`
          : 'Unknown';

      // Reset to defaults
      await db.query(
        'UPDATE level_cap SET most_frags=0, racewar_leader=0, level=25, next_update=NOW()',
      );

      // Log to audit trail
      await db.query(
        `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'level_cap_change', 'level_cap_reset', ?, ?, ?, ?)`,
        [
          req.user.accountName,
          oldValue,
          'Level: 25, Racewar: Neutral, Frags: 0',
          notes || 'Level cap reset to defaults',
          req.ip || null,
        ],
      );

      return res.json({
        success: true,
        message: 'Level cap reset to defaults: Level 25, 0 frags, neutral racewar.',
      });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to reset level cap', 'Failed to reset level cap');
    }
  },
);

/**
 * POST /api/admin/mud/timers/reset
 * Reset one or multiple timers to current time
 */
adminMudRoutes.post(
  '/mud/timers/reset',
  requireAuth,
  requirePermission('manage_timers'),
  [
    body('timerNames').isArray({ min: 1 }).withMessage('Timer names must be a non-empty array'),
    body('timerNames.*')
      .isString()
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage('Invalid timer name'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { timerNames, notes } = req.body;

      // Get current values for logging
      const [currentTimers] = await db.query<any[]>(
        'SELECT name, FROM_UNIXTIME(date) as date FROM timers WHERE name IN (?)',
        [timerNames],
      );

      const oldValues = currentTimers.map((t: any) => `${t.name}: ${t.date}`).join(', ');

      // Reset timers to current time
      await db.query('UPDATE timers SET date = UNIX_TIMESTAMP() WHERE name IN (?)', [timerNames]);

      // Log to audit trail
      await db.query(
        `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'timer_reset', ?, ?, ?, ?, ?)`,
        [
          req.user.accountName,
          timerNames.join(', '),
          oldValues,
          `Reset to NOW() at ${new Date().toISOString()}`,
          notes || `Manual timer reset: ${timerNames.join(', ')}`,
          req.ip || null,
        ],
      );

      return res.json({
        success: true,
        message: `Reset ${timerNames.length} timer(s) successfully.`,
        count: timerNames.length,
      });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to reset timers', 'Failed to reset timers');
    }
  },
);

/**
 * POST /api/admin/mud/timers/reset-all
 * Reset ALL timers to current time
 */
adminMudRoutes.post(
  '/mud/timers/reset-all',
  requireAuth,
  requireOverlord,
  [body('notes').optional().isString().withMessage('Notes must be a string')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { notes } = req.body;

      // Get current values for logging
      const [currentTimers] = await db.query<any[]>(
        'SELECT name, FROM_UNIXTIME(date) as date FROM timers',
      );

      const oldValues = currentTimers.map((t: any) => `${t.name}: ${t.date}`).join(', ');
      const timerCount = currentTimers.length;

      // Reset all timers
      await db.query('UPDATE timers SET date = UNIX_TIMESTAMP()');

      // Log to audit trail
      await db.query(
        `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'timer_reset', 'ALL_TIMERS', ?, ?, ?, ?)`,
        [
          req.user.accountName,
          oldValues,
          `All timers reset to NOW() at ${new Date().toISOString()}`,
          notes || 'Bulk timer reset - all timers',
          req.ip || null,
        ],
      );

      return res.json({
        success: true,
        message: `Reset all ${timerCount} timers successfully.`,
        count: timerCount,
      });
    } catch (error) {
      return sendRouteError(res, error, 'Failed to reset all timers', 'Failed to reset all timers');
    }
  },
);

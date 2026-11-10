import { Router, Request, Response, type IRouter } from 'express';
import logger, { getErrorMessage } from '../../utils/logger.js';
import { body, validationResult } from 'express-validator';
import { requireAuth, requireOverlord } from '../../middleware/auth.js';
import { requireMutationGate } from '../../middleware/mutationGate.js';
import { getMudState } from '../../services/mudControlService.js';
import { pool as db } from '../../db/connection.js';

export const adminWipeRoutes: IRouter = Router();

// ============================================================================
// Player Wipe Management
// ============================================================================

/**
 * GET /api/admin/mud/wipe/status
 * Check if wipe is on cooldown and return last wipe information
 * Requires: Overlord (Level 61+)
 */
adminWipeRoutes.get(
  '/mud/wipe/status',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      // Get last wipe from history
      const [lastWipeRows] = await db.query<any[]>(
        `SELECT executed_at, executed_by, reason, success, tables_affected, rows_affected
         FROM wipe_history
         ORDER BY executed_at DESC
         LIMIT 1`,
      );

      const lastWipe = lastWipeRows.length > 0 ? lastWipeRows[0] : null;

      // Calculate cooldown (7 days)
      const cooldownDays = 7;
      let isOnCooldown = false;
      let cooldownEndsAt = null;

      if (lastWipe && lastWipe.success) {
        const lastWipeDate = new Date(lastWipe.executed_at);
        const cooldownEnd = new Date(lastWipeDate.getTime() + cooldownDays * 24 * 60 * 60 * 1000);
        const now = new Date();

        isOnCooldown = now < cooldownEnd;
        cooldownEndsAt = cooldownEnd.toISOString();
      }

      // use getMudState() - detects actual process state, not stale cache
      const mud = await getMudState();
      const mudState = mud.state;
      const mudRunning = mudState !== 'stopped';

      return res.json({
        success: true,
        isOnCooldown,
        cooldownEndsAt,
        mudRunning,
        mudState,
        lastWipe: lastWipe
          ? {
              executedAt: lastWipe.executed_at,
              executedBy: lastWipe.executed_by,
              reason: lastWipe.reason,
              success: lastWipe.success,
              tablesAffected: lastWipe.tables_affected,
              rowsAffected: lastWipe.rows_affected,
            }
          : null,
      });
    } catch (error) {
      logger.error('Error fetching wipe status:', error);
      return res
        .status(500)
        .json({ error: getErrorMessage(error) || 'Failed to fetch wipe status' });
    }
  },
);

/**
 * GET /api/admin/mud/wipe/players
 * Get list of all active players for exclusion selector
 * Requires: Overlord (Level 61+)
 */
adminWipeRoutes.get(
  '/mud/wipe/players',
  requireAuth,
  requireOverlord,
  async (_req: Request, res: Response) => {
    try {
      const [playerRows] = await db.query<any[]>(
        `SELECT fl.pid, fl.char_name as name, fl.level, fl.class as classname, pd.spec, fl.race,
                COALESCE(a.name, '') as guild,
                pd.copper + pd.silver * 10 + pd.gold * 100 + pd.platinum * 1000 as money,
                pd.bank_copper + pd.bank_silver * 10 + pd.bank_gold * 100 + pd.bank_platinum * 1000 as balance
         FROM frag_leaderboard fl
         JOIN player_data pd ON fl.pid = pd.pid
         LEFT JOIN associations a ON pd.assoc_id = a.id
         WHERE pd.active = 1 AND fl.deleted_at IS NULL
         ORDER BY fl.level DESC, fl.char_name ASC`,
      );

      const players = playerRows.map((row) => ({
        pid: row.pid,
        name: row.name,
        level: row.level,
        class: row.classname || 'Unknown',
        spec: row.spec || '',
        race: row.race || 'Unknown',
        guild: row.guild || 'None',
        wealth: (row.money || 0) + (row.balance || 0),
      }));

      return res.json({
        success: true,
        players,
      });
    } catch (error) {
      logger.error('Error fetching players for wipe:', error);
      return res.status(500).json({ error: getErrorMessage(error) || 'Failed to fetch players' });
    }
  },
);

/**
 * GET /api/admin/mud/wipe/history
 * Get wipe history with pagination
 * Requires: Overlord (Level 61+)
 */
adminWipeRoutes.get(
  '/mud/wipe/history',
  requireAuth,
  requireOverlord,
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      // Get total count
      const [countRows] = await db.query<any[]>('SELECT COUNT(*) as total FROM wipe_history');
      const total = countRows[0].total;

      // Get history records
      const [historyRows] = await db.query<any[]>(
        `SELECT id, executed_by, executed_at, reason, excluded_players,
                tables_affected, rows_affected, duration_seconds, success,
                error_message, backup_path, ip_address
         FROM wipe_history
         ORDER BY executed_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset],
      );

      const history = historyRows.map((row) => ({
        id: row.id,
        executedBy: row.executed_by,
        executedAt: row.executed_at,
        reason: row.reason,
        excludedPlayers: row.excluded_players ? JSON.parse(row.excluded_players) : [],
        tablesAffected: row.tables_affected,
        rowsAffected: row.rows_affected,
        durationSeconds: row.duration_seconds,
        success: Boolean(row.success),
        errorMessage: row.error_message,
        backupPath: row.backup_path,
        ipAddress: row.ip_address,
      }));

      return res.json({
        success: true,
        history,
        total,
        limit,
        offset,
      });
    } catch (error) {
      logger.error('Error fetching wipe history:', error);
      return res
        .status(500)
        .json({ error: getErrorMessage(error) || 'Failed to fetch wipe history' });
    }
  },
);

/**
 * POST /api/admin/mud/wipe/execute
 * execute player wipe with optional exclusions
 * requires: Overlord
 * body: { reason: string, excludedPids: number[], confirmation: string }
 */
adminWipeRoutes.post(
  '/mud/wipe/execute',
  requireAuth,
  requireOverlord,
  requireMutationGate('playerWipe'),
  [
    body('reason')
      .isString()
      .isLength({ min: 10 })
      .withMessage('Reason must be at least 10 characters'),
    body('excludedPids').optional().isArray(),
    body('excludedPids.*')
      .optional()
      .isInt({ min: 1 })
      .withMessage('excludedPids must be positive integers'),
    body('confirmation')
      .equals('WIPE PLAYERS')
      .withMessage('Confirmation text must be "WIPE PLAYERS"'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    // mud must be stopped - connected chars would re-save after wipe
    const mud = await getMudState();
    if (mud.state !== 'stopped') {
      return res.status(409).json({
        error: 'mud_running',
        message: `MUD must be stopped before wipe (current state: ${mud.state})`,
      });
    }

    // 7-day cooldown enforced server-side (not just in status UI)
    const [lastOkRows] = await db.query<any[]>(
      `SELECT executed_at FROM wipe_history WHERE success = 1 ORDER BY executed_at DESC LIMIT 1`,
    );
    if (lastOkRows[0]) {
      const end = new Date(lastOkRows[0].executed_at).getTime() + 7 * 24 * 60 * 60 * 1000;
      if (Date.now() < end) {
        return res.status(429).json({
          error: 'cooldown_active',
          message: `Wipe cooldown in effect until ${new Date(end).toISOString()}`,
        });
      }
    }

    const { reason, excludedPids = [] } = req.body;
    const startTime = Date.now();
    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const safeExcluded = (excludedPids as any[])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);
      const excludedClause =
        safeExcluded.length > 0 ? `WHERE pid NOT IN (${safeExcluded.join(',')})` : '';

      const [targetRows] = await connection.query<any[]>(
        `SELECT pid, name FROM player_data ${excludedClause}`,
      );
      const wipedPids: number[] = targetRows.map((r: any) => Number(r.pid));
      const wipedNames: string[] = targetRows.map((r: any) => r.name);

      if (wipedPids.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          error: 'no_targets',
          message: 'No players would be wiped with the current exclusion set',
        });
      }

      const pidList = wipedPids.join(',');
      const wipedPidStrings = wipedPids.map((n) => `'${n}'`).join(',');

      let excludedPlayers: { pid: number; name: string }[] = [];
      if (safeExcluded.length > 0) {
        const [excludedRows] = await connection.query<any[]>(
          `SELECT pid, name FROM player_data WHERE pid IN (${safeExcluded.join(',')})`,
        );
        excludedPlayers = excludedRows.map((r: any) => ({ pid: Number(r.pid), name: r.name }));
      }

      let totalRowsAffected = 0;
      const tablesAffected: string[] = [];

      const runDelete = async (table: string, sql: string, params?: any[]) => {
        const [result] = (await connection!.query(sql, params)) as any;
        const n = result.affectedRows ?? 0;
        totalRowsAffected += n;
        if (n > 0) tablesAffected.push(table);
      };

      // personal lockers - guild lockers (owner_assoc_id > 0) untouched
      await runDelete(
        'locker_items',
        `DELETE FROM locker_items WHERE locker_id IN (
           SELECT id FROM lockers WHERE owner_pid IN (${pidList}) AND owner_assoc_id = 0
         )`,
      );
      await runDelete(
        'lockers',
        `DELETE FROM lockers WHERE owner_pid IN (${pidList}) AND owner_assoc_id = 0`,
      );

      if (wipedNames.length > 0) {
        await runDelete('corpses', `DELETE FROM corpses WHERE player_name IN (?)`, [wipedNames]);
      }

      const pidTables: Array<[string, string]> = [
        ['pkill_info', `DELETE FROM pkill_info               WHERE pid IN (${pidList})`],
        ['player_recipes', `DELETE FROM player_recipes           WHERE pid IN (${pidList})`],
        ['player_shapechanges', `DELETE FROM player_shapechanges      WHERE pid IN (${pidList})`],
        ['account_characters', `DELETE FROM account_characters       WHERE pid IN (${pidList})`],
        ['frag_leaderboard', `DELETE FROM frag_leaderboard         WHERE pid IN (${pidList})`],
        ['artifact_bind', `DELETE FROM artifact_bind            WHERE owner_pid IN (${pidList})`],
        ['auction_item_pickups', `DELETE FROM auction_item_pickups     WHERE pid IN (${pidList})`],
        ['auction_money_pickups', `DELETE FROM auction_money_pickups    WHERE pid IN (${pidList})`],
        ['boons_progress', `DELETE FROM boons_progress           WHERE pid IN (${pidList})`],
        ['boons_shop', `DELETE FROM boons_shop               WHERE pid IN (${pidList})`],
        ['log_entries', `DELETE FROM log_entries              WHERE pid IN (${pidList})`],
        ['ctf_data', `DELETE FROM ctf_data                 WHERE pid IN (${pidList})`],
        ['epic_bonus', `DELETE FROM epic_bonus               WHERE pid IN (${pidList})`],
        ['epic_gain', `DELETE FROM epic_gain                WHERE pid IN (${pidList})`],
        ['guild_members', `DELETE FROM guild_members            WHERE player_pid IN (${pidList})`],
        ['ip_info', `DELETE FROM ip_info                  WHERE pid IN (${pidList})`],
        ['offline_messages', `DELETE FROM offline_messages         WHERE pid IN (${pidList})`],
        ['progress', `DELETE FROM progress                 WHERE pid IN (${pidList})`],
        ['zone_trophy', `DELETE FROM zone_trophy              WHERE pid IN (${pidList})`],
        // world_quest_accomplished.pid is varchar(45) - quote the pid list
        [
          'world_quest_accomplished',
          `DELETE FROM world_quest_accomplished WHERE pid IN (${wipedPidStrings})`,
        ],
      ];

      for (const [table, sql] of pidTables) {
        await runDelete(table, sql);
      }

      // boons is season-scoped global config (all rows pid=0, admin-authored).
      // with the season ending, these go with it - admins can reauthor.
      await runDelete('boons', `DELETE FROM boons`);

      // pre-count cascaded children for accurate audit
      // (affectedRows on the parent DELETE does not include cascaded rows)
      const cascadedTables = [
        'player_affects',
        'player_forged_items',
        'player_granted_cmds',
        'player_intros',
        'player_items',
        'player_item_affects',
        'player_item_extra_descr',
        'player_languages',
        'player_pets',
        'player_pet_items',
        'player_pet_item_affects',
        'player_pet_item_extra_descr',
        'player_skills',
        'player_spellbooks',
        'player_timers',
        'player_undead_slots',
        'player_witnesses',
      ];
      for (const t of cascadedTables) {
        let countSql: string;
        if (t === 'player_item_affects' || t === 'player_item_extra_descr') {
          countSql = `SELECT COUNT(*) AS n FROM ${t} WHERE item_id IN (SELECT id FROM player_items WHERE pid IN (${pidList}))`;
        } else if (t === 'player_pet_items') {
          countSql = `SELECT COUNT(*) AS n FROM ${t} WHERE pet_id IN (SELECT id FROM player_pets WHERE owner_pid IN (${pidList}))`;
        } else if (t === 'player_pet_item_affects' || t === 'player_pet_item_extra_descr') {
          countSql = `SELECT COUNT(*) AS n FROM ${t} WHERE item_id IN (SELECT id FROM player_pet_items WHERE pet_id IN (SELECT id FROM player_pets WHERE owner_pid IN (${pidList})))`;
        } else if (t === 'player_pets') {
          countSql = `SELECT COUNT(*) AS n FROM ${t} WHERE owner_pid IN (${pidList})`;
        } else {
          countSql = `SELECT COUNT(*) AS n FROM ${t} WHERE pid IN (${pidList})`;
        }
        const [cntRows] = await connection.query<any[]>(countSql);
        const n = Number(cntRows[0]?.n ?? 0);
        if (n > 0) {
          totalRowsAffected += n;
          tablesAffected.push(t);
        }
      }

      // the actual cascade trigger
      await runDelete('player_data', `DELETE FROM player_data WHERE pid IN (${pidList})`);

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const excludedPlayersJson = JSON.stringify(excludedPlayers);

      await connection.query(
        `INSERT INTO wipe_history
           (executed_by, reason, excluded_players, tables_affected, rows_affected, duration_seconds, success, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          req.user!.accountName,
          reason,
          excludedPlayersJson,
          tablesAffected.length,
          totalRowsAffected,
          durationSeconds,
          req.ip,
        ],
      );

      await connection.query(
        `INSERT INTO admin_action_log
           (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'player_wipe', 'all_players', ?, ?, ?, ?)`,
        [
          req.user!.accountName,
          `${totalRowsAffected} rows`,
          `${tablesAffected.length} tables`,
          reason,
          req.ip,
        ],
      );

      await connection.commit();

      return res.json({
        success: true,
        message: `Player wipe completed. ${totalRowsAffected} rows across ${tablesAffected.length} tables.`,
        tablesAffected: tablesAffected.length,
        rowsAffected: totalRowsAffected,
        durationSeconds,
        excludedCount: excludedPlayers.length,
      });
    } catch (error) {
      if (connection) await connection.rollback();

      try {
        await db.query(
          `INSERT INTO wipe_history (executed_by, reason, success, error_message, ip_address)
           VALUES (?, ?, 0, ?, ?)`,
          [req.user!.accountName, reason, getErrorMessage(error), req.ip],
        );
      } catch (logError) {
        logger.error('Failed to log wipe error:', logError);
      }

      logger.error('Error executing player wipe:', error);
      return res
        .status(500)
        .json({ error: getErrorMessage(error) || 'Failed to execute player wipe' });
    } finally {
      if (connection) connection.release();
    }
  },
);

/**
 * POST /api/admin/mud/wipe/guilds
 * Delete all guild forum categories. GuildSync will recreate them on next tick.
 * Requires: Overlord (Level 61+)
 */
adminWipeRoutes.post(
  '/mud/wipe/guilds',
  requireAuth,
  requireOverlord,
  [
    body('reason')
      .isString()
      .isLength({ min: 10 })
      .withMessage('Reason must be at least 10 characters'),
    body('confirmation').equals('WIPE').withMessage('Confirmation text must be "WIPE"'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { reason } = req.body;

    try {
      const [result] = await db.query<any>(
        `DELETE FROM forum_categories WHERE access_type = 'guild'`,
      );
      const rowsDeleted = result.affectedRows || 0;

      await db.query(
        `INSERT INTO admin_action_log
         (account_name, action_type, target, old_value, new_value, notes, ip_address)
         VALUES (?, 'guild_wipe', 'forum_categories', ?, ?, ?, ?)`,
        [req.user!.accountName, `${rowsDeleted} rows`, 'deleted', reason, req.ip],
      );

      return res.json({
        success: true,
        message: `Deleted ${rowsDeleted} guild categories. Guild sync will recreate them shortly.`,
        rowsDeleted,
      });
    } catch (error) {
      logger.error('Error executing guild wipe:', error);
      return res
        .status(500)
        .json({ error: getErrorMessage(error) || 'Failed to execute guild wipe' });
    }
  },
);

import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { pool } from '../../db/connection.js';
import { writeZoneResets } from '../../services/zoneBuilderWriter.js';
import { MudFlagParser } from '../../services/mudFlagParser.js';
import type { RowDataPacket } from 'mysql2';
import type { ResetCommand } from '../../types/builder.js';
import { logBuilderActivity } from './shared.js';
import { sendRouteError } from '../../utils/routeError.js';

export const builderResetFlagRoutes: IRouter = Router();

// =============================================================================
// ZONE RESETS
// =============================================================================

// PUT /api/builder/zones/:id/resets - Save all reset commands (atomic replacement)
builderResetFlagRoutes.put('/zones/:id/resets', async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.id;
    const { resets } = req.body as { resets: ResetCommand[] };

    if (!zoneId || zoneId.trim() === '') {
      res.status(400).json({ error: 'Invalid zone ID' });
      return;
    }

    if (!Array.isArray(resets)) {
      res.status(400).json({ error: 'resets must be an array' });
      return;
    }

    // Validate each reset command has required fields
    const validCommands = ['M', 'O', 'G', 'E', 'P', 'D', 'F', 'R'];
    for (let i = 0; i < resets.length; i++) {
      const reset = resets[i];
      if (!validCommands.includes(reset.command)) {
        res.status(400).json({ error: `Invalid command "${reset.command}" at index ${i}` });
        return;
      }
      if (
        typeof reset.ifFlag !== 'number' ||
        typeof reset.arg1 !== 'number' ||
        typeof reset.arg2 !== 'number' ||
        typeof reset.arg3 !== 'number'
      ) {
        res.status(400).json({ error: `Invalid arguments at index ${i}` });
        return;
      }
    }

    // Write resets to file
    await writeZoneResets(zoneId, resets);

    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'reset_update',
      zoneId,
      null,
      'reset',
      null, // No single VNUM for resets
      `${resets.length} commands`,
      req.ip || req.socket.remoteAddress || null,
    );

    res.json({
      success: true,
      resetCount: resets.length,
    });
  } catch (error) {
    logger.error('Error saving resets:', error);
    sendRouteError(res, error, 'Failed to save resets', 'Failed to save resets');
  }
});

// GET /api/builder/flags - Get all flag definitions from database
builderResetFlagRoutes.get('/flags', async (_req: Request, res: Response) => {
  try {
    // Fetch all flags from database grouped by category
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT category, name, value, description, ansi_name, short_code, editable, sort_order
       FROM builder_flags
       ORDER BY category, sort_order, name`,
    );

    // Group flags by category
    const flagsByCategory: Record<
      string,
      Array<{
        name: string;
        value: number;
        description?: string;
        ansiName?: string;
        shortCode?: string;
        editable?: number;
      }>
    > = {};

    for (const row of rows) {
      if (!flagsByCategory[row.category]) {
        flagsByCategory[row.category] = [];
      }
      flagsByCategory[row.category].push({
        name: row.name,
        value: Number(row.value),
        description: row.description || undefined,
        ansiName: row.ansi_name || undefined,
        shortCode: row.short_code || undefined,
        editable: row.editable,
      });
    }

    // Map database categories to frontend property names
    const categoryMapping: Record<string, string> = {
      obj_wear: 'objWearFlags',
      obj_extra: 'objExtraFlags',
      obj_extra2: 'objExtra2Flags',
      obj_type: 'objectTypes',
      obj_apply: 'objApplyTypes',
      obj_craftsmanship: 'objCraftsmanship',
      obj_material: 'objMaterials',
      // Note: ITEM_ANTI_*, ITEM_ANTI2_*, ITEM_ALLOW2_* are commented out in defines.h - not in use
      weapon_type: 'objWeaponTypes',
      weapon_damage: 'objWeaponDamageTypes',
      room_flags: 'roomFlags',
      room_sector: 'sectorTypes',
      exit_flags: 'doorFlags',
      mob_action: 'mobActFlags',
      mob_action2: 'mobActFlags2',
      mob_aggro: 'mobAggroFlags',
      mob_aggro2: 'mobAggroFlags2',
      mob_class: 'mobClasses',
      mob_race: 'mobRaces',
      mob_affected1: 'mobAffFlags',
      mob_affected2: 'mobAffFlags2',
      mob_affected3: 'mobAffFlags3',
      mob_affected4: 'mobAffFlags4',
      mob_affected5: 'mobAffFlags5',
      player_flags: 'playerFlags',
      player2_flags: 'playerFlags2',
    };

    // Build response object
    const response: Record<string, any> = {};
    for (const [dbCategory, frontendKey] of Object.entries(categoryMapping)) {
      response[frontendKey] = flagsByCategory[dbCategory] || [];
    }

    // Include any categories not in the mapping (for extensibility)
    for (const [category, flags] of Object.entries(flagsByCategory)) {
      if (!categoryMapping[category]) {
        response[category] = flags;
      }
    }

    // Also provide affected flags under mobAffected1-4 naming for object bitvectors
    // (Object bitvectors use the same flags as mob affected_by)
    response.mobAffected1 = flagsByCategory['mob_affected1'] || [];
    response.mobAffected2 = flagsByCategory['mob_affected2'] || [];
    response.mobAffected3 = flagsByCategory['mob_affected3'] || [];
    response.mobAffected4 = flagsByCategory['mob_affected4'] || [];

    res.json(response);
  } catch (error) {
    logger.error('Error fetching flags:', error);
    sendRouteError(res, error, 'Failed to fetch flags', 'Failed to fetch flags');
  }
});

// POST /api/builder/flags/sync - Sync flags from MUD source code to database
builderResetFlagRoutes.post('/flags/sync', async (req: Request, res: Response) => {
  try {
    const parser = new MudFlagParser();
    const results = await parser.parseAllFlags();

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalDeleted = 0;

    // Track which categories we're updating
    const parsedCategories = new Set<string>();

    // Get a connection for transaction
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      for (const result of results) {
        if (result.flags.length === 0) continue;

        parsedCategories.add(result.category);

        // Get existing flag names for this category
        const [existingFlags] = await connection.query<RowDataPacket[]>(
          `SELECT name FROM builder_flags WHERE category = ?`,
          [result.category],
        );
        const existingFlagNames = new Set(existingFlags.map((f) => f.name));
        const parsedFlagNames = new Set(result.flags.map((f) => f.name));

        // Batch upsert using INSERT ... ON DUPLICATE KEY UPDATE
        // Process in batches of 50 to avoid query size limits
        const BATCH_SIZE = 50;
        for (let batch = 0; batch < result.flags.length; batch += BATCH_SIZE) {
          const batchFlags = result.flags.slice(batch, batch + BATCH_SIZE);

          const values: unknown[] = [];
          const placeholders: string[] = [];

          batchFlags.forEach((flag, idx) => {
            const sortOrder = batch + idx;
            placeholders.push('(?, ?, ?, ?, ?, ?, 1, ?, ?)');
            values.push(
              result.category,
              flag.name,
              flag.value,
              flag.description || null,
              flag.ansiName || null,
              flag.shortCode || null,
              sortOrder,
              flag.sourceFile || result.sourceFile,
            );
          });

          await connection.query(
            `INSERT INTO builder_flags
             (category, name, value, description, ansi_name, short_code, editable, sort_order, source_file)
             VALUES ${placeholders.join(', ')}
             ON DUPLICATE KEY UPDATE
               value = VALUES(value),
               description = VALUES(description),
               ansi_name = VALUES(ansi_name),
               short_code = VALUES(short_code),
               sort_order = VALUES(sort_order),
               source_file = VALUES(source_file),
               updated_at = NOW()`,
            values,
          );
        }

        // Count new vs existing
        for (const flag of result.flags) {
          if (existingFlagNames.has(flag.name)) {
            totalUpdated++;
          } else {
            totalInserted++;
          }
        }

        // Delete flags that no longer exist in source
        const toDelete = [...existingFlagNames].filter((name) => !parsedFlagNames.has(name));
        if (toDelete.length > 0) {
          await connection.query(`DELETE FROM builder_flags WHERE category = ? AND name IN (?)`, [
            result.category,
            toDelete,
          ]);
          totalDeleted += toDelete.length;
        }
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    // Log the sync action (system-level, not shown in activity feed)
    await logBuilderActivity(
      req.user?.accountName || 'unknown',
      'flags_sync',
      'system',
      null,
      'system',
      null,
      `${totalInserted} inserted, ${totalUpdated} updated, ${totalDeleted} deleted`,
      req.ip || req.socket.remoteAddress || null,
    );

    res.json({
      success: true,
      stats: {
        inserted: totalInserted,
        updated: totalUpdated,
        deleted: totalDeleted,
        categories: Array.from(parsedCategories),
      },
    });
  } catch (error) {
    logger.error('Error syncing flags:', error);
    sendRouteError(res, error, 'Failed to sync flags', 'Failed to sync flags');
  }
});

// GET /api/builder/flags/categories - Get list of all flag categories
builderResetFlagRoutes.get('/flags/categories', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT category, COUNT(*) as count, MAX(updated_at) as lastUpdated
       FROM builder_flags
       GROUP BY category
       ORDER BY category`,
    );

    res.json(
      rows.map((r) => ({
        category: r.category,
        count: r.count,
        lastUpdated: r.lastUpdated,
      })),
    );
  } catch (error) {
    logger.error('Error fetching flag categories:', error);
    sendRouteError(res, error, 'Failed to fetch categories', 'Failed to fetch categories');
  }
});

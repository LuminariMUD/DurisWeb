/**
 * Sync Builder Flags Script
 * Parses flag definitions from MUD source and inserts into builder_flags table
 */

import { MudFlagParser } from '../services/mudFlagParser.js';
import { pool } from '../db/connection.js';
import logger from '../utils/logger.js';

async function syncFlags() {
  logger.info('Starting builder flags sync...');

  // Parse and validate the whole generation before touching published rows.
  const parser = new MudFlagParser();
  const results = await parser.parseAllFlags();

  const rows: unknown[][] = [];
  for (const result of results) {
    if (result.flags.length === 0) {
      logger.info(`  ${result.category}: 0 flags (skipped)`);
      continue;
    }

    // Track seen names to handle duplicates
    const seenNames = new Set<string>();
    const values = result.flags
      .filter((flag) => {
        if (seenNames.has(flag.name)) {
          return false; // Skip duplicates
        }
        seenNames.add(flag.name);
        return true;
      })
      .map((flag, index) => [
        result.category,
        flag.name,
        flag.value,
        flag.description || null,
        flag.ansiName || null,
        flag.shortCode || null,
        1, // editable
        index, // sort_order
      ]);

    if (values.length === 0) {
      logger.info(`  ${result.category}: 0 flags (all duplicates)`);
      continue;
    }

    rows.push(...values);
    logger.info(`  ${result.category}: ${values.length} flags`);
  }

  if (rows.length === 0) {
    throw new Error('refusing to publish an empty builder_flags generation');
  }

  // Replace the published generation atomically so a failed load leaves the
  // previous flags fully queryable (docs/ongoing-projects/ongoing.md, P1-F).
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM builder_flags');
    await connection.query(
      `INSERT INTO builder_flags (category, name, value, description, ansi_name, short_code, editable, sort_order)
       VALUES ?`,
      [rows],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  logger.info(`\nSync complete! Published ${rows.length} flags.`);
  process.exit(0);
}

syncFlags().catch((err) => {
  logger.error('Sync failed:', err);
  process.exit(1);
});

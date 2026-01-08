/**
 * Sync Builder Flags Script
 * Parses flag definitions from MUD source and inserts into builder_flags table
 */

import { MudFlagParser } from '../services/mudFlagParser.js';
import { pool } from '../db/connection.js';
import logger from '../utils/logger.js';

async function syncFlags() {
  logger.info('Starting builder flags sync...');

  const parser = new MudFlagParser();
  const results = await parser.parseAllFlags();

  // Clear existing flags
  logger.info('Clearing existing flags...');
  await pool.query('DELETE FROM builder_flags');

  // Insert new flags
  let totalInserted = 0;
  for (const result of results) {
    if (result.flags.length === 0) {
      logger.info(`  ${result.category}: 0 flags (skipped)`);
      continue;
    }

    // Track seen names to handle duplicates
    const seenNames = new Set<string>();
    const values = result.flags
      .filter(flag => {
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

    await pool.query(
      `INSERT INTO builder_flags (category, name, value, description, ansi_name, short_code, editable, sort_order)
       VALUES ?`,
      [values]
    );

    logger.info(`  ${result.category}: ${result.flags.length} flags`);
    totalInserted += result.flags.length;
  }

  logger.info(`\nSync complete! Inserted ${totalInserted} flags.`);
  process.exit(0);
}

syncFlags().catch((err) => {
  logger.error('Sync failed:', err);
  process.exit(1);
});

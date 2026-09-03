/**
 * Sync Builder Flags Script
 * Parses flag definitions from MUD source and inserts into builder_flags table
 */

import { MudFlagParser } from '../services/mudFlagParser.js';
import { pool } from '../db/connection.js';
import logger from '../utils/logger.js';

const PUBLISH_BATCH_SIZE = 500;

interface StagedFlag {
  category: string;
  name: string;
  value: number;
  description: string | null;
  ansiName: string | null;
  shortCode: string | null;
  sortOrder: number;
  sourceFile: string | null;
}

async function syncFlags() {
  logger.info('Starting builder flags sync...');

  // Parse and validate the whole generation before touching published rows.
  const parser = new MudFlagParser();
  const results = await parser.parseAllFlags();

  const stagedFlags: StagedFlag[] = [];
  const publishedCategories = new Set<string>();

  for (const result of results) {
    if (result.flags.length === 0) {
      logger.info(`  ${result.category}: 0 flags (skipped)`);
      continue;
    }

    // Track seen names to handle duplicates
    const seenNames = new Set<string>();
    const categoryFlags: StagedFlag[] = [];

    for (const flag of result.flags) {
      if (seenNames.has(flag.name)) {
        continue; // Skip duplicates
      }
      seenNames.add(flag.name);

      categoryFlags.push({
        category: result.category,
        name: flag.name,
        value: flag.value,
        description: flag.description || null,
        ansiName: flag.ansiName || null,
        shortCode: flag.shortCode || null,
        sortOrder: categoryFlags.length,
        sourceFile: flag.sourceFile || result.sourceFile || null,
      });
    }

    if (categoryFlags.length === 0) {
      logger.info(`  ${result.category}: 0 flags (all duplicates)`);
      continue;
    }

    stagedFlags.push(...categoryFlags);
    publishedCategories.add(result.category);
    logger.info(`  ${result.category}: ${categoryFlags.length} flags`);
  }

  if (stagedFlags.length === 0) {
    throw new Error('refusing to publish an empty builder_flags generation');
  }

  const categoriesToUpdate = [...publishedCategories];

  // Replace the published generation atomically so a failed load leaves the
  // previous flags fully queryable (docs/ongoing-projects/ongoing.md, P1-F).
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Preserve existing editable flags for the categories being published
    const [existingRows] = await connection.query<any[]>(
      'SELECT category, name, editable FROM builder_flags WHERE category IN (?)',
      [categoriesToUpdate],
    );
    const existingEditable = new Map<string, number>();
    for (const row of existingRows) {
      existingEditable.set(`${row.category}:${row.name}`, Number(row.editable));
    }

    // Delete only the non-empty categories that are being republished
    await connection.query('DELETE FROM builder_flags WHERE category IN (?)', [categoriesToUpdate]);

    const rows = stagedFlags.map((flag) => {
      const key = `${flag.category}:${flag.name}`;
      const editable = existingEditable.get(key) ?? 1;
      return [
        flag.category,
        flag.name,
        flag.value,
        flag.description,
        flag.ansiName,
        flag.shortCode,
        editable,
        flag.sortOrder,
        flag.sourceFile,
      ];
    });

    for (let offset = 0; offset < rows.length; offset += PUBLISH_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + PUBLISH_BATCH_SIZE);
      await connection.query(
        `INSERT INTO builder_flags (category, name, value, description, ansi_name, short_code, editable, sort_order, source_file)
         VALUES ?`,
        [batch],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  logger.info(
    `\nSync complete! Published ${stagedFlags.length} flags across ${categoriesToUpdate.length} categories.`,
  );
  process.exit(0);
}

syncFlags().catch((err) => {
  logger.error('Sync failed:', err);
  process.exit(1);
});

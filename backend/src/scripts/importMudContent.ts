#!/usr/bin/env tsx
import * as fs from 'fs/promises';
import * as path from 'path';
import { pool } from '../db/connection.js';
import logger, { isErrorWithCode, getErrorMessage } from '../utils/logger.js';
import { getBackendConfiguration } from '../config/environment.js';

const MUD_DIR = getBackendConfiguration().mud.directory;
const MUD_INFO_DIR = `${MUD_DIR}/lib/information`;

interface ContentFile {
  key: string;
  filename: string;
  description: string;
}

const CONTENT_FILES: ContentFile[] = [
  { key: 'rules', filename: 'rules', description: 'MUD Rules and Bug Policy' },
  { key: 'credits', filename: 'credits', description: 'Zone Credits by Creator' },
  { key: 'info', filename: 'info', description: 'Information Menu System' },
  { key: 'wizlist', filename: 'wizlist', description: 'Current Overlords/Gods Hierarchy' },
  { key: 'faq', filename: 'faq', description: 'Frequently Asked Questions' },
];

async function importContent() {
  logger.info('Starting MUD content import from flatfiles...\n');

  for (const { key, filename, description } of CONTENT_FILES) {
    const filePath = path.join(MUD_INFO_DIR, filename);

    try {
      // Check if file exists
      await fs.access(filePath);

      // Read file content (latin1 encoding to handle ISO-8859 characters)
      const buffer = await fs.readFile(filePath);
      const content = buffer.toString('latin1');

      if (!content || content.trim().length === 0) {
        logger.info(`Skipping ${key} (${filename}) - empty file`);
        continue;
      }

      // Insert or update in database
      const [result] = await pool.query<any>('UPDATE mud_info SET content = ? WHERE name = ?', [
        content,
        key,
      ]);

      if (result.affectedRows === 0) {
        await pool.query('INSERT INTO mud_info (name, content) VALUES (?, ?)', [key, content]);
        logger.info(`Imported ${key} (${filename}) - ${description}`);
        logger.info(`   Size: ${content.length} bytes\n`);
      } else {
        logger.info(`Updated ${key} (${filename}) - ${description}`);
        logger.info(`   Size: ${content.length} bytes\n`);
      }
    } catch (error) {
      if (isErrorWithCode(error) && error.code === 'ENOENT') {
        logger.info(`File not found: ${filePath}\n`);
      } else {
        logger.error(`Error importing ${key}:`, getErrorMessage(error), '\n');
      }
    }
  }

  logger.info('Import complete!');
  await pool.end();
}

// Run the import
importContent().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});

/**
 * Generate static map images for all layers and upload to R2
 * Run with: npx tsx scripts/generate-maps.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { generateMapImage } from '../src/services/wikiService.js';
import { uploadMapImage, isR2Configured } from '../src/services/r2Service.js';
import { closeDatabaseConnection } from '../src/db/connection.js';
import { closeRedisConnection } from '../src/db/redis.js';

async function main() {
  console.log('Generating and uploading map images to R2...');

  if (!isR2Configured()) {
    console.error('R2 is not configured. Check your .env file.');
    process.exit(1);
  }

  const layers = [0, -1, -2];

  try {
    for (const layer of layers) {
      console.log(`  Generating layer ${layer}...`);
      const pngBuffer = await generateMapImage(layer, 4);

      console.log(`  Uploading layer ${layer} (${(pngBuffer.length / 1024).toFixed(1)} KB)...`);
      const url = await uploadMapImage(pngBuffer, layer);

      console.log(`  Uploaded: ${url}`);
    }

    console.log('\nDone!');
  } catch (error) {
    console.error('Failed to generate maps:', error);
  } finally {
    await closeDatabaseConnection();
    await closeRedisConnection();
    process.exit(0);
  }
}

main();

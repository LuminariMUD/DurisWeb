import { closeDatabaseConnection } from '../db/connection.js';
import { bootstrapForumCategories } from '../services/forumBootstrap.js';

async function main(): Promise<void> {
  try {
    const inserted = await bootstrapForumCategories();
    console.log(`Forum bootstrap complete (${inserted.length} approved categories inserted).`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown bootstrap failure';
    console.error(`Forum bootstrap failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnection();
  }
}

await main();

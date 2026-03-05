import { startScheduler } from './jobs/scheduler.js';
import { pool } from './lib/db.js';
import { regenerateMicroPosts, runWeeklyPipeline } from './services/pipeline.js';

async function main() {
  const cmd = process.argv[2] || 'run-once';
  try {
    if (cmd === 'run-once' || cmd === 'weekly') {
      const result = await runWeeklyPipeline();
      console.log('[done] issue created', result);
    } else if (cmd === 'micro') {
      const posts = await regenerateMicroPosts();
      console.log('[done] micro posts generated', posts.length);
    } else {
      console.error(`Unknown command: ${cmd}`);
      process.exitCode = 1;
    }
    startScheduler();
  } catch (error) {
    console.error('[fatal]', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

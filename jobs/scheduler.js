import cron from 'node-cron';
import { config } from '../lib/config.js';
import { regenerateMicroPosts, runWeeklyPipeline } from '../services/pipeline.js';

export function startScheduler() {
  if (config.ENABLE_CRON !== 'true') {
    console.log('[cron] disabled (ENABLE_CRON=false)');
    return;
  }

  cron.schedule('0 18 * * 0', async () => {
    console.log('[cron] weekly pipeline triggered');
    await runWeeklyPipeline();
  }, { timezone: config.TIMEZONE });

  cron.schedule('0 9 * * 1-5', async () => {
    console.log('[cron] micro-post generation triggered');
    await regenerateMicroPosts();
  }, { timezone: config.TIMEZONE });

  console.log('[cron] scheduler started');
}

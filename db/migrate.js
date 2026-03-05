import fs from 'fs/promises';
import { pool } from '../lib/db.js';

async function migrate() {
  try {
    const sql = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf-8');
    await pool.query(sql);
    console.log('[migrate] schema applied');
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});

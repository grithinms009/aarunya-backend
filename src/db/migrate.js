/* Applies schema.sql. With --reset it drops the public schema first, which is what
   db:reset does for local development. */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const reset = process.argv.includes('--reset');
  if (reset) {
    console.log('dropping public schema');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }

  const { rows } = await pool.query(
    `SELECT to_regclass('public.app_user') AS t`,
  );
  if (rows[0].t && !reset) {
    console.log('schema already present — nothing to do (use --reset to rebuild)');
    await pool.end();
    return;
  }

  await pool.query(readFileSync(join(here, 'schema.sql'), 'utf8'));
  console.log('schema applied');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

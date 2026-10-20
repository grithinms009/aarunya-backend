/* Applies schema.sql. With --reset it drops the public schema first, which is what
   db:reset does for local development. */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';
import { snapshot, rowCounts } from '../../scripts/snapshot.mjs';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const reset = process.argv.includes('--reset');
  if (reset) {
    /* Always snapshot first. A reset is unrecoverable otherwise, and the script cannot
       tell a throwaway test database from a store someone has spent a day filling in. */
    const before = rowCounts();
    const file = snapshot('pre-reset');
    const hasContent = before.products || before.categories || before.orders;
    if (hasContent) {
      console.log(
        `about to clear ${before.products} product(s), ${before.categories} categor(ies) ` +
        `and ${before.orders} order(s)`,
      );
      if (file) console.log(`saved first to ${file} — restore with: npm run db:restore -- ${file}`);
    }

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

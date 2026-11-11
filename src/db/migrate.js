/* Applies schema.sql. With --reset it drops the public schema first, which is what
   db:reset does for local development. */
import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
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
  if (!rows[0].t) {
    await pool.query(readFileSync(join(here, 'schema.sql'), 'utf8'));
    console.log('schema applied');
  } else {
    console.log('base schema already present');
  }

  /* Numbered, additive migrations. Each runs once, in its own transaction, and is recorded.
     An existing store is upgraded in place: nothing is dropped or rewritten. Take a backup
     first (npm run db:snapshot). */
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = join(here, 'migrations');
  const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f) && !f.endsWith('.down.sql')).sort();
  for (const f of files) {
    const name = f.replace(/\.sql$/, '');
    const done = await pool.query(`SELECT 1 FROM schema_migration WHERE name = $1`, [name]);
    if (done.rows.length) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(readFileSync(join(dir, f), 'utf8'));
      await client.query(`INSERT INTO schema_migration (name) VALUES ($1)`, [name]);
      await client.query('COMMIT');
      console.log(`migration applied: ${name}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

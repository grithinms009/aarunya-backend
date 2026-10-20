/* Dumps the current database to backups/ before anything destructive runs.
 *
 * db:reset drops every table. That is fine for a throwaway test database and
 * catastrophic for a store someone has been filling in by hand, and the script cannot
 * tell the two apart. So a snapshot is taken first, always.
 *
 * Restore with:  npm run db:restore -- backups/<file>.sql
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'backups');
const CONTAINER = process.env.PG_CONTAINER || 'aarunya-postgres';
const USER = process.env.PG_USER || 'aarunya';
const DB = process.env.PG_DB || 'aarunya';

export function snapshot(label = 'auto') {
  mkdirSync(DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(DIR, `${stamp}-${label}.sql`);

  let dump;
  try {
    dump = execFileSync('docker', ['exec', CONTAINER, 'pg_dump', '-U', USER, DB], {
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (e) {
    /* No container, no database yet, or docker not running — nothing to protect. */
    console.warn('snapshot skipped:', String(e.message).split('\n')[0]);
    return null;
  }

  writeFileSync(file, dump);
  return file;
}

/** How much real content is about to be lost, so the caller can say so out loud. */
export function rowCounts() {
  try {
    const out = execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', USER, '-d', DB,
      '-t', '-A', '-c',
      `SELECT (SELECT count(*) FROM product) || ' ' || (SELECT count(*) FROM category)
         || ' ' || (SELECT count(*) FROM "order")`], { encoding: 'utf8' });
    const [products, categories, orders] = out.trim().split(' ').map(Number);
    return { products, categories, orders };
  } catch {
    return { products: 0, categories: 0, orders: 0 };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = snapshot(process.argv[2] || 'manual');
  console.log(f ? `saved ${f}` : 'nothing to snapshot');
  const kept = readdirSync(DIR).filter((x) => x.endsWith('.sql'));
  console.log(`${kept.length} snapshot(s) in backups/, ` +
    `${(kept.reduce((t, x) => t + statSync(join(DIR, x)).size, 0) / 1024).toFixed(0)} KB total`);
}

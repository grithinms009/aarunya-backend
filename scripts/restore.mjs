/* Restores a snapshot taken by scripts/snapshot.mjs.
 * Usage: npm run db:restore -- backups/<file>.sql */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: npm run db:restore -- backups/<file>.sql');
  process.exit(2);
}
const CONTAINER = process.env.PG_CONTAINER || 'aarunya-postgres';
const USER = process.env.PG_USER || 'aarunya';
const DB = process.env.PG_DB || 'aarunya';

execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', USER, '-d', DB, '-c',
  'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'], { stdio: 'inherit' });
execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', USER, '-d', DB],
  { input: readFileSync(file), stdio: ['pipe', 'inherit', 'inherit'] });
console.log(`restored ${file}`);

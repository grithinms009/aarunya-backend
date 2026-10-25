/* Re-derives each manifest entry's review state from the catalogue itself.
 *
 * The manifest records intent; the database records what actually happened. If the two
 * ever disagree — a manifest rebuilt from scratch, a product published by hand in the
 * admin — this makes the manifest tell the truth again, by asking the database.
 *
 *   node catalogue/reconcile.mjs           # report differences
 *   node catalogue/reconcile.mjs --yes     # write them back
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../src/db/pool.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--yes');
const m = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));

const { rows } = await query(
  `SELECT p.slug, p.status, v.stock FROM product p JOIN variant v ON v.product_id = p.id`);
const live = new Map(rows.map((r) => [r.slug, r]));

const changes = [];
for (const p of m.products) {
  const row = live.get(p.slug);
  const both = existsSync(join(HERE, p.images.front)) && existsSync(join(HERE, p.images.onModel));

  let state = 'GENERATED', verified = false, status = 'draft', stock = 0;
  if (row && row.status === 'active') { state = 'PUBLISHED'; verified = true; status = 'active'; stock = row.stock; }
  else if (row) { state = 'APPROVED'; }       /* seeded, still a draft */
  else if (both) { state = p.reviewState === 'APPROVED' ? 'APPROVED' : p.reviewState; }

  if (state !== p.reviewState || verified !== p.verified) {
    changes.push(`${p.sku.padEnd(15)}${p.reviewState} -> ${state}`);
    if (apply) { p.reviewState = state; p.verified = verified; p.status = status; p.stock = stock; }
  }
}

if (apply) writeFileSync(join(HERE, 'manifest.json'), JSON.stringify(m, null, 2));
console.log(`${changes.length} entr(ies) ${apply ? 'corrected' : 'out of step with the catalogue'}`);
for (const c of changes) console.log('  ' + c);
if (!apply && changes.length) console.log('\nre-run with --yes to write them back.');
process.exit(0);

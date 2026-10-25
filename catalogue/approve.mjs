/* Moves manifest entries to APPROVED so seed-drafts.mjs will create them.
 *
 * Only a product whose Front and On-model files are both on disk can be approved: the
 * state means "the images are here and they have been looked at", and seeding without
 * them would make a product with no photographs.
 *
 * This writes manifest.json in place rather than going through build-manifest.mjs, so a
 * later rebuild of the manifest resets every review state to GENERATED on purpose —
 * approval follows the current images, never a stale decision.
 *
 *   node catalogue/approve.mjs           # report what is approvable
 *   node catalogue/approve.mjs --yes     # mark them APPROVED
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--yes');
const m = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));

const ready = [], waiting = [];
for (const p of m.products) {
  const both = existsSync(join(HERE, p.images.front)) && existsSync(join(HERE, p.images.onModel));
  /* Review states only move forward. A published product is already past approval, and
     re-approving it would lose the record that it is live. */
  if (p.reviewState === 'PUBLISHED') continue;
  (both ? ready : waiting).push(p);
  if (both && apply) p.reviewState = 'APPROVED';
}

if (apply) writeFileSync(join(HERE, 'manifest.json'), JSON.stringify(m, null, 2));
console.log(`${ready.length} product(s) have both images${apply ? ' — marked APPROVED' : ' and can be approved'}`);
for (const p of ready) console.log(`  ${p.sku.padEnd(15)}${p.productName}`);
console.log(`\n${waiting.length} still waiting on images`);
if (!apply) console.log('\nre-run with --yes to approve.');

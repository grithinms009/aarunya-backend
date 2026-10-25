/* Checks the manifest against the live database before anything is generated or seeded.
 *
 * Everything here is read-only. It exits non-zero on any error, so it can gate the
 * image pipeline and the seed script. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../src/db/pool.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));

const errors = [];
const warns = [];

/* ---- what the database actually holds ---- */
const cats = new Map((await query(`SELECT slug, name FROM category`)).rows.map((r) => [r.slug, r.name]));
const subs = new Set((await query(`SELECT category_slug, slug FROM sub_category`)).rows
  .map((r) => `${r.category_slug}/${r.slug}`));
const liveSkus = new Set((await query(`SELECT sku FROM variant`)).rows.map((r) => r.sku));
const liveSlugs = new Set((await query(`SELECT slug FROM product`)).rows.map((r) => r.slug));
const liveNames = new Set((await query(`SELECT lower(name) n FROM product`)).rows.map((r) => r.n));

/* ---- wording that may not be used until the merchant confirms it ---- */
const UNVERIFIABLE = /stainless steel|gold[- ]plated|gold plating|anti[- ]tarnish|nickel[- ]free|waterproof|hypoallergenic|sterling|\b(18|22|24)\s*k\b|genuine (pearl|gem|diamond)/i;

const seenSku = new Set(), seenSlug = new Set();

for (const p of m.products) {
  const at = `${p.sku} ${p.productName}`;

  if (!cats.has(p.category)) errors.push(`${at}: category "${p.category}" does not exist`);
  if (p.subCategory && !subs.has(`${p.category}/${p.subCategory}`))
    errors.push(`${at}: sub-category "${p.subCategory}" is not under ${p.category}`);

  /* Once published, the live row IS this entry — only an unpublished entry can clash. */
  const published = p.reviewState === 'PUBLISHED';
  if (!published && liveSkus.has(p.sku)) errors.push(`${at}: SKU already used by a live product`);
  if (seenSku.has(p.sku)) errors.push(`${at}: SKU repeated inside the manifest`);
  seenSku.add(p.sku);

  if (!published && liveSlugs.has(p.slug)) errors.push(`${at}: slug already used by a live product`);
  if (seenSlug.has(p.slug)) errors.push(`${at}: slug repeated inside the manifest`);
  seenSlug.add(p.slug);

  if (!published && liveNames.has(p.productName.toLowerCase()))
    errors.push(`${at}: name duplicates an existing product`);

  if (!/^AJ-[A-Z]{2}\d{3}-[A-Z]{3}$/.test(p.sku)) errors.push(`${at}: SKU is off-format`);

  if (p.sellingPrice < 299 || p.sellingPrice > 699)
    errors.push(`${at}: price ${p.sellingPrice} is outside the agreed 299-699 band`);
  if (p.mrp !== p.sellingPrice)
    errors.push(`${at}: MRP ${p.mrp} differs from price ${p.sellingPrice} — that invents a discount`);

  /* An unverified concept must never be purchasable. */
  if (!p.verified) {
    if (p.status !== 'draft') errors.push(`${at}: unverified but status is "${p.status}"`);
    if (p.stock !== 0) errors.push(`${at}: unverified but carries stock ${p.stock}`);
    if (p.newArrival || p.bestSeller) errors.push(`${at}: unverified but flagged for a homepage row`);
  }

  for (const [field, text] of [['material', p.material], ['finish', p.finish],
                               ['description', p.description], ['productName', p.productName]]) {
    const hit = UNVERIFIABLE.exec(text || '');
    if (hit) errors.push(`${at}: ${field} claims "${hit[0]}", which nobody has verified`);
  }

  if (!p.sourcePhoto) warns.push(`${at}: no merchant reference photo — concept only`);
}

const total = Object.values(m.counts).reduce((a, b) => a + b, 0);
if (total !== m.products.length) errors.push(`counts say ${total} but there are ${m.products.length} entries`);

console.log(`checked ${m.products.length} proposed entries against the live database`);
console.log(`  categories in db: ${cats.size}   sub-categories: ${subs.size}   live SKUs: ${liveSkus.size}`);
if (warns.length) console.log(`\n${warns.length} unverified (expected — none has a reference photo)`);
if (errors.length) {
  console.log(`\n${errors.length} ERROR(S):`);
  for (const e of errors) console.log('  ' + e);
  process.exit(1);
}
console.log('\nall checks passed');
process.exit(0);

/* Seeds approved manifest entries into the catalogue as drafts.
 *
 * Goes through the admin API the product form itself uses, so every validation rule
 * applies. Nothing is written to the database directly.
 *
 * Three gates, all of which must pass before a product is created:
 *
 *   1. reviewState must be APPROVED. GENERATED and NEEDS_REVIEW are skipped.
 *   2. Both images must exist on disk and upload successfully.
 *   3. The slug must be free, so a second run creates nothing it created before.
 *
 * Every product is written as status draft with stock 0, whatever the manifest says,
 * because an unverified concept must never be publicly purchasable. Publishing is a
 * separate, deliberate act in the admin once Veena confirms the piece is real.
 *
 *   node catalogue/seed-drafts.mjs            # report what would happen
 *   node catalogue/seed-drafts.mjs --yes      # create the approved drafts
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = process.env.API_ORIGIN || 'http://localhost:4000';
const EMAIL = process.env.SEED_ADMIN_EMAIL || 'veena@aarunyajewels.in';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'aarunya123';

const apply = process.argv.includes('--yes');
const m = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));

let cookies = {}, csrf = '';
const jar = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, { method, headers: {
    'content-type': 'application/json',
    ...(jar() ? { cookie: jar() } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';'); const i = kv.indexOf('=');
    cookies[kv.slice(0, i)] = kv.slice(i + 1);
    if (kv.slice(0, i) === 'aj_csrf') csrf = kv.slice(i + 1);
  }
  const text = await res.text(); let json;
  try { json = JSON.parse(text) } catch { json = text }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

const upload = async (file, name) => {
  const b64 = readFileSync(file).toString('base64');
  const type = file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  const r = await call('/api/admin/uploads', { method: 'POST',
    body: { data: `data:${type};base64,${b64}`, purpose: 'product', name } });
  return r.url;
};

await call('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });

/* Already in the catalogue — the idempotency check. */
const live = await call('/api/admin/products');
const rows = live.items ?? live.rows ?? live;
const haveSlug = new Set(rows.map((p) => p.slug));
const haveSku = new Set(rows.flatMap((p) => (p.variants ?? []).map((v) => v.sku)));

const skipped = { notApproved: 0, noImages: 0, exists: 0, skuClash: 0 };
const todo = [];

for (const p of m.products) {
  if (p.reviewState !== 'APPROVED') { skipped.notApproved++; continue; }
  if (haveSlug.has(p.slug)) { skipped.exists++; continue; }
  if (haveSku.has(p.sku)) { skipped.skuClash++; continue; }
  const front = join(HERE, p.images.front);
  const model = join(HERE, p.images.onModel);
  if (!existsSync(front) || !existsSync(model)) { skipped.noImages++; continue; }
  todo.push({ p, front, model });
}

console.log(`manifest: ${m.products.length} entries`);
console.log(`  skipped, not APPROVED yet : ${skipped.notApproved}`);
console.log(`  skipped, images missing   : ${skipped.noImages}`);
console.log(`  skipped, already seeded   : ${skipped.exists}`);
console.log(`  skipped, SKU taken        : ${skipped.skuClash}`);
console.log(`  ready to create as drafts : ${todo.length}`);

if (!todo.length) { console.log('\nnothing to do.'); process.exit(0); }
if (!apply) { console.log('\nre-run with --yes to create these drafts.'); process.exit(0); }

for (const { p, front, model } of todo) {
  const f = await upload(front, `${p.slug}-front`);
  const o = await upload(model, `${p.slug}-on-model`);
  const created = await call('/api/admin/products', { method: 'POST', body: {
    slug: p.slug, name: p.productName, category: p.category, type: p.subCategory,
    price: p.sellingPrice, mrp: p.mrp,
    /* Forced, not taken from the manifest: unverified means invisible and unbuyable. */
    status: 'draft', featured: false, isNew: false,
    giftWrap: false, exchange: true,
    material: p.material, description: p.description,
    specs: [
      { k: 'Finish', v: p.finish },
      { k: 'Style', v: p.style },
      { k: 'Occasion', v: p.occasion },
    ],
    variants: [{ color: 'gold', sku: p.sku, stock: 0, images: [f, o] }],
  }});
  console.log(`  draft ${created.id}  ${created.slug}  ${created.status}`);
}
console.log(`\n${todo.length} draft(s) created. None is public and none is purchasable.`);

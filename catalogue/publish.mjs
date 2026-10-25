/* Publishes approved drafts once the merchant has confirmed the pieces are real.
 *
 * Two steps per product, both through the admin API:
 *   1. status draft -> active, via the product endpoint the form uses.
 *   2. opening stock, via the inventory endpoint, so it passes applyStock() and leaves a
 *      ledger row rather than writing the column behind the system's back.
 *
 * The manifest is updated to record that these are no longer concepts: verified true,
 * reviewState PUBLISHED. That matters because `verified: false` is what validate.mjs uses
 * to insist on draft and zero stock.
 *
 *   node catalogue/publish.mjs --stock 10            # report
 *   node catalogue/publish.mjs --stock 10 --yes      # publish
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = process.env.API_ORIGIN || 'http://localhost:4000';
const args = process.argv.slice(2);
const apply = args.includes('--yes');
const stock = Number(args[args.indexOf('--stock') + 1] ?? 0);
if (!Number.isInteger(stock) || stock < 0) throw new Error('pass --stock <whole number>');

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

await call('/api/auth/login', { method: 'POST', body: {
  email: process.env.SEED_ADMIN_EMAIL || 'veena@aarunyajewels.in',
  password: process.env.SEED_ADMIN_PASSWORD || 'aarunya123' } });

const m = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));
const wanted = new Set(m.products.filter((p) => p.reviewState === 'APPROVED').map((p) => p.slug));

const live = await call('/api/admin/products');
const rows = (live.items ?? live.rows ?? live).filter((p) => wanted.has(p.slug) && p.status === 'draft');

console.log(`${rows.length} approved draft(s) to publish at stock ${stock}`);
if (!rows.length) { console.log('nothing to do.'); process.exit(0); }
if (!apply) { console.log('re-run with --yes to publish.'); process.exit(0); }

for (const row of rows) {
  const p = await call(`/api/admin/products/${row.id}`);
  await call(`/api/admin/products/${row.id}`, { method: 'PUT', body: {
    ...p, status: 'active',
    /* variants sent back exactly as they are, so photos and SKUs are untouched */
    variants: p.variants.map((v) => ({ id: v.id, color: v.color, sku: v.sku,
      stock: v.stock, images: v.images })),
    specs: p.specs ?? [],
  }});
  for (const v of p.variants) {
    await call('/api/admin/inventory/adjust', { method: 'POST', body: {
      vid: v.id, mode: 'set', qty: stock, reason: 'restock',
      note: 'Opening stock, merchant confirmed' } });
  }
  const entry = m.products.find((x) => x.slug === row.slug);
  if (entry) { entry.verified = true; entry.reviewState = 'PUBLISHED'; entry.status = 'active'; entry.stock = stock; }
  console.log(`  live  ${row.id}  ${row.slug}  stock ${stock}`);
}

m.note = 'Entries marked verified were confirmed by the merchant as real, available pieces '
       + 'and published with opening stock. Unverified entries remain concept drafts.';
writeFileSync(join(HERE, 'manifest.json'), JSON.stringify(m, null, 2));
console.log(`\n${rows.length} product(s) published at stock ${stock}.`);

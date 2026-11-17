/* One-off GST go-live: records the facts the merchant has confirmed and classifies the
 * catalogue, so that the only thing left before invoicing switches on is the human portal
 * check (Admin → GST & Invoices → Settings → Verify).
 *
 *   npm run gst:golive -- --dry-run     show what would change
 *   npm run gst:golive                  apply it
 *
 * Safe to re-run:
 *   - settings fields are only filled where they are empty — nothing typed in the admin is overwritten;
 *   - `verified` is never set here; if an identity field is filled, verification is cleared,
 *     exactly as the admin Settings page does;
 *   - only products without a verified classification are touched.
 *
 * Sources (see docs/GST.md §3a): GSTIN, phone and price mode from Veena's sample invoices;
 * legal name, trade name and address from aarunya-web/src/config/businessInfo.ts (merchant-
 * supplied); regular taxpayer, invoice email and HSN 7117 @ 3% confirmed by the owner/CA
 * on 2026-11-17. The portal check is still what catches any mismatch with the certificate.
 */
import { pool, tx } from '../src/db/pool.js';
import { getGst, GST_KEY, invoicingStatus } from '../src/lib/gstSettings.js';

const DRY = process.argv.includes('--dry-run');
const ACTOR = 'gst-golive script';
const CONFIRMED_ON = '2026-11-17';

const FACTS = {
  registered: true,
  gstin: '32BTBPG5961M1ZK',
  stateCode: '32',
  legalName: 'Veena G',
  tradeName: 'Aarunya Jewels by Veena',
  address: { line1: 'Edappon', line2: '', city: 'Mavelikara, Alappuzha', pin: '690558' },
  phone: '9747738193',
  email: 'Aarunyajewelsbyveena@gmail.com',
  priceMode: 'inclusive',
};
const HSN = '7117';
const RATE_BP = 300;
const NOTE = `CA-confirmed HSN ${HSN} (imitation jewellery) @ 3%, ${CONFIRMED_ON}`;

const empty = (v) => v === '' || v == null;
const IDENTITY = ['registered', 'gstin', 'legalName', 'tradeName', 'address', 'stateCode'];

function plan(cur) {
  const next = { ...cur, address: { ...cur.address } };
  const changes = [];
  for (const [k, v] of Object.entries(FACTS)) {
    if (k === 'address') {
      for (const [ak, av] of Object.entries(v)) {
        if (empty(next.address[ak]) && !empty(av)) {
          changes.push([`address.${ak}`, next.address[ak], av]);
          next.address[ak] = av;
        }
      }
    } else if (k === 'registered') {
      if (!next.registered) { changes.push([k, false, true]); next.registered = true; }
    } else if (k === 'priceMode') {
      /* Only a default; an explicit choice in the admin wins. */
      if (empty(next.priceMode)) { changes.push([k, next.priceMode, v]); next.priceMode = v; }
    } else if (empty(next[k])) {
      changes.push([k, next[k], v]);
      next[k] = v;
    }
  }
  const identityChanged = changes.some(([k]) => IDENTITY.includes(k.split('.')[0]));
  if (identityChanged && next.verified) {
    next.verified = false; next.verifiedAt = null; next.verifiedBy = '';
    changes.push(['verified', true, false]);
  }
  /* Facts that differ from what is already saved are reported, not overwritten. */
  const conflicts = [];
  for (const [k, v] of Object.entries(FACTS)) {
    if (k === 'address') {
      for (const [ak, av] of Object.entries(v)) {
        if (!empty(cur.address[ak]) && cur.address[ak] !== av) conflicts.push([`address.${ak}`, cur.address[ak], av]);
      }
    } else if (!empty(cur[k]) && cur[k] !== v && k !== 'registered') conflicts.push([k, cur[k], v]);
  }
  return { next, changes, conflicts };
}

async function main() {
  const result = await tx(async (c) => {
    await c.query(`SELECT value FROM setting WHERE key = $1 FOR UPDATE`, [GST_KEY]);
    const cur = await getGst(c);
    const { next, changes, conflicts } = plan(cur);

    const { rows: products } = await c.query(
      `SELECT id, name, hsn_code, gst_rate_bp, hsn_status FROM product
        WHERE hsn_status <> 'verified' ORDER BY name`);
    const { rows: [{ n: total }] } = await c.query(`SELECT count(*)::int AS n FROM product`);

    if (!DRY) {
      if (changes.length) {
        await c.query(
          `INSERT INTO setting (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [GST_KEY, JSON.stringify(next)]);
      }
      if (products.length) {
        await c.query(
          `UPDATE product SET hsn_code = $2, gst_rate_bp = $3, hsn_status = 'verified', tax_note = $4,
             hsn_verified_at = now(), hsn_verified_by = $5
           WHERE id = ANY($1) AND hsn_status <> 'verified'`,
          [products.map((p) => p.id), HSN, RATE_BP, NOTE, ACTOR]);
      }
    }
    return { next, changes, conflicts, products, total };
  });

  const { next, changes, conflicts, products, total } = result;
  console.log(DRY ? '\n— DRY RUN: nothing written —\n' : '\n— Applied —\n');

  console.log('GST settings:');
  if (!changes.length) console.log('  nothing to fill (already set)');
  for (const [k, from, to] of changes) console.log(`  ${k}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
  if (conflicts.length) {
    console.log('\n  Already set to something different (left as is — check against the GST certificate):');
    for (const [k, have, fact] of conflicts) console.log(`    ${k}: saved ${JSON.stringify(have)}, script value ${JSON.stringify(fact)}`);
  }

  console.log(`\nProducts: ${products.length} of ${total} to classify as HSN ${HSN} @ ${RATE_BP / 100}% (verified)`);
  for (const p of products) {
    console.log(`  ${p.name}${p.hsn_code ? `  (was ${p.hsn_code} @ ${p.gst_rate_bp ?? '?'}bp, ${p.hsn_status})` : ''}`);
  }

  const status = invoicingStatus(next);
  console.log(`\nInvoicing ${status.active ? 'ACTIVE' : 'still locked'}${status.problems.length ? ':' : ''}`);
  for (const p of status.problems) console.log(`  - ${p}`);
  if (!status.active) {
    console.log('\nNext: search 32BTBPG5961M1ZK on services.gst.gov.in → Search Taxpayer, compare legal name,'
      + '\ntrade name and address with Admin → GST & Invoices → Settings, correct any difference, then Verify.');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());

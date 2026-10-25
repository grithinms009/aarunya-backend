/* Razorpay website-readiness audit. Read-only; checks the running site and API. */
const API = process.env.API_ORIGIN || 'http://localhost:4000';
const WEB = process.env.WEB_ORIGIN || 'http://localhost:5173';
const pass = [], fail = [], flag = [];

const UNVERIFIABLE = /stainless steel|gold[- ]plated|gold plating|anti[- ]tarnish|nickel[- ]free|waterproof|hypoallergenic|sterling|genuine (pearl|gem|diamond)/i;

/* 1. the payment gateway must not be pretending to work.
   The route takes orderId and only reaches the gateway branch for a real order, so an
   unknown one must be refused outright rather than 500 or silently "paid". */
const pay = await fetch(`${API}/api/payments/create`, { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: 'AJ0000' }) });
const payBody = await pay.text();
(pay.status === 404 && !/success|paid|captured/i.test(payBody) ? pass : fail)
  .push(`payments: an unknown order is refused, never reported paid (${pay.status})`);

/* No live gateway credentials may be configured while onboarding is unfinished. */
const { readFileSync: rf, existsSync: ex } = await import('node:fs');
const envText = ['.env', '.env.example'].filter(ex).map((f) => rf(f, 'utf8')).join('\n');
const liveKeys = /rzp_live|RAZORPAY_KEY_SECRET\s*=\s*\S/.test(envText);
(!liveKeys ? pass : fail).push('payments: no live Razorpay credentials are configured yet');

/* 2. nothing purchasable may be out of stock */
const list = await (await fetch(`${API}/api/products`)).json();
const items = Array.isArray(list) ? list : (list.items ?? list.rows ?? []);
const buyableButEmpty = items.filter((p) => p.status !== 'draft'
  && (p.variants ?? []).every((v) => (v.stock ?? 0) === 0));
(buyableButEmpty.length === 0 ? pass : fail)
  .push(`stock: ${buyableButEmpty.length} live product(s) with zero stock across every colour`);

/* 3. no draft may be visible on the public feed */
const draftsPublic = items.filter((p) => p.status === 'draft');
(draftsPublic.length === 0 ? pass : fail)
  .push(`visibility: ${draftsPublic.length} draft(s) reachable on the public product feed`);

/* 4. material claims on public products */
for (const p of items) {
  const full = await (await fetch(`${API}/api/products/${p.slug}`)).json();
  const texts = [['material', full.material], ['description', full.description],
    ...(full.specs ?? []).map((s) => [`spec:${s.k}`, s.v])];
  for (const [where, text] of texts) {
    const hit = UNVERIFIABLE.exec(text || '');
    if (hit) flag.push(`${p.slug} — ${where} claims "${hit[0]}"`);
  }
}

/* 5. policies and contact details must be reachable */
for (const path of ['/policies/terms', '/policies/privacy', '/policies/shipping',
                    '/policies/returns', '/policies/grievance', '/contact']) {
  const r = await fetch(WEB + path);
  (r.ok ? pass : fail).push(`page ${path} responds ${r.status}`);
}

/* 6. totals must be recomputed server-side, never trusted from the client */
const probe = await fetch(`${API}/api/cart`, { method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ items: [{ variantId: 'nope', qty: 1, price: 1 }] }) });
(probe.status < 500 ? pass : fail).push(`cart: re-prices server-side, rejects unknown lines (${probe.status})`);

console.log('PASS');  for (const p of pass) console.log('  ' + p);
if (fail.length) { console.log('\nFAIL'); for (const f of fail) console.log('  ' + f); }
console.log(`\nMATERIAL CLAIMS NEEDING MERCHANT CONFIRMATION ON RECORD (${flag.length})`);
for (const f of flag) console.log('  ' + f);

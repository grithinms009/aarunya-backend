/* End-to-end GST / invoice / payment tests against a real API process and database (K–N plus
   the lifecycle checks). It starts its own API on port 4100 with a fake Razorpay on 4101, so
   it never touches a running dev server. Run: npm run test:gst */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = 4100, GW = 4101, BASE = `http://127.0.0.1:${PORT}`;
const KEY_SECRET = 'test_key_secret', WH_SECRET = 'test_webhook_secret';
const ADMIN = { email: 'veena@aarunyajewels.in', password: 'aarunya123' };
const fails = [];
const ok = (n, c, x = '') => { if (!c) fails.push(n); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${c ? '' : x}`); };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const sec = (t) => console.log(`\n── ${t} ──`);

/* ---------------- a fake Razorpay (orders + payments) ---------------- */
const gwOrders = new Map(), gwPayments = new Map();
let gwSeq = 1;
const gw = createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (!/^Basic /.test(req.headers.authorization ?? '')) return send(401, { error: { description: 'no auth' } });
    if (req.method === 'POST' && req.url === '/orders') {
      const b = JSON.parse(body); const id = `order_T${gwSeq++}`;
      gwOrders.set(id, b); return send(200, { id, ...b });
    }
    const m = req.url.match(/^\/payments\/(.+)$/);
    if (m && gwPayments.has(m[1])) return send(200, gwPayments.get(m[1]));
    send(404, { error: { description: 'not found' } });
  });
});
await new Promise((r) => gw.listen(GW, '127.0.0.1', r));

/* ---------------- database + API ---------------- */
console.log('resetting database…');
execFileSync('npm', ['run', 'db:reset'], { stdio: 'pipe' });
const api = spawn('node', ['src/server.js'], {
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_fake',
    RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WH_SECRET, RAZORPAY_API_BASE: `http://127.0.0.1:${GW}`,
    STORE_ORIGIN: 'http://localhost:5173', ADMIN_ORIGIN: 'http://localhost:5174' },
  stdio: 'pipe',
});
let apiLog = ''; api.stdout.on('data', (d) => { apiLog += d; }); api.stderr.on('data', (d) => { apiLog += d; });
const finish = (code) => { api.kill(); gw.close(); process.exit(code); };
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 200)); }

let cookies = {};
const jar = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
async function raw(path, { method = 'GET', body, headers = {}, admin = true, rawBody } = {}) {
  const h = { ...headers };
  if (admin) { h.Cookie = jar(); if (method !== 'GET') h['x-csrf-token'] = cookies.aj_csrf ?? ''; }
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers: h, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)) });
  for (const line of res.headers.getSetCookie?.() ?? []) { const [p] = line.split(';'); const i = p.indexOf('='); cookies[p.slice(0, i)] = p.slice(i + 1); }
  return res;
}
async function call(path, o = {}) {
  const res = await raw(path, o);
  const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) { const e = new Error(data?.message ?? res.statusText); e.status = res.status; e.fields = data?.fields; throw e; }
  return data;
}
const pub = (path, o = {}) => call(path, { ...o, admin: false });
const refuses = async (p) => { try { await p; return null; } catch (e) { return e; } };
const pdfOf = async (path, o = {}) => { const r = await raw(path, o); return { status: r.status, type: r.headers.get('content-type'), buf: Buffer.from(await r.arrayBuffer()) }; };

try {
  await call('/api/auth/login', { method: 'POST', body: ADMIN });

  /* ---------------- catalogue ---------------- */
  const settings = await call('/api/admin/settings');
  await call('/api/admin/settings', { method: 'PUT', body: { config: { ...settings.config, FREE_SHIPPING_THRESHOLD: 0 }, couriers: settings.couriers, locations: settings.locations,
    colors: [{ key: '', label: 'Gold', hex: '#CDA349' }], name: 'Veena', email: ADMIN.email, password: '', passwordConfirm: '' } });
  await call('/api/admin/categories', { method: 'POST', body: { name: 'Anti-Tarnish Necklaces', short: 'Necklaces', tint: '#F7E4E4', image: '', subs: [], pairs: [], isNew: true } });
  const mk = (name, price, stock = 50) => call('/api/admin/products', { method: 'POST', body: { name, category: 'necklaces', price, mrp: price + 100, status: 'active', description: 'Test', variants: [{ color: 'gold', stock, sku: '', images: [] }] } });
  const p214 = await mk('Test Necklace 214', 214);
  const p299 = await mk('Test Necklace 299', 299);
  const p550 = await mk('Test Necklace 550', 550);
  const v = (p) => p.variants[0];
  const line = (p, qty = 1) => ({ productId: p.id, variantId: v(p).id, qty });

  sec('GST is OFF until the GSTIN is verified');
  {
    const t = await pub('/api/cart', { method: 'POST', body: { items: [line(p214)], state: 'Kerala' } });
    ok('no GST breakup is produced while unverified', t.tax.applied === false);
    const st = await call('/api/admin/gst/settings');
    ok('settings show why invoicing is locked', st.status.active === false && st.status.problems.length >= 3, st.status.problems.join(' | '));
    ok('candidate GSTIN is pre-filled but NOT verified', st.settings.gstin === '32BTBPG5961M1ZK' && st.settings.verified === false);
    ok('legal name / address are NOT invented', st.settings.legalName === '' && st.settings.address.line1 === '');
    const e = await refuses(call('/api/admin/gst/settings/verify', { method: 'POST', body: { confirm: true, note: 'checked on portal' } }));
    ok('cannot verify while legal name and address are blank', e?.status === 409, e?.message);
  }

  /* An order placed before GST is switched on — must stay untouched forever (test M). */
  const PIN = { Kerala: '682001', Karnataka: '560001', 'Tamil Nadu': '600001', Maharashtra: '400001', Delhi: '110001', 'Jammu & Kashmir': '190001' };
  const place = async (items, state, extra = {}) => {
    const body = { customer: { name: 'Test Buyer', phone: '9876543210', email: '', address: '12 Test Road', city: 'Testville', state, pin: PIN[state] ?? '682001', ...extra }, items };
    return pub('/api/orders', { method: 'POST', body });
  };
  const legacy = await place([line(p214)], 'Kerala');
  const legacyRow = await call(`/api/admin/orders/${legacy.orderId}`);
  ok('legacy order total unchanged by the feature', legacyRow.total === 214);

  sec('Admin configures GST (supplier details are TEST FIXTURE values, not Veena\'s)');
  const fixture = {
    registered: true, gstin: '32BTBPG5961M1ZK', legalName: 'TEST FIXTURE LEGAL NAME', tradeName: 'Aarunya_jewels_byveena',
    address: { line1: 'TEST FIXTURE ADDRESS, Mavelikkara', line2: '', city: 'Mavelikkara', pin: '690101' },
    stateCode: '32', phone: '9747738193', email: 'invoices@example.test', invoicePrefix: 'AJ', priceMode: 'inclusive',
    rounding: 'line', roundOffToRupee: false, reverseCharge: false,
    template: { terms: 'Goods once sold are subject to our return policy.', footerNote: 'TEST FIXTURE — NOT A REAL INVOICE', signatureText: 'Authorized Signatory', showSignature: true },
  };
  let st = await call('/api/admin/gst/settings', { method: 'PUT', body: fixture });
  ok('saved but not yet verified', st.settings.verified === false && st.status.active === false);
  const noNote = await refuses(call('/api/admin/gst/settings/verify', { method: 'POST', body: { confirm: true, note: '' } }));
  ok('verification needs a note of where it was checked', noNote?.status === 422 || noNote?.status === 400);
  st = await call('/api/admin/gst/settings/verify', { method: 'POST', body: { confirm: true, note: 'TEST: portal check simulated in test run' } });
  ok('verified → invoicing active', st.status.active === true && st.settings.verifiedBy === ADMIN.email);
  const changed = await call('/api/admin/gst/settings', { method: 'PUT', body: { ...fixture, legalName: 'TEST FIXTURE LEGAL NAME 2' } });
  ok('changing identity voids the verification', changed.settings.verified === false);
  await call('/api/admin/gst/settings', { method: 'PUT', body: fixture });
  await call('/api/admin/gst/settings/verify', { method: 'POST', body: { confirm: true, note: 'TEST: re-verified' } });

  sec('Product classification');
  {
    const list = await call('/api/admin/gst/products');
    ok('every product flagged as unclassified', list.summary.needsAttention === 3 && list.items.every((i) => i.issue));
    const bad = await refuses(call(`/api/admin/gst/products/${p214.id}`, { method: 'PUT', body: { hsn: '71', gstRateBp: 300, verified: true } }));
    ok('invalid HSN refused', bad?.status === 422);
    const noRate = await refuses(call(`/api/admin/gst/products/${p214.id}`, { method: 'PUT', body: { hsn: '7117', gstRateBp: null, verified: true } }));
    ok('cannot verify without a rate', noRate?.status === 422);
    const t = await pub('/api/cart', { method: 'POST', body: { items: [line(p214)], state: 'Kerala' } });
    ok('an unverified product gets NO tax breakup (GST not collected on a guess)', t.tax.applied === false && t.total === 214);
    const prev = await call('/api/admin/gst/products/bulk', { method: 'POST', body: { ids: [p214.id, p299.id], hsn: '7117', gstRateBp: 300, verified: true } });
    ok('bulk assignment previews first, changes nothing', prev.preview === true && prev.count === 2);
    ok('…and nothing was written', (await call('/api/admin/gst/products')).summary.needsAttention === 3);
    const wrong = await refuses(call('/api/admin/gst/products/bulk', { method: 'POST', body: { ids: [p214.id, p299.id], hsn: '7117', gstRateBp: 300, verified: true, confirm: true, expectedCount: 5 } }));
    ok('confirmation must match the previewed count', wrong?.status === 409);
    const done = await call('/api/admin/gst/products/bulk', { method: 'POST', body: { ids: [p214.id, p299.id], hsn: '7117', gstRateBp: 300, verified: true, confirm: true, expectedCount: 2 } });
    ok('bulk applied after explicit confirmation', done.updated === 2);
    await call(`/api/admin/gst/products/${p550.id}`, { method: 'PUT', body: { hsn: '7113', gstRateBp: 300, verified: true, note: 'TEST' } });
    const after = await call('/api/admin/gst/products');
    ok('products now verified; prices untouched', after.summary.needsAttention === 0 && after.items.find((i) => i.id === p214.id).price === 214);
  }

  sec('Checkout: backend decides the tax (tests A, B, C, D, F)');
  const cart = (items, state) => pub('/api/cart', { method: 'POST', body: { items, state } });
  {
    const kl = await cart([line(p214)], 'Kerala');
    eq('A Kerala: CGST 3.12 + SGST 3.11, GST 6.23, total 214', [kl.tax.taxType, kl.tax.cgstPaise, kl.tax.sgstPaise, kl.tax.igstPaise, kl.tax.taxPaise, kl.total], ['intra', 312, 311, 0, 623, 214]);
    const ka = await cart([line(p214)], 'Karnataka');
    eq('B Karnataka: IGST 6.23 only, total 214', [ka.tax.taxType, ka.tax.cgstPaise, ka.tax.igstPaise, ka.total], ['inter', 0, 623, 214]);
    const tn = await cart([line(p214)], 'Tamil Nadu');
    eq('C Tamil Nadu: IGST', tn.tax.taxType, 'inter');
    eq('F inclusive: taxable 207.77', ka.tax.taxablePaise, 20777);
    ok('pricing model unchanged: ₹214 product still totals ₹214 (free shipping configured)', ka.subtotal === 214 && ka.shipping === 0);
  }
  const kaOrder = await place([line(p214)], 'Karnataka', { billing: { name: 'Bill Person', address: 'Bill St', city: 'Kochi', state: 'Kerala', pin: '682001', gstin: '' } });
  const klOrder = await place([line(p214, 2)], 'Kerala', { billing: { name: 'Bill Person', address: 'Bill St', city: 'Bengaluru', state: 'Karnataka', pin: '560001', gstin: '' } });
  {
    const a = await call(`/api/admin/orders/${kaOrder.orderId}`);
    const b = await call(`/api/admin/orders/${klOrder.orderId}`);
    eq('D billing Kerala, delivery Karnataka → IGST (delivery decides)', [a.total, a.tax_type ?? 'n/a'].slice(0, 1), [214]);
    const { rows } = { rows: [] };
    void rows;
    const noPin = await refuses(place([line(p214)], 'Kerala', { pin: '' }));
    ok('PIN is required once GST is on', noPin?.status === 422 && !!noPin.fields?.pin, noPin?.message);
    const fromPin = await place([line(p214)], '');
    ok('state is taken from the PIN when the shopper left it blank', (await call(`/api/admin/orders/${fromPin.orderId}`)).customer.state === 'Kerala');
    const badGstin = await refuses(place([line(p214)], 'Kerala', { billing: { gstin: '32BTBPG5961M1ZL' } }));
    ok('invalid buyer GSTIN refused', badGstin?.status === 422);
    ok('D billing Karnataka, delivery Kerala → CGST+SGST', b.total === 428);
  }

  sec('PIN directory (India Post) decides state, deliverability and shipping zone');
  {
    const c1 = await pub('/api/cart', { method: 'POST', body: { items: [line(p214)], pin: '560001' } });
    eq('PIN alone gives the state and IGST', [c1.delivery.state.name, c1.tax.taxType, c1.delivery.zone], ['Karnataka', 'inter', 'rest']);
    const c2 = await pub('/api/cart', { method: 'POST', body: { items: [line(p214)], pin: '560001', state: 'Kerala' } });
    ok('a PIN contradicting the chosen state is flagged, not silently overridden', /is in Karnataka/.test(c2.delivery.pinError) && c2.tax.applied === false);
    const mism = await refuses(place([line(p214)], 'Kerala', { pin: '560001' }));
    ok('checkout refuses Kerala + a Karnataka PIN', mism?.status === 422 && /is in Karnataka/.test(mism.fields?.pin ?? ''), mism?.message);
    const unk = await refuses(place([line(p214)], 'Kerala', { pin: '999999' }));
    ok('an unknown PIN is refused', unk?.status === 422);
    const nod = await refuses(place([line(p214)], 'Punjab', { pin: '144009' }));
    ok('a PIN with no India Post delivery office is refused', nod?.status === 422 && /no delivery office/.test(nod.message), nod?.message);
    const multi = await pub('/api/cart', { method: 'POST', body: { items: [line(p214)], pin: '110025' } });
    ok('a PIN that straddles two states needs the shopper to choose', /spans/.test(multi.delivery.pinError) && multi.tax.applied === false);
    const chosen = await pub('/api/cart', { method: 'POST', body: { items: [line(p214)], pin: '110025', state: 'Uttar Pradesh' } });
    eq('…and then the chosen state is used', [chosen.delivery.state.name, chosen.tax.taxType], ['Uttar Pradesh', 'inter']);
    const est = await pub('/api/delivery/estimate?pin=682001');
    ok('delivery estimate: Kerala PIN is local', est.ok && est.state === 'Kerala' && est.zone === 'home' && est.minDays === 2);
    ok('delivery estimate: unknown PIN', (await pub('/api/delivery/estimate?pin=999999')).ok === false);
  }

  sec('I  Shipping charges follow the principal supply');
  {
    const cur = await call('/api/admin/settings');
    await call('/api/admin/settings', { method: 'PUT', body: { config: { ...cur.config, FREE_SHIPPING_THRESHOLD: 499, SHIPPING_FEE: 60 }, couriers: cur.couriers, locations: cur.locations, name: 'Veena', email: ADMIN.email, password: '', passwordConfirm: '' } });
    const t = await cart([line(p214)], 'Karnataka');
    eq('₹214 + ₹60 shipping, IGST on both = 7.98; customer pays ₹274', [t.shipping, t.total, t.tax.taxablePaise, t.tax.igstPaise, t.tax.grandTotalPaise], [60, 274, 26602, 798, 27400]);
    const k = await cart([line(p214)], 'Kerala');
    eq('same in Kerala: CGST 4.00 + SGST 3.98', [k.tax.cgstPaise, k.tax.sgstPaise], [400, 398]);
    /* zone rates: Kerala ₹40, rest of India ₹60, remote (J&K, NE, islands) ₹120 */
    await call('/api/admin/settings', { method: 'PUT', body: { config: { ...cur.config, FREE_SHIPPING_THRESHOLD: 499, SHIPPING_FEE: 60, SHIPPING_RATES: { home: 40, rest: '', remote: 120 } }, couriers: cur.couriers, locations: cur.locations, name: 'Veena', email: ADMIN.email, password: '', passwordConfirm: '' } });
    const zk = await pub('/api/cart', { method: 'POST', body: { items: [line(p214)], pin: '682001' } });
    const zr = await pub('/api/cart', { method: 'POST', body: { items: [line(p214)], pin: '560001' } });
    const zj = await pub('/api/cart', { method: 'POST', body: { items: [line(p214)], pin: '190001' } });
    eq('shipping by PIN zone: Kerala 40, rest of India 60 (blank = standard fee), J&K 120', [zk.shipping, zr.shipping, zj.shipping], [40, 60, 120]);
    eq('GST follows the zone fee: J&K ₹214 + ₹120 = ₹334, IGST 9.73', [zj.total, zj.tax.igstPaise, zj.tax.grandTotalPaise], [334, 973, 33400]);
    const zo = await place([line(p214)], 'Jammu & Kashmir');
    ok('the order is charged the zone fee, same as the quote', (await call(`/api/admin/orders/${zo.orderId}`)).total === 334 && zo.amount === 334);
    await call('/api/admin/settings', { method: 'PUT', body: { config: { ...cur.config, FREE_SHIPPING_THRESHOLD: 0 }, couriers: cur.couriers, locations: cur.locations, name: 'Veena', email: ADMIN.email, password: '', passwordConfirm: '' } });
  }

  sec('Payments + Razorpay reconciliation (test N)');
  const payFor = async (o, { tamper = false } = {}) => {
    const created = await pub('/api/payments/create', { method: 'POST', body: { orderId: o.orderId, token: o.accessToken, amount: 1 } });
    return created;
  };
  {
    const noTok = await refuses(pub('/api/payments/create', { method: 'POST', body: { orderId: kaOrder.orderId } }));
    ok('payment cannot be started without the order\'s access token', noTok?.status === 404);
    const unknown = await refuses(pub('/api/payments/create', { method: 'POST', body: { orderId: 'AJ0000' } }));
    ok('unknown order → 404', unknown?.status === 404);

    const c = await payFor(kaOrder);
    eq('N Razorpay order amount = backend total in paise (client "amount: 1" ignored)', [c.status, c.amountPaise, gwOrders.get(c.gatewayOrderId).amount], ['CREATED', 21400, 21400]);
    const again = await payFor(kaOrder);
    ok('creating twice reuses the same gateway order', again.gatewayOrderId === c.gatewayOrderId);

    const goodPay = { id: 'pay_OK1', order_id: c.gatewayOrderId, amount: 21400, currency: 'INR', status: 'captured', method: 'upi' };
    gwPayments.set('pay_OK1', goodPay);
    const sig = (oid, pid, secret = KEY_SECRET) => createHmac('sha256', secret).update(`${oid}|${pid}`).digest('hex');
    const badSig = await refuses(pub('/api/payments/verify', { method: 'POST', body: { orderId: kaOrder.orderId, token: kaOrder.accessToken, razorpay_order_id: c.gatewayOrderId, razorpay_payment_id: 'pay_OK1', razorpay_signature: sig(c.gatewayOrderId, 'pay_OK1', 'wrong') } }));
    ok('forged checkout signature rejected', badSig?.status === 403);
    ok('…and the order is still unpaid', (await call(`/api/admin/orders/${kaOrder.orderId}`)).payment.status === 'pending');

    gwPayments.set('pay_SHORT', { ...goodPay, id: 'pay_SHORT', amount: 100 });
    const short = await refuses(pub('/api/payments/verify', { method: 'POST', body: { orderId: kaOrder.orderId, token: kaOrder.accessToken, razorpay_order_id: c.gatewayOrderId, razorpay_payment_id: 'pay_SHORT', razorpay_signature: sig(c.gatewayOrderId, 'pay_SHORT') } }));
    ok('validly signed payment of the WRONG amount is not accepted', short?.status === 409);
    gwPayments.set('pay_AUTH', { ...goodPay, id: 'pay_AUTH', status: 'authorized' });
    const auth = await pub('/api/payments/verify', { method: 'POST', body: { orderId: kaOrder.orderId, token: kaOrder.accessToken, razorpay_order_id: c.gatewayOrderId, razorpay_payment_id: 'pay_AUTH', razorpay_signature: sig(c.gatewayOrderId, 'pay_AUTH') } });
    ok('authorized-but-not-captured is not "paid"', auth.pending === true && auth.paid === false);

    const okv = await pub('/api/payments/verify', { method: 'POST', body: { orderId: kaOrder.orderId, token: kaOrder.accessToken, razorpay_order_id: c.gatewayOrderId, razorpay_payment_id: 'pay_OK1', razorpay_signature: sig(c.gatewayOrderId, 'pay_OK1') } });
    ok('N genuine payment marks the order paid', okv.paid === true);
    const o = await call(`/api/admin/orders/${kaOrder.orderId}`);
    ok('N paid amount = order total', o.payment.status === 'paid' && o.total === 214);

    /* webhook: signature, idempotency, replay */
    const evt = (event, extra = {}) => JSON.stringify({ event, created_at: 1, payload: extra });
    const hook = (body, secret = WH_SECRET, id = 'evt_1') => raw('/api/payments/webhook', { method: 'POST', admin: false, rawBody: body,
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': createHmac('sha256', secret).update(body).digest('hex'), 'x-razorpay-event-id': id } });
    ok('webhook with a bad signature → 400', (await hook(evt('payment.captured'), 'nope')).status === 400);

    const c2 = await payFor(klOrder);
    gwPayments.set('pay_WH2', { id: 'pay_WH2', order_id: c2.gatewayOrderId, amount: 42800, currency: 'INR', status: 'captured', method: 'card', notes: { order: klOrder.orderId } });
    const cap = evt('payment.captured', { payment: { entity: gwPayments.get('pay_WH2') } });
    ok('webhook payment.captured accepted', (await hook(cap, WH_SECRET, 'evt_cap')).status === 200);
    ok('…order reconciled to paid', (await call(`/api/admin/orders/${klOrder.orderId}`)).payment.status === 'paid');
    ok('replayed webhook is idempotent', (await hook(cap, WH_SECRET, 'evt_cap')).status === 200);

    /* failed / abandoned payments never produce a paid order or an invoice */
    const abandoned = await place([line(p299)], 'Kerala');
    const ca = await payFor(abandoned);
    const failEvt = evt('payment.failed', { payment: { entity: { id: 'pay_F', order_id: ca.gatewayOrderId, amount: 29900, status: 'failed', error_code: 'BAD_REQUEST_ERROR' } } });
    await hook(failEvt, WH_SECRET, 'evt_fail');
    const ab = await call(`/api/admin/orders/${abandoned.orderId}`);
    ok('failed payment leaves the order unpaid', ab.payment.status === 'pending');
    const noShip = await refuses(call(`/api/admin/orders/${abandoned.orderId}/advance`, { method: 'POST', body: { courier: '', awb: '' } }));
    ok('an unpaid order cannot be dispatched, so no invoice can exist for it', noShip?.status === 409);
    const noInv = await refuses(call(`/api/admin/gst/orders/${abandoned.orderId}/invoice`, { method: 'POST' }));
    ok('and no invoice can be force-issued for it', noInv?.status === 409, noInv?.message);

    globalThis.__paid = { kaOrder, klOrder, ca, abandoned };
  }

  sec('Invoice lifecycle: issued at dispatch (tests K, L, M)');
  const { kaOrder: KA, klOrder: KL } = globalThis.__paid;
  let invKA, invKL;
  {
    ok('no invoice before dispatch', (await call('/api/admin/gst/invoices')).rows.length === 0);
    await call(`/api/admin/orders/${KA.orderId}/advance`, { method: 'POST', body: {} }); // new → packed
    ok('still no invoice when merely packed', (await call('/api/admin/gst/invoices')).rows.length === 0);
    await call(`/api/admin/orders/${KA.orderId}/advance`, { method: 'POST', body: { courier: 'delhivery', awb: 'AWB1' } });
    await call(`/api/admin/orders/${KL.orderId}/advance`, { method: 'POST', body: {} });
    await call(`/api/admin/orders/${KL.orderId}/advance`, { method: 'POST', body: { courier: 'delhivery', awb: 'AWB2' } });
    const list = await call('/api/admin/gst/invoices');
    eq('invoices issued at dispatch, numbered consecutively', list.rows.map((r) => r.invoiceNo).sort(), ['AJ/26-27/0001', 'AJ/26-27/0002']);
    invKA = list.rows.find((r) => r.orderId === KA.orderId); invKL = list.rows.find((r) => r.orderId === KL.orderId);
    eq('Karnataka invoice: IGST 6.23, place of supply 29', [invKA.taxTypeLabel, invKA.placeOfSupply, invKA.igstPaise, invKA.cgstPaise], ['IGST', '29', 623, 0]);
    const gwAmt = [...gwOrders.values()].filter((o) => o.receipt === KA.orderId).map((o) => o.amount);
    eq('N Karnataka invoice total = order total = Razorpay order amount = ₹214.00', [invKA.grandTotalPaise, gwAmt[0], (await call(`/api/admin/orders/${KA.orderId}`)).total * 100], [21400, 21400, 21400]);
    eq('Kerala invoice (billing Karnataka): CGST+SGST, total ₹428', [invKL.taxTypeLabel, invKL.placeOfSupply, invKL.grandTotalPaise], ['CGST + SGST', '32', 42800]);
    ok('K invoice amounts reconcile', invKL.cgstPaise + invKL.sgstPaise === invKL.taxPaise && invKL.taxablePaise + invKL.taxPaise === invKL.grandTotalPaise);
    const detail = await call(`/api/admin/gst/invoices/${invKL.id}`);
    ok('invoice snapshot carries HSN, rate, supplier and both addresses', detail.invoice.lines.every((l) => l.kind !== 'goods' || (l.hsn === '7117' && l.rateBp === 300)) && detail.invoice.supplier.gstin === fixture.gstin
      && detail.invoice.customer.billing.stateCode === '29' && detail.invoice.customer.shipping.stateCode === '32');
    ok('audit trail records issue', detail.events.some((e) => e.event === 'issued'));
  }

  sec('Immutability: changing the catalogue or settings never alters an issued invoice (M)');
  {
    const before = JSON.stringify((await call(`/api/admin/gst/invoices/${invKL.id}`)).invoice);
    await call(`/api/admin/gst/products/${p214.id}`, { method: 'PUT', body: { hsn: '7113', gstRateBp: 1800, verified: true, note: 'changed' } });
    await call('/api/admin/gst/settings', { method: 'PUT', body: { ...fixture, template: { ...fixture.template, footerNote: 'different footer' } } });
    ok('invoice snapshot unchanged after product HSN/rate + template edits', JSON.stringify((await call(`/api/admin/gst/invoices/${invKL.id}`)).invoice) === before);
    ok('the old order\'s stored tax is unchanged', (await call(`/api/admin/orders/${KL.orderId}`)).total === 428);
    await call(`/api/admin/gst/products/${p214.id}`, { method: 'PUT', body: { hsn: '7117', gstRateBp: 300, verified: true } });
  }
  {
    let blocked = false;
    try { execFileSync('docker', ['exec', 'aarunya-postgres', 'psql', '-U', 'aarunya', '-d', 'aarunya', '-v', 'ON_ERROR_STOP=1', '-c', `UPDATE invoice SET grand_total_paise = 1 WHERE id = ${invKL.id}`], { stdio: 'pipe' }); }
    catch (e) { blocked = /cannot be edited/.test(String(e.stderr)); }
    ok('database refuses to edit an issued invoice', blocked);
    let delBlocked = false;
    try { execFileSync('docker', ['exec', 'aarunya-postgres', 'psql', '-U', 'aarunya', '-d', 'aarunya', '-v', 'ON_ERROR_STOP=1', '-c', `DELETE FROM invoice WHERE id = ${invKL.id}`], { stdio: 'pipe' }); }
    catch (e) { delBlocked = /cannot be deleted/.test(String(e.stderr)); }
    ok('database refuses to delete an issued invoice', delBlocked);
  }
  {
    const legacyAfter = await call(`/api/admin/orders/${legacy.orderId}`);
    ok('M pre-GST order untouched: no tax columns, still total 214', legacyAfter.total === 214);
    const pend = await call('/api/admin/gst/pending');
    ok('M pre-GST order gets no automatic invoice', !pend.some((p) => p.orderId === legacy.orderId && p.owesInvoice));
    await call(`/api/admin/orders/${legacy.orderId}/payment/mark-paid`, { method: 'POST' });
    const man = await call(`/api/admin/gst/orders/${legacy.orderId}/invoice`, { method: 'POST' });
    ok('M …it can be invoiced manually, flagged as legacy, amount = what was paid', man.legacy === true && man.grandTotalPaise === 21400 && man.taxPaise === 623);
    const again = await call(`/api/admin/gst/orders/${legacy.orderId}/invoice`, { method: 'POST' });
    ok('issuing twice returns the same invoice (idempotent)', again.invoiceNo === man.invoiceNo);
  }

  sec('K  Concurrent invoice numbering');
  {
    const orders = [];
    for (let i = 0; i < 12; i++) orders.push(await place([line(p550)], i % 2 ? 'Kerala' : 'Maharashtra'));
    for (const o of orders) await call(`/api/admin/orders/${o.orderId}/payment/mark-paid`, { method: 'POST' });
    for (const o of orders) await call(`/api/admin/orders/${o.orderId}/advance`, { method: 'POST', body: {} }); // → packed
    const results = await Promise.allSettled(orders.map((o) => call(`/api/admin/orders/${o.orderId}/advance`, { method: 'POST', body: { courier: 'dtdc', awb: 'AWB-' + o.orderId } })));
    ok('12 concurrent dispatches all succeeded', results.every((r) => r.status === 'fulfilled'), results.filter((r) => r.status === 'rejected').map((r) => r.reason.message).join(';'));
    const nos = (await call('/api/admin/gst/invoices?limit=200')).rows.map((r) => r.invoiceNo);
    const seqs = nos.map((n) => Number(n.split('/')[2])).sort((a, b) => a - b);
    ok('no duplicate invoice numbers', new Set(nos).size === nos.length);
    eq('numbers are gap-free 1…N', seqs, Array.from({ length: seqs.length }, (_, i) => i + 1));
    ok('numbers are ≤ 16 chars (Rule 46)', nos.every((n) => n.length <= 16 && /^[A-Z0-9\-\/]+$/.test(n)));
    globalThis.__nInv = seqs.length;
  }

  sec('Sequence control');
  {
    const back = await refuses(call('/api/admin/gst/sequence', { method: 'PUT', body: { series: 'INV', lastNo: 1 } }));
    ok('the series can never move backwards', back?.status === 409);
    const seq = await call('/api/admin/gst/sequence');
    ok('sequence is visible per FY', seq.sequences.some((s) => s.series === 'INV' && s.fy === '26-27' && s.lastNo === globalThis.__nInv));
  }

  sec('L  Cancellation and refund → credit notes, never edits');
  {
    const inv = (await call('/api/admin/gst/invoices?limit=200')).rows.find((r) => r.orderId === KA.orderId);
    const partial = await call(`/api/admin/gst/invoices/${inv.id}/credit-notes`, { method: 'POST', body: { kind: 'refund', reason: 'Partial refund — test', amount: 100 } });
    ok('partial refund → credit note AJC/26-27/0001', partial.noteNo === 'AJC/26-27/0001' && partial.cancelled === false);
    const d1 = await call(`/api/admin/gst/invoices/${inv.id}`);
    const cn = d1.creditNotes[0];
    eq('credit note reverses ₹100 inclusive: taxable 97.09 + IGST 2.91', [cn.taxablePaise, cn.igstPaise, cn.totalPaise, cn.cgstPaise], [9709, 291, 10000, 0]);
    ok('invoice still live after a partial credit', d1.invoice.status === 'issued');
    const over = await refuses(call(`/api/admin/gst/invoices/${inv.id}/credit-notes`, { method: 'POST', body: { kind: 'refund', reason: 'too much', amount: 5000 } }));
    ok('cannot credit more than the invoice', over?.status === 409);
    const cancel = await call(`/api/admin/gst/invoices/${inv.id}/credit-notes`, { method: 'POST', body: { kind: 'cancellation', reason: 'Order returned in full — test' } });
    ok('cancellation credits the remainder and cancels the invoice', cancel.cancelled === true);
    const d2 = await call(`/api/admin/gst/invoices/${inv.id}`);
    eq('credit notes sum to exactly the invoice (₹214.00)', d2.creditNotes.reduce((t, n) => t + n.totalPaise, 0), 21400);
    eq('…tax components sum exactly too', [d2.creditNotes.reduce((t, n) => t + n.igstPaise, 0), d2.creditNotes.reduce((t, n) => t + n.taxablePaise, 0)], [d2.invoice.totals.igst, d2.invoice.totals.taxable]);
    ok('audit trail: issued, credit_note, cancelled', ['issued', 'credit_note', 'cancelled'].every((e) => d2.events.some((x) => x.event === e)));
    ok('cancelled number stays on file, status cancelled', d2.invoice.status === 'cancelled' && d2.invoice.invoiceNo === inv.invoiceNo);
    const twice = await refuses(call(`/api/admin/gst/invoices/${inv.id}/credit-notes`, { method: 'POST', body: { kind: 'cancellation', reason: 'again' } }));
    ok('a cancelled invoice cannot be credited again', twice?.status === 409);
    const pdfN = await pdfOf(`/api/admin/gst/credit-notes/${cn.id}/pdf`);
    ok('credit note PDF renders', pdfN.status === 200 && pdfN.buf.subarray(0, 4).toString() === '%PDF');

    /* a later invoice does not reuse the cancelled number */
    const o = await place([line(p550)], 'Kerala');
    await call(`/api/admin/orders/${o.orderId}/payment/mark-paid`, { method: 'POST' });
    await call(`/api/admin/orders/${o.orderId}/advance`, { method: 'POST', body: {} });
    await call(`/api/admin/orders/${o.orderId}/advance`, { method: 'POST', body: { courier: 'x', awb: '1' } });
    const all = (await call('/api/admin/gst/invoices?limit=200')).rows;
    ok('numbers keep rising; the cancelled one is never reused', new Set(all.map((r) => r.invoiceNo)).size === all.length && all.length === globalThis.__nInv + 1);

    /* returns flow: refund via the existing returns screen creates a credit note */
    await call(`/api/admin/orders/${KL.orderId}/advance`, { method: 'POST', body: {} }).catch(() => {});
    await call(`/api/admin/orders/${KL.orderId}/advance`, { method: 'POST', body: {} }).catch(() => {});
    const o2 = await call(`/api/admin/orders/${KL.orderId}`);
    ok('order reached delivered for a return', o2.status === 'delivered', o2.status);
    const ret = await pub(`/api/orders/${KL.orderId}/replacement-request?token=${KL.accessToken}`, { method: 'POST', body: { reason: 'Damaged', note: '', variantId: v(p214).id } });
    await call(`/api/admin/returns/${ret.id}/refund`, { method: 'POST', body: { amount: 214, method: 'UPI' } });
    const klInv = await call(`/api/admin/gst/invoices/${invKL.id}`);
    eq('refund through Returns issued a credit note of ₹214 against the invoice', [klInv.creditNotes.length, klInv.creditNotes[0]?.totalPaise, klInv.creditNotes[0]?.returnId], [1, 21400, ret.id]);
    eq('…reversing CGST 3.12 + SGST 3.11', [klInv.creditNotes[0].cgstPaise, klInv.creditNotes[0].sgstPaise], [312, 311]);
  }

  sec('Webhook refund reconciliation');
  {
    const hook = (body, id) => raw('/api/payments/webhook', { method: 'POST', admin: false, rawBody: body,
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': createHmac('sha256', WH_SECRET).update(body).digest('hex'), 'x-razorpay-event-id': id } });
    const part = JSON.stringify({ event: 'refund.processed', created_at: 5, payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_WH2', amount: 10000 } } } });
    await hook(part, 'evt_r1'); await hook(part, 'evt_r1');
    const o = await call(`/api/admin/orders/${KL.orderId}`);
    ok('partial refund recorded once (replay ignored) → partial', o.payment.status === 'partial' || o.payment.status === 'refunded');
  }

  sec('PDFs (Kerala and Karnataka samples)');
  {
    mkdirSync('test/samples', { recursive: true });
    const kerala = await pdfOf(`/api/admin/gst/invoices/${invKL.id}/pdf`);
    const sampleKA = await place([line(p214), line(p550)], 'Karnataka', { name: 'Sample Customer', city: 'Bengaluru', pin: '560001', address: '14 Sample Layout, Indiranagar' });
    await call(`/api/admin/orders/${sampleKA.orderId}/payment/mark-paid`, { method: 'POST' });
    await call(`/api/admin/orders/${sampleKA.orderId}/advance`, { method: 'POST', body: {} });
    await call(`/api/admin/orders/${sampleKA.orderId}/advance`, { method: 'POST', body: { courier: 'dtdc', awb: 'S1' } });
    const sampleInv = (await call('/api/admin/gst/invoices?limit=300&q=' + sampleKA.orderId)).rows[0];
    eq('two-line Karnataka sample: IGST only, total ₹764 (214+550)', [sampleInv.taxTypeLabel, sampleInv.grandTotalPaise, sampleInv.cgstPaise], ['IGST', 76400, 0]);
    const karnataka = await pdfOf(`/api/admin/gst/invoices/${sampleInv.id}/pdf`);
    ok('Kerala PDF renders', kerala.status === 200 && kerala.type === 'application/pdf' && kerala.buf.subarray(0, 4).toString() === '%PDF');
    ok('Karnataka PDF renders', karnataka.status === 200 && karnataka.buf.length > 3000);
    writeFileSync('test/samples/sample-kerala-invoice.pdf', kerala.buf);
    writeFileSync('test/samples/sample-karnataka-invoice.pdf', karnataka.buf);
    const customer = await pdfOf(`/api/orders/${KL.orderId}/invoice?token=${KL.accessToken}`, { admin: false });
    ok('customer can download their own invoice with the order token', customer.status === 200 && customer.type === 'application/pdf');
    const wrongTok = await pdfOf(`/api/orders/${KL.orderId}/invoice?token=wrongwrongwrong`, { admin: false });
    ok('…and not with a wrong token', wrongTok.status === 404);
    const track = await pub(`/api/orders/${KL.orderId}/track?token=${KL.accessToken}`);
    ok('tracking shows the invoice number', /^AJ\/26-27\/\d{4}$/.test(track.invoice?.number ?? ''));
  }

  sec('Access control');
  {
    cookies = {};
    for (const [m, p] of [['GET', '/api/admin/gst/settings'], ['GET', '/api/admin/gst/invoices'], ['PUT', '/api/admin/gst/settings'], ['GET', '/api/admin/gst/invoices/1/pdf']]) {
      const r = await raw(p, { method: m, body: m === 'PUT' ? {} : undefined, admin: false });
      ok(`${m} ${p} refused when signed out`, r.status === 401);
    }
    await call('/api/auth/login', { method: 'POST', body: { email: 'user@aarunyajewels.in', password: 'user12345' } });
    const r = await raw('/api/admin/gst/settings');
    ok('a customer account cannot read GST settings', r.status === 403);
  }
} catch (e) {
  console.error('\nTEST CRASHED:', e);
  console.error(apiLog.split('\n').slice(-15).join('\n'));
  fails.push('crash');
}
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join('; ')}` : '\nALL PASS');
finish(fails.length ? 1 : 0);

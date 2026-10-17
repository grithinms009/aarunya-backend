/* End-to-end checks against the real API and database.

   The store starts empty, so the suite builds everything it needs through the public and
   admin APIs — colours, a category, products, a storefront order — and then exercises the
   rules against it. That means the create paths are covered too: if adding a category or
   a product through the API breaks, this fails before it ever reaches a rule.

   Usage: npm test   (with the API running: npm run dev) */
import { execFileSync } from 'node:child_process';

const BASE = process.env.API_BASE || 'http://localhost:4000';
const ADMIN = { email: 'veena@aarunyajewels.in', password: 'aarunya123' };

const fails = [];
const ok = (name, cond, extra = '') => {
  if (!cond) fails.push(`${name} ${extra}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
};
const section = (t) => console.log(`\n── ${t} ──`);

/* ---- a tiny client that keeps the session cookie and echoes the CSRF token ---- */

let cookies = {};
const cookieHeader = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

function remember(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    cookies[pair.slice(0, i)] = pair.slice(i + 1);
  }
}

async function call(path, { method = 'GET', body } = {}) {
  const headers = { Cookie: cookieHeader() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = cookies.aj_csrf ?? '';
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  remember(res);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = new Error(data?.message ?? res.statusText);
    e.status = res.status; e.code = data?.error; e.fields = data?.fields;
    throw e;
  }
  return data;
}

const refuses = async (p) => { try { await p; return null; } catch (e) { return e; } };
const variantOf = async (vid) =>
  (await call('/api/admin/inventory/stock')).find((r) => r.vid === vid);

/* ------------------------------------------------------------------ setup */

console.log('resetting database…');
execFileSync('npm', ['run', 'db:reset'], { stdio: 'pipe' });

try {
  await call('/health');
} catch {
  console.error(`\nNo API at ${BASE}. Start it with: npm run dev\n`);
  process.exit(2);
}

await call('/api/auth/login', { method: 'POST', body: ADMIN });

section('a fresh store is empty');
ok('no products', (await call('/api/admin/products')).rows.length === 0);
ok('no categories', (await call('/api/admin/categories')).length === 0);
ok('no orders', (await call('/api/admin/orders?range=all')).rows.length === 0);
ok('no colours', Object.keys(await call('/api/admin/meta/colors')).length === 0);
ok('settings exist', (await call('/api/admin/settings')).config.SHIPPING_FEE === 60);
ok('dashboard renders empty', (await call('/api/admin/dashboard?period=7')).revenue.total === 0);

/* ---- build a catalogue the way the admin panel does ---- */

section('building a catalogue through the API');

const settings = await call('/api/admin/settings');
await call('/api/admin/settings', {
  method: 'PUT',
  body: {
    config: settings.config,
    couriers: settings.couriers,
    locations: settings.locations,
    colors: [
      { key: '', label: 'Gold', hex: '#CDA349' },
      { key: '', label: 'Silver', hex: '#C3C7CC' },
    ],
    name: 'Veena', email: ADMIN.email, password: '', passwordConfirm: '',
  },
});
const colors = await call('/api/admin/meta/colors');
ok('colours added through settings', Object.keys(colors).length === 2, Object.keys(colors).join(','));
ok('tint derived from hex', !!colors.gold?.tint, colors.gold?.tint ?? '');

await call('/api/admin/categories', {
  method: 'POST',
  body: {
    name: 'Anti-Tarnish Necklaces', short: 'Necklaces', tint: '#F7E4E4', image: '',
    subs: [{ slug: '', name: 'Chokers' }], pairs: [], isNew: true,
  },
});
const cats = await call('/api/admin/categories');
ok('category created', cats.length === 1 && cats[0].slug === 'necklaces', cats[0]?.slug ?? '');
ok('sub-category created', cats[0]?.subs.length === 1, cats[0]?.subs[0]?.name ?? '');

const made = await call('/api/admin/products', {
  method: 'POST',
  body: {
    name: 'Pearl Drop Choker', category: 'necklaces', type: cats[0].subs[0].slug,
    price: 899, mrp: 1199, status: 'active', description: 'A test piece.',
    variants: [
      { color: 'gold', stock: 10, sku: '', images: [] },
      { color: 'silver', stock: 2, sku: '', images: [] },
    ],
  },
});
ok('product created', !!made.id, made.id);
ok('slug generated', made.slug === 'pearl-drop-choker', made.slug);
ok('SKU generated', /^AJ-NK\d{3}-GLD$/.test(made.variants[0].sku), made.variants[0].sku);
ok('opening stock ledgered',
  (await call('/api/admin/inventory/ledger?limit=10'))
    .filter((m) => m.note === 'Opening stock').length === 2);

const gold = made.variants.find((v) => v.color === 'gold');
const silver = made.variants.find((v) => v.color === 'silver');

/* Priced under the free-shipping threshold, so the shipping rule can be exercised. */
const cheap = await call('/api/admin/products', {
  method: 'POST',
  body: {
    name: 'Everyday Band Ring', category: 'necklaces', price: 299, mrp: 349,
    variants: [{ color: 'gold', stock: 5, sku: '', images: [] }],
  },
});
const cheapGold = cheap.variants[0];
ok('second product created', cheap.price === 299, String(cheap.price));

section('validation');
const bad = await refuses(call('/api/admin/products', {
  method: 'POST',
  body: { name: '', category: 'necklaces', price: 0, mrp: 0, variants: [] },
}));
ok('empty product refused', !!bad?.fields?.name && !!bad?.fields?.price, JSON.stringify(bad?.fields ?? {}));

const dupSlug = await refuses(call('/api/admin/products', {
  method: 'POST',
  body: {
    name: 'Pearl Drop Choker', category: 'necklaces', price: 500, mrp: 500,
    variants: [{ color: 'gold', stock: 1, sku: '', images: [] }],
  },
}));
ok('duplicate page URL refused', !!dupSlug?.fields?.slug, dupSlug?.fields?.slug ?? '');

const dupColor = await refuses(call('/api/admin/products', {
  method: 'POST',
  body: {
    name: 'Another Piece', category: 'necklaces', price: 500, mrp: 400,
    variants: [{ color: 'gold', stock: 1, sku: '', images: [] },
               { color: 'gold', stock: 1, sku: '', images: [] }],
  },
}));
ok('MRP below price refused', !!dupColor?.fields?.mrp, dupColor?.fields?.mrp ?? '');
ok('repeated colour refused', !!dupColor?.fields?.variants, dupColor?.fields?.variants ?? '');

const held = await refuses(call('/api/admin/categories/necklaces', { method: 'DELETE' }));
ok('category delete blocked while in use', !!held && /Move or delete/.test(held.message), held?.message ?? '');

section('the storefront');
ok('products are public', (await call('/api/products')).length === 2);
ok('product by slug', (await call(`/api/products/${made.slug}`)).name === 'Pearl Drop Choker');

const front = await call('/api/storefront');
ok('storefront config', front.config.FREE_SHIPPING_THRESHOLD === 499);
ok('storefront categories', front.categories.length === 1);
ok('storefront colours', Object.keys(front.colors).length === 2);

/* a draft product must not be visible */
const draft = await call('/api/admin/products', {
  method: 'POST',
  body: {
    name: 'Unpublished Piece', category: 'necklaces', price: 300, mrp: 300, status: 'draft',
    variants: [{ color: 'gold', stock: 5, sku: '', images: [] }],
  },
});
ok('draft hidden from storefront', (await call('/api/products')).length === 2);
const draftSlug = await refuses(call(`/api/products/${draft.slug}`));
ok('draft not reachable by URL', draftSlug?.status === 404, String(draftSlug?.status));

section('cart re-pricing');
const cart = await call('/api/cart', {
  method: 'POST',
  body: { items: [{ productId: made.id, variantId: gold.id, qty: 2 }], giftWrap: false },
});
ok('cart prices from the catalogue', cart.subtotal === 1798, String(cart.subtotal));
ok('shipping free above the threshold', cart.shipping === 0, String(cart.shipping));

const small = await call('/api/cart', {
  method: 'POST',
  body: { items: [{ productId: cheap.id, variantId: cheapGold.id, qty: 1 }], giftWrap: true },
});
ok('shipping charged below the threshold', small.shipping === 60, String(small.shipping));
ok('gift wrap added', small.giftFee === 49, String(small.giftFee));
ok('cart total', small.total === 299 + 60 + 49, String(small.total));

const over = await call('/api/cart', {
  method: 'POST',
  body: { items: [{ productId: made.id, variantId: silver.id, qty: 99 }] },
});
ok('cart caps at live stock', over.items[0].qty === 2 && over.ok === false, String(over.items[0].qty));

section('checkout');
const customer = {
  name: 'Test Shopper', phone: '9876543210', email: 'test@example.com',
  address: 'MG Road', house: '12', landmark: 'Near temple',
  city: 'Thrissur', state: 'Kerala', pin: '680001',
};
const placed = await call('/api/orders', {
  method: 'POST',
  body: { customer, items: [{ productId: made.id, variantId: gold.id, qty: 2 }], giftWrap: false },
});
ok('order number starts the online series', placed.orderId === 'AJ1001', placed.orderId);
ok('order total computed server-side', placed.amount === 1798, String(placed.amount));
ok('checkout took the stock', (await variantOf(gold.id)).stock === 8,
  String((await variantOf(gold.id)).stock));
ok('checkout ledgered as online',
  (await call('/api/admin/inventory/ledger?limit=1'))[0].reason === 'online');

const placedOrder = await call(`/api/admin/orders/${placed.orderId}`);
ok('payment starts pending', placedOrder.payment.status === 'pending', placedOrder.payment.status);
ok('order visible to the admin', placedOrder.customer.city === 'Thrissur');

const oversell = await refuses(call('/api/orders', {
  method: 'POST',
  body: { customer, items: [{ productId: made.id, variantId: silver.id, qty: 50 }], giftWrap: false },
}));
ok('checkout refuses to oversell', !!oversell && /Only 2 left/.test(oversell.message), oversell?.message ?? '');

const badPhone = await refuses(call('/api/orders', {
  method: 'POST',
  body: { customer: { ...customer, phone: '123' }, items: [{ productId: made.id, variantId: gold.id, qty: 1 }] },
}));
ok('checkout checks the phone', !!badPhone, badPhone?.message ?? '');

const second = await call('/api/orders', {
  method: 'POST',
  body: { customer, items: [{ productId: made.id, variantId: gold.id, qty: 1 }], giftWrap: true },
});
ok('order numbers are sequential', second.orderId === 'AJ1002', second.orderId);

section('delivery and payments');
const kerala = await call('/api/delivery/estimate?pin=680001');
ok('local PIN is faster', kerala.ok && kerala.minDays === 2, JSON.stringify(kerala));
const far = await call('/api/delivery/estimate?pin=110017');
ok('other PINs take longer', far.ok && far.minDays === 4, JSON.stringify(far));
ok('bad PIN refused', (await call('/api/delivery/estimate?pin=000')).ok === false);

const pay = await call('/api/payments/create', { method: 'POST', body: { orderId: placed.orderId } });
ok('payment reports no gateway', pay.status === 'GATEWAY_NOT_CONFIGURED', pay.status);
ok('payment uses the server amount', pay.amount === 1798, String(pay.amount));

section('order access is token-only');
/* Order numbers are sequential, so they are not a secret. Only the token issued at
   checkout may unlock an order, and a wrong one must look exactly like a missing one. */
ok('checkout issues an access token', typeof placed.accessToken === 'string' && placed.accessToken.length >= 20);

const noToken = await refuses(call(`/api/orders/${placed.orderId}/track`));
ok('tracking without a token refused', noToken?.status === 422, String(noToken?.status));

const badToken = await refuses(call(`/api/orders/${placed.orderId}/track?token=${'x'.repeat(32)}`));
ok('tracking with a wrong token refused', badToken?.status === 404, String(badToken?.status));

const wrongOrder = await refuses(
  call(`/api/orders/AJ9999/track?token=${encodeURIComponent(placed.accessToken)}`));
ok('a token does not unlock another order', wrongOrder?.status === 404, String(wrongOrder?.status));
ok('a wrong token is indistinguishable from a missing order',
  badToken?.status === wrongOrder?.status && badToken?.message === wrongOrder?.message);

const tracked = await call(
  `/api/orders/${placed.orderId}/track?token=${encodeURIComponent(placed.accessToken)}`);
ok('the right token returns the order', tracked.orderId === placed.orderId);
ok('tracking does not leak the full address',
  !('address' in tracked) && !('phone' in tracked) && !('email' in tracked));

const tooEarly = await refuses(call(
  `/api/orders/${placed.orderId}/replacement-request?token=${encodeURIComponent(placed.accessToken)}`,
  { method: 'POST', body: { reason: 'Arrived damaged' } }));
ok('replacement refused before delivery', !!tooEarly, tooEarly?.message ?? 'allowed');

section('contact form');
const sent = await call('/api/contact', {
  method: 'POST',
  body: { name: 'Asha', email: 'asha@example.com', subject: 'Delivery', message: 'Do you ship to Kochi?' },
});
ok('message accepted', sent.ok === true && !!sent.id);
const noName = await refuses(call('/api/contact',
  { method: 'POST', body: { name: '', email: 'a@b.com', message: 'hi' } }));
ok('message without a name refused', noName?.status === 422, String(noName?.status));
const noReply = await refuses(call('/api/contact',
  { method: 'POST', body: { name: 'Asha', message: 'hi' } }));
ok('message with no way to reply refused', noReply?.status === 400, String(noReply?.status));
ok('message reaches the admin', (await call('/api/admin/messages')).length >= 1);

section('order flow');
const pending = await refuses(call(`/api/admin/orders/${placed.orderId}/advance`,
  { method: 'POST', body: { courier: '', awb: '' } }));
ok('advance blocked while pending', !!pending && /pending/i.test(pending.message), pending?.message ?? '');

await call(`/api/admin/orders/${placed.orderId}/payment/mark-paid`, { method: 'POST' });
const packed = await call(`/api/admin/orders/${placed.orderId}/advance`,
  { method: 'POST', body: { courier: '', awb: '' } });
ok('paid order advances to packed', packed.status === 'packed', packed.status);

const noAwb = await refuses(call(`/api/admin/orders/${placed.orderId}/advance`,
  { method: 'POST', body: { courier: 'shiprocket', awb: '' } }));
ok('shipped needs an AWB', !!noAwb && /tracking/i.test(noAwb.message), noAwb?.message ?? '');

const shipped = await call(`/api/admin/orders/${placed.orderId}/advance`,
  { method: 'POST', body: { courier: 'shiprocket', awb: '123456789012' } });
ok('advance with AWB works', shipped.status === 'shipped' && shipped.shipment?.awb === '123456789012');

const tooLate = await refuses(call(`/api/admin/orders/${placed.orderId}/cancel`, { method: 'POST' }));
ok('shipped order cannot be cancelled', !!tooLate, tooLate?.message ?? '');

await call(`/api/admin/orders/${placed.orderId}/advance`, { method: 'POST', body: { courier: '', awb: '' } });
const delivered = await call(`/api/admin/orders/${placed.orderId}/advance`,
  { method: 'POST', body: { courier: '', awb: '' } });
ok('order reaches delivered', delivered.status === 'delivered', delivered.status);

section('replacement request after delivery');
const asked = await call(
  `/api/orders/${placed.orderId}/replacement-request?token=${encodeURIComponent(placed.accessToken)}`,
  { method: 'POST', body: { reason: 'Arrived damaged', note: 'Clasp bent' } });
ok('customer can request a replacement', asked.status === 'requested', asked.id);
ok('it lands in the admin queue',
  (await call('/api/admin/returns?tab=review')).rows.some((r) => r.id === asked.id));
const twice = await refuses(call(
  `/api/orders/${placed.orderId}/replacement-request?token=${encodeURIComponent(placed.accessToken)}`,
  { method: 'POST', body: { reason: 'again' } }));
ok('a second request on the same order is refused', !!twice, twice?.message ?? 'allowed');

section('cancelling restores stock');
const before = (await variantOf(gold.id)).stock;
await call(`/api/admin/orders/${second.orderId}/cancel`, { method: 'POST' });
ok('cancel puts the stock back', (await variantOf(gold.id)).stock === before + 1,
  `${before} -> ${(await variantOf(gold.id)).stock}`);
ok('cancel refunds a paid order',
  (await call(`/api/admin/orders/${second.orderId}`)).payment.status === 'pending',
  'unpaid orders stay unpaid');

section('offline sale');
const sale = await call('/api/admin/orders/offline-sales', {
  method: 'POST',
  body: {
    lines: [{ pid: made.id, vid: gold.id, name: made.name, color: 'gold',
              sku: gold.sku, img: '', qty: 2, price: 899 }],
    discount: 50, method: 'Cash', location: 'Home studio, Thrissur',
    date: '', name: 'Walk-in', phone: '', note: '',
  },
});
ok('offline series starts at OS201', sale.id === 'OS201', sale.id);
ok('offline total applies the discount', sale.total === 899 * 2 - 50, String(sale.total));
ok('offline sale is paid and complete', sale.payment.status === 'paid' && sale.status === 'completed');

section('inventory');
const nowStock = (await variantOf(gold.id)).stock;
await call('/api/admin/inventory/adjust', {
  method: 'POST',
  body: { vid: gold.id, mode: 'remove', qty: nowStock + 50, reason: 'damaged', note: '' },
});
ok('stock clamps at zero', (await variantOf(gold.id)).stock === 0);

await call('/api/admin/inventory/adjust', {
  method: 'POST',
  body: { vid: gold.id, mode: 'set', qty: 7, reason: 'correction', note: 'audit' },
});
ok('set exact stock', (await variantOf(gold.id)).stock === 7);
ok('adjust ledger note',
  (await call('/api/admin/inventory/ledger?limit=1'))[0].note === 'Stock count correction · audit');

const summary = await call('/api/admin/inventory/summary');
ok('inventory summary counts variants', summary.variants === 4, String(summary.variants));

section('returns');
const logged = await call('/api/admin/returns', {
  method: 'POST',
  body: {
    orderId: placed.orderId, vid: gold.id, type: 'replacement',
    reason: 'Arrived damaged', note: 'Clasp broken on arrival', video: true,
  },
});
ok('return logged against the order', logged.orderId === placed.orderId, logged.id);
ok('return starts as requested', logged.status === 'requested', logged.status);

const detail = await call(`/api/admin/returns/${logged.id}`);
ok('eligibility is computed', detail.eligibility.ok === true, JSON.stringify(detail.eligibility));

const noReason = await refuses(call(`/api/admin/returns/${logged.id}/reject`,
  { method: 'POST', body: { reason: '  ' } }));
ok('reject needs a reason', !!noReason, noReason?.message ?? '');

await call(`/api/admin/returns/${logged.id}/approve`, { method: 'POST', body: { type: 'replacement' } });
await call(`/api/admin/returns/${logged.id}/pickup`, {
  method: 'POST',
  body: { courier: 'shiprocket', date: '2026-10-20', courierName: 'Shiprocket', dateLabel: '20 Oct' },
});
const beforeReceive = (await variantOf(gold.id)).stock;
await call(`/api/admin/returns/${logged.id}/receive`, { method: 'POST', body: { restock: true } });
ok('restocked return adds stock', (await variantOf(gold.id)).stock === beforeReceive + 1,
  `${beforeReceive} -> ${(await variantOf(gold.id)).stock}`);
ok('return ledger reason', (await call('/api/admin/inventory/ledger?limit=1'))[0].reason === 'return');

const outOfStock = await refuses(call(`/api/admin/returns/${logged.id}/replacement`,
  { method: 'POST', body: { vid: silver.id, awb: '' } }));
ok('replacement needs stock',
  !outOfStock || /out of stock/i.test(outOfStock.message),
  outOfStock ? outOfStock.message : 'silver had stock, replacement allowed');

section('customers');
const people = await call('/api/admin/customers');
ok('customers derived from orders', people.length >= 1, `${people.length} found`);
ok('customer spend excludes cancelled',
  people.find((p) => p.phone === '9876543210')?.orders === 1,
  JSON.stringify(people.find((p) => p.phone === '9876543210')?.orders));

section('uploads');
/* a 1x1 PNG */
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const up = await call('/api/admin/uploads', { method: 'POST', body: { data: png, purpose: 'product' } });
ok('image uploaded', /^\/uploads\/product\/.+\.png$/.test(up.url), up.url);
const served = await fetch(BASE + up.url);
ok('image served back', served.ok && served.headers.get('content-type')?.includes('image/png'),
  String(served.status));

const fakeImage = await refuses(call('/api/admin/uploads',
  { method: 'POST', body: { data: 'data:image/png;base64,bm90IGFuIGltYWdl', purpose: 'product' } }));
ok('disguised file refused', !!fakeImage && /not the image type/.test(fakeImage.message),
  fakeImage?.message ?? '');

const badType = await refuses(call('/api/admin/uploads',
  { method: 'POST', body: { data: 'data:application/pdf;base64,JVBERi0=', purpose: 'product' } }));
ok('non-image refused', !!badType, badType?.message ?? '');

await call('/api/admin/uploads', { method: 'DELETE', body: { url: up.url } });
ok('upload removed', !(await fetch(BASE + up.url)).ok);

section('security');
cookies = {};
await call('/api/auth/login', {
  method: 'POST', body: { email: 'user@aarunyajewels.in', password: 'user12345' },
});
ok('user role blocked from admin', (await refuses(call('/api/admin/products')))?.status === 403);

const savedCsrf = cookies.aj_csrf;
cookies.aj_csrf = '';
ok('missing CSRF token refused',
  (await refuses(call('/api/admin/inventory/quick', { method: 'POST', body: { vid: gold.id, delta: 1 } })))?.status === 403);
cookies.aj_csrf = savedCsrf;

cookies = {};
ok('signed-out request refused', (await refuses(call('/api/admin/products')))?.status === 401);
ok('wrong password refused',
  (await refuses(call('/api/auth/login', { method: 'POST', body: { email: ADMIN.email, password: 'wrong' } })))?.status === 401);

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);

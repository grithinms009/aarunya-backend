/* The storefront's surface. Draft products and hidden offers never appear here, so an
   unpublished piece can't be reached by guessing its URL.

   Money is never trusted from the client: the cart is re-priced and the order total is
   recomputed from the catalogue and the store's settings before anything is written. */
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query, tx } from '../db/pool.js';
import { loadCategories, loadColors, loadOrder, loadProducts } from '../lib/repo.js';
import { getConfig } from '../lib/settings.js';
import { applyStock } from '../lib/stock.js';
import { nextOrderNo } from '../lib/orderno.js';
import { num } from '../lib/format.js';
import { readContent } from './storefront.js';
import { badRequest, notFound, ruleError, wrap } from '../lib/errors.js';
import { parseBody, parseQuery } from '../middleware/validate.js';

export const router = Router();

/** Everything the storefront needs to render its chrome in one call. */
router.get('/storefront', wrap(async (_req, res) => {
  const [config, content, categories, colors] = await Promise.all([
    getConfig(), readContent(), loadCategories(), loadColors(),
  ]);
  res.json({
    config,
    banners: content.banners,
    offers: content.offers.filter((o) => !o.hidden),
    announcements: content.announcements,
    categories,
    colors,
    /** category slug → the slugs it suggests pairing with. */
    pairings: Object.fromEntries(categories.map((c) => [c.slug, c.pairs])),
    policies: {
      returnWindow: config.returnWindow,
      nonEligible: config.nonEligible,
      requireVideo: config.requireVideo,
      allowRefund: config.allowRefund,
    },
  });
}));

router.get('/categories', wrap(async (_req, res) => res.json(await loadCategories())));

router.get('/products', parseQuery(z.object({
  category: z.string().max(100).optional(),
  type: z.string().max(100).optional(),
  color: z.string().max(100).optional(),
  price: z.enum(['all', 'u500', '500-1000', 'o1000']).optional(),
  sale: z.string().max(10).optional(),
  instock: z.string().max(10).optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(['new', 'popular', 'price-asc', 'price-desc']).default('popular'),
})), wrap(async (req, res) => {
  const q = req.valid;
  const where = [`p.status = 'active'`];
  const params = [];
  if (q.category) { params.push(q.category); where.push(`p.category_slug = $${params.length}`); }
  if (q.type) { params.push(q.type); where.push(`p.sub_slug = $${params.length}`); }
  if (q.q) {
    params.push(`%${q.q.trim()}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
  }
  if (q.price === 'u500') where.push(`p.price < 500`);
  if (q.price === '500-1000') where.push(`p.price BETWEEN 500 AND 1000`);
  if (q.price === 'o1000') where.push(`p.price > 1000`);
  if (q.sale) where.push(`p.mrp > p.price`);

  let rows = await loadProducts({ sql: where.join(' AND '), params });
  if (q.color) rows = rows.filter((p) => p.variants.some((v) => v.color === q.color));
  if (q.instock) rows = rows.filter((p) => p.variants.some((v) => v.stock > 0));

  const sorters = {
    new: (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
    popular: (a, b) => b.popularity - a.popularity,
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
  };
  res.json(rows.sort(sorters[q.sort]));
}));

router.get('/products/:slug', wrap(async (req, res) => {
  const [p] = await loadProducts({
    sql: `p.slug = $1 AND p.status = 'active'`, params: [req.params.slug],
  });
  if (!p) throw notFound('That piece is no longer available');
  res.json(p);
}));

/* ---------------------------------------------------------------- cart */

const cartItems = z.object({
  items: z.array(z.object({
    productId: z.string().max(120),
    variantId: z.string().max(120),
    qty: z.coerce.number().int().min(1).max(100),
  })).max(100).default([]),
});

/** Looks up live price and stock for a set of cart lines. */
async function priceLines(items) {
  if (!items.length) return [];
  const { rows } = await query(
    `SELECT v.id AS vid, v.stock, v.sku, v.color_key, p.id AS pid, p.name, p.slug,
            p.price, p.mrp, p.status, p.gift_wrap,
            (SELECT i.url FROM variant_image i WHERE i.variant_id = v.id ORDER BY i.slot LIMIT 1) AS img
       FROM variant v JOIN product p ON p.id = v.product_id
      WHERE v.id = ANY($1)`,
    [items.map((i) => i.variantId)],
  );
  const byVid = new Map(rows.map((r) => [r.vid, r]));

  return items.map((i) => {
    const v = byVid.get(i.variantId);
    if (!v || v.status !== 'active') {
      return { ...i, ok: false, reason: 'unavailable', qty: 0, price: 0 };
    }
    /* Quantity is capped at live stock rather than refused, so the cart self-corrects. */
    const qty = Math.min(i.qty, v.stock);
    return {
      productId: v.pid, variantId: v.vid, slug: v.slug, name: v.name,
      color: v.color_key, sku: v.sku, img: v.img ?? '',
      price: v.price, mrp: v.mrp, stock: v.stock, qty,
      ok: qty > 0 && qty === i.qty,
      reason: v.stock === 0 ? 'out_of_stock' : qty < i.qty ? 'reduced' : '',
    };
  });
}

/** Totals from the store's own settings — the client never decides these. */
function totalsFor(lines, config, giftWrap) {
  const subtotal = lines.reduce((t, l) => t + l.price * l.qty, 0);
  const threshold = num(config.FREE_SHIPPING_THRESHOLD);
  const fee = num(config.SHIPPING_FEE);
  const shipping = subtotal > 0 && subtotal < threshold ? fee : 0;
  const giftFee = giftWrap ? num(config.GIFT_WRAP_FEE) : 0;
  return { subtotal, shipping, giftFee, total: subtotal + shipping + giftFee };
}

/** POST /cart — re-prices and re-checks stock server-side. */
router.post('/cart', parseBody(cartItems.extend({ giftWrap: z.boolean().default(false) })),
  wrap(async (req, res) => {
    const lines = await priceLines(req.body.items);
    const config = await getConfig();
    res.json({
      ok: lines.every((l) => l.ok),
      items: lines,
      ...totalsFor(lines, config, req.body.giftWrap),
    });
  }));

/* ---------------------------------------------------------------- checkout */

const orderIn = z.object({
  customer: z.object({
    name: z.string().trim().min(1, 'Enter your name').max(120),
    phone: z.string().trim().max(20),
    email: z.string().trim().max(200).optional().default(''),
    address: z.string().trim().max(300).optional().default(''),
    house: z.string().trim().max(200).optional().default(''),
    landmark: z.string().trim().max(200).optional().default(''),
    city: z.string().trim().max(120).optional().default(''),
    state: z.string().trim().max(120).optional().default(''),
    pin: z.string().trim().max(10).optional().default(''),
  }),
  items: z.array(z.object({
    productId: z.string().max(120),
    variantId: z.string().max(120),
    qty: z.coerce.number().int().min(1).max(100),
  })).min(1, 'Your cart is empty'),
  giftWrap: z.boolean().default(false),
});

/* A checkout writes stock, so it is rate limited per IP. */
const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Please try again shortly.' },
});

/** POST /orders — creates the order with payment pending and reserves the stock. */
router.post('/orders', checkoutLimiter, parseBody(orderIn), wrap(async (req, res) => {
  const { customer, items, giftWrap } = req.body;

  const phone = customer.phone.replace(/\D/g, '');
  if (phone.length < 10) throw badRequest('Check the phone number (10 digits)');
  if (customer.pin && !/^[1-9]\d{5}$/.test(customer.pin)) {
    throw badRequest('Check the PIN code');
  }

  const config = await getConfig();

  const orderNo = await tx(async (c) => {
    /* Lock every variant first, so two checkouts can't oversell the same piece. */
    const locked = new Map();
    for (const i of items) {
      const { rows } = await c.query(
        `SELECT v.id, v.stock, v.sku, v.color_key, p.id AS pid, p.name, p.price, p.status,
                (SELECT im.url FROM variant_image im WHERE im.variant_id = v.id ORDER BY im.slot LIMIT 1) AS img
           FROM variant v JOIN product p ON p.id = v.product_id
          WHERE v.id = $1 FOR UPDATE OF v`,
        [i.variantId],
      );
      const v = rows[0];
      if (!v || v.status !== 'active') throw ruleError('A piece in your cart is no longer available');
      if (v.stock < i.qty) {
        throw ruleError(`Only ${v.stock} left of ${v.name}. Please update your cart.`);
      }
      locked.set(i.variantId, v);
    }

    const lines = items.map((i) => {
      const v = locked.get(i.variantId);
      return {
        pid: v.pid, vid: v.id, name: v.name, color: v.color_key, sku: v.sku,
        qty: i.qty, price: v.price, img: v.img ?? '',
      };
    });
    const { subtotal, shipping, giftFee, total } = totalsFor(lines, config, giftWrap);

    const id = await nextOrderNo(c, 'online');
    const address = [customer.house, customer.address, customer.landmark]
      .map((x) => x.trim()).filter(Boolean).join(', ');

    await c.query(
      `INSERT INTO "order" (id, channel, status, cust_name, cust_phone, cust_email, address,
         city, state, pin, subtotal, shipping, gift_wrap, gift_fee, discount, total,
         pay_status, pay_method, provider)
       VALUES ($1,'online','new',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,'pending','',$14)`,
      [id, customer.name, phone, customer.email, address, customer.city, customer.state,
       customer.pin, subtotal, shipping, giftWrap, giftFee, total,
       config.PAYMENT_PROVIDER ?? null],
    );

    let n = 0;
    for (const l of lines) {
      await c.query(
        `INSERT INTO order_item (order_id, product_id, variant_id, name, color_key, sku, qty, price, img, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, l.pid, l.vid, l.name, l.color, l.sku, l.qty, l.price, l.img, n++],
      );
      /* The stock leaves the shelf when the order is placed, as the admin's POS does. */
      await applyStock(c, l.vid, -l.qty, 'online', id);
    }

    await c.query(
      `INSERT INTO order_history (order_id, status, note) VALUES ($1,'new',$2)`,
      [id, 'Order placed on website'],
    );
    return id;
  });

  const order = await loadOrder(orderNo);
  res.status(201).json({ orderId: orderNo, status: 'CREATED', amount: order.total });
}));

/* ---------------------------------------------------------------- delivery */

/** GET /delivery/estimate?pin= — working days, from the store's settings. */
router.get('/delivery/estimate', parseQuery(z.object({ pin: z.string().max(10) })),
  wrap(async (req, res) => {
    const pin = req.valid.pin.trim();
    if (!/^[1-9]\d{5}$/.test(pin)) return res.json({ ok: false });

    const config = await getConfig();
    const prefixes = config.HOME_STATE_PIN_PREFIXES ?? [];
    const days = config.DELIVERY_DAYS ?? { local: [2, 3], rest: [4, 7] };
    const local = prefixes.some((x) => pin.startsWith(String(x)));
    const [minDays, maxDays] = days[local ? 'local' : 'rest'] ?? [4, 7];
    res.json({ ok: true, pin, minDays, maxDays, cod: false });
  }));

/* ---------------------------------------------------------------- payments */

/** POST /payments/create — no gateway is configured, and this says so rather than
 *  pretending a payment succeeded. Wire a provider here when one is chosen. */
router.post('/payments/create', parseBody(z.object({
  orderId: z.string().max(60),
  amount: z.coerce.number().min(0).optional(),
})), wrap(async (req, res) => {
  const order = await loadOrder(req.body.orderId);
  if (!order) throw notFound('That order no longer exists');
  const config = await getConfig();
  res.json({
    status: 'GATEWAY_NOT_CONFIGURED',
    provider: config.PAYMENT_PROVIDER ?? 'razorpay',
    orderId: order.id,
    /* The server's amount, never the client's. */
    amount: order.total,
  });
}));

/** GET /orders/{orderNo}/status — lets the thank-you page confirm what was placed. */
router.get('/orders/:orderNo/status', wrap(async (req, res) => {
  const order = await loadOrder(req.params.orderNo);
  if (!order) throw notFound('That order no longer exists');
  res.json({
    orderId: order.id,
    status: order.status,
    payment: order.payment.status,
    amount: order.total,
    placedAt: order.createdAt,
    items: order.items.map((l) => ({ name: l.name, color: l.color, qty: l.qty, price: l.price })),
  });
}));

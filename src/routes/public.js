/* The storefront's surface. Draft products and hidden offers never appear here, so an
   unpublished piece can't be reached by guessing its URL.

   Money is never trusted from the client: the cart is re-priced and the order total is
   recomputed from the catalogue and the store's settings before anything is written. */
import { Router } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
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
    /* The shopper's private handle on this order. Knowing the order number is not
       enough to see it; this is what the tracking page asks for. */
    const token = randomBytes(24).toString('base64url');
    const address = [customer.house, customer.address, customer.landmark]
      .map((x) => x.trim()).filter(Boolean).join(', ');

    await c.query(
      `INSERT INTO "order" (id, channel, status, cust_name, cust_phone, cust_email, address,
         city, state, pin, subtotal, shipping, gift_wrap, gift_fee, discount, total,
         pay_status, pay_method, provider, access_token)
       VALUES ($1,'online','new',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,'pending','',$14,$15)`,
      [id, customer.name, phone, customer.email, address, customer.city, customer.state,
       customer.pin, subtotal, shipping, giftWrap, giftFee, total,
       config.PAYMENT_PROVIDER ?? null, token],
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
    return { id, token };
  });

  const order = await loadOrder(orderNo.id);
  res.status(201).json({
    orderId: orderNo.id,
    status: 'CREATED',
    amount: order.total,
    /* Returned once, to the shopper who placed the order. Keep it to track the order. */
    accessToken: orderNo.token,
  });
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

/* ---------------------------------------------------------------- tracking */

/** Constant-time compare, so a wrong token cannot be narrowed down by timing. */
function tokenMatches(given, stored) {
  if (!given || !stored) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(stored));
  return a.length === b.length && timingSafeEqual(a, b);
}

/* Tracking is a lookup against a secret, so it is throttled like one. */
const trackLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Please try again shortly.' },
});

/**
 * GET /orders/{orderNo}/track?token=…
 *
 * Returns only what the shopper needs to follow their parcel, and only to someone holding
 * the access token issued at checkout. Knowing or guessing an order number is deliberately
 * not enough: order numbers are sequential, so they are not a secret.
 *
 * A wrong token and a missing order give the same answer, so this cannot be used to work
 * out which order numbers exist.
 */
router.get('/orders/:orderNo/track', trackLimiter,
  parseQuery(z.object({ token: z.string().min(8).max(200) })),
  wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT o.*, s.courier, s.awb, s.shipped_at, r.id AS return_id, r.status AS return_status
         FROM "order" o
         LEFT JOIN shipment s ON s.order_id = o.id
         LEFT JOIN return_request r ON r.id = o.return_id
        WHERE o.id = $1`,
      [req.params.orderNo],
    );
    const o = rows[0];
    if (!o || !tokenMatches(req.valid.token, o.access_token)) {
      throw notFound('We could not find an order with those details');
    }

    const { rows: items } = await query(
      `SELECT name, color_key, qty, price FROM order_item WHERE order_id = $1 ORDER BY sort_order`,
      [o.id],
    );
    const { rows: history } = await query(
      `SELECT status, note, at FROM order_history WHERE order_id = $1 ORDER BY at`, [o.id]);

    const courier = (config) => (config.couriers ?? []).find((c) => c.id === o.courier);
    const settings = await getConfig();
    const c = courier(settings);

    res.json({
      orderId: o.id,
      status: o.status,
      payment: o.pay_status,
      placedAt: o.created_at,
      total: o.total,
      /* Enough to recognise the order, without reprinting the full address. */
      name: o.cust_name,
      city: o.city,
      items: items.map((l) => ({ name: l.name, color: l.color_key, qty: l.qty, price: l.price })),
      shipment: o.awb
        ? {
            courier: c?.name ?? o.courier ?? '',
            awb: o.awb,
            shippedAt: o.shipped_at,
            trackingUrl: c?.url ? c.url.replace('{awb}', encodeURIComponent(o.awb)) : null,
          }
        : null,
      returnRequest: o.return_id ? { id: o.return_id, status: o.return_status } : null,
      history: history.map((h) => ({ status: h.status, note: h.note, at: h.at })),
    });
  }));

/**
 * POST /orders/{orderNo}/replacement-request?token=…
 *
 * Raises a replacement request from the storefront. It creates the same record the admin's
 * "Log a request" modal does, so it lands in the existing returns queue for review — no
 * stock moves and nothing is approved automatically.
 */
router.post('/orders/:orderNo/replacement-request', trackLimiter,
  parseQuery(z.object({ token: z.string().min(8).max(200) })),
  parseBody(z.object({
    reason: z.string().trim().min(1, 'Tell us what went wrong').max(300),
    note: z.string().trim().max(2000).default(''),
    variantId: z.string().max(120).default(''),
  })),
  wrap(async (req, res) => {
    const id = await tx(async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM "order" WHERE id = $1 FOR UPDATE`, [req.params.orderNo]);
      const o = rows[0];
      if (!o || !tokenMatches(req.valid.token, o.access_token)) {
        throw notFound('We could not find an order with those details');
      }
      if (o.return_id) throw ruleError('A request has already been raised for this order');
      if (o.status !== 'delivered') {
        throw ruleError('A replacement can be requested once the order has been delivered');
      }

      const { rows: items } = await c.query(
        `SELECT * FROM order_item WHERE order_id = $1 ORDER BY sort_order`, [o.id]);
      const item = items.find((l) => l.variant_id === req.body.variantId) ?? items[0];
      if (!item) throw ruleError('That order has no items to return');

      const { rows: maxRows } = await c.query(
        `SELECT COALESCE(max(NULLIF(regexp_replace(id, '\\D', '', 'g'), '')::bigint), 300) AS m
           FROM return_request`);
      const rid = 'RX' + (Number(maxRows[0].m) + 1);

      const { rows: dRows } = await c.query(
        `SELECT at FROM order_history WHERE order_id = $1 AND status = 'delivered'
          ORDER BY at DESC LIMIT 1`, [o.id]);

      await c.query(
        `INSERT INTO return_request (id, order_id, cust_name, cust_phone, item_pid, item_vid,
           item_name, item_color, item_sku, item_qty, item_price, item_img, type, reason, note,
           video, photos, delivered_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,'replacement',$12,$13,FALSE,0,$14,'requested')`,
        [rid, o.id, o.cust_name, o.cust_phone, item.product_id ?? '', item.variant_id ?? '',
         item.name, item.color_key, item.sku, item.price, item.img,
         req.body.reason, req.body.note, dRows[0]?.at ?? o.created_at],
      );
      await c.query(
        `INSERT INTO return_history (return_id, status, note)
         VALUES ($1,'requested','Requested by the customer from the website')`, [rid]);
      await c.query(`UPDATE "order" SET return_id = $2 WHERE id = $1`, [o.id, rid]);
      return rid;
    });

    res.status(201).json({
      id,
      status: 'requested',
      message: 'Thank you — we have your request and will be in touch.',
    });
  }));

/* ---------------------------------------------------------------- contact */

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many messages. Please try again later.' },
});

/**
 * POST /contact — the storefront's contact form.
 *
 * The message is stored so nothing is lost, and logged so it is visible to whoever is
 * running the server. Email delivery needs an SMTP provider, which is not configured yet;
 * until it is, the shop must check these rather than assume they arrive by mail.
 */
router.post('/contact', contactLimiter, parseBody(z.object({
  name: z.string().trim().min(1, 'Please tell us your name').max(120),
  email: z.string().trim().email('Enter a valid email address').max(200).or(z.literal('')).default(''),
  phone: z.string().trim().max(20).default(''),
  orderNo: z.string().trim().max(60).default(''),
  subject: z.string().trim().max(200).default(''),
  message: z.string().trim().min(1, 'Please write your message').max(4000),
})), wrap(async (req, res) => {
  const { name, email, phone, orderNo, subject, message } = req.body;
  if (!email && !phone) {
    throw badRequest('Please leave an email address or a phone number so we can reply');
  }

  const { rows } = await query(
    `INSERT INTO contact_message (name, email, phone, order_no, subject, message, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [name, email, phone, orderNo, subject, message, req.ip ?? ''],
  );
  console.log(`[contact] #${rows[0].id} from ${name} <${email || phone}> ${subject ? '— ' + subject : ''}`);
  res.status(201).json({ ok: true, id: rows[0].id });
}));

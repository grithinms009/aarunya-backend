/* Row → DTO assembly.

   The admin UI is written against the shapes in aarunya-admin/src/data/types.ts, so the
   API returns exactly those shapes: nested variants on a product, nested items, history
   and shipment on an order. Each loader runs a small number of queries and stitches the
   children in JS, which keeps the SQL readable. */
import { query } from '../db/pool.js';
import { iso } from './format.js';

const by = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

/* ------------------------------------------------------------------ products */

export function productDto(p, variants, specs) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category_slug,
    type: p.sub_slug,
    popularity: p.popularity,
    price: p.price,
    mrp: p.mrp,
    featured: p.featured,
    isNew: p.is_new,
    createdAt: p.created_at_ymd,
    rating: p.rating,
    reviewCount: p.review_count,
    description: p.description,
    material: p.material,
    status: p.status,
    giftWrap: p.gift_wrap,
    exchange: p.exchange,
    seoTitle: p.seo_title,
    seoDesc: p.seo_desc,
    specs: specs.map((s) => ({ k: s.k, v: s.v })),
    variants: variants.map((v) => ({
      id: v.id,
      color: v.color_key,
      stock: v.stock,
      sku: v.sku,
      images: v.images ?? [],
    })),
  };
}

/**
 * Loads products with their variants, images and specs.
 * @param where  optional { sql, params } fragment applied to `product p`
 */
export async function loadProducts(where = null) {
  const sql = `SELECT * FROM product p ${where ? 'WHERE ' + where.sql : ''}`;
  const { rows: products } = await query(sql, where?.params ?? []);
  if (!products.length) return [];

  const ids = products.map((p) => p.id);
  const { rows: variants } = await query(
    `SELECT v.*, COALESCE(
              (SELECT array_agg(i.url ORDER BY i.slot) FROM variant_image i WHERE i.variant_id = v.id),
              '{}') AS images
       FROM variant v WHERE v.product_id = ANY($1) ORDER BY v.sort_order, v.id`,
    [ids],
  );
  const { rows: specs } = await query(
    `SELECT * FROM product_spec WHERE product_id = ANY($1) ORDER BY sort_order, id`,
    [ids],
  );

  const vMap = by(variants, 'product_id');
  const sMap = by(specs, 'product_id');
  return products.map((p) => productDto(p, vMap.get(p.id) ?? [], sMap.get(p.id) ?? []));
}

export async function loadProduct(id) {
  const [p] = await loadProducts({ sql: 'p.id = $1', params: [id] });
  return p ?? null;
}

/* ------------------------------------------------------------------ orders */

export function orderDto(o, items, history, shipment) {
  const dto = {
    id: o.id,
    channel: o.channel,
    createdAt: iso(o.created_at),
    customer: {
      name: o.cust_name,
      phone: o.cust_phone,
      email: o.cust_email,
      address: o.address,
      city: o.city,
      state: o.state,
      pin: o.pin,
    },
    items: items.map((l) => ({
      pid: l.product_id ?? '',
      vid: l.variant_id ?? '',
      name: l.name,
      color: l.color_key,
      sku: l.sku,
      qty: l.qty,
      price: l.price,
      img: l.img,
    })),
    subtotal: o.subtotal,
    shipping: o.shipping,
    giftWrap: o.gift_wrap,
    giftFee: o.gift_fee,
    discount: o.discount,
    total: o.total,
    payment: {
      status: o.pay_status,
      method: o.pay_method,
      ...(o.provider ? { provider: o.provider } : {}),
      ...(o.pay_ref ? { ref: o.pay_ref } : {}),
    },
    status: o.status,
    shipment: shipment
      ? { courier: shipment.courier, awb: shipment.awb, shippedAt: iso(shipment.shipped_at) }
      : null,
    location: o.location,
    note: o.note,
    history: history.map((h) => ({ at: iso(h.at), status: h.status, note: h.note })),
  };
  if (o.return_id) dto.returnId = o.return_id;
  return dto;
}

export async function loadOrders(where = null, limit = null) {
  const sql =
    `SELECT * FROM "order" o ${where ? 'WHERE ' + where.sql : ''} ORDER BY o.created_at DESC` +
    (limit ? ` LIMIT ${Number(limit)}` : '');
  const { rows: orders } = await query(sql, where?.params ?? []);
  if (!orders.length) return [];

  const ids = orders.map((o) => o.id);
  const { rows: items } = await query(
    `SELECT * FROM order_item WHERE order_id = ANY($1) ORDER BY sort_order, id`, [ids]);
  const { rows: history } = await query(
    `SELECT * FROM order_history WHERE order_id = ANY($1) ORDER BY at, id`, [ids]);
  const { rows: shipments } = await query(
    `SELECT * FROM shipment WHERE order_id = ANY($1)`, [ids]);

  const iMap = by(items, 'order_id');
  const hMap = by(history, 'order_id');
  const sMap = new Map(shipments.map((s) => [s.order_id, s]));
  return orders.map((o) =>
    orderDto(o, iMap.get(o.id) ?? [], hMap.get(o.id) ?? [], sMap.get(o.id)));
}

export async function loadOrder(id) {
  const [o] = await loadOrders({ sql: 'o.id = $1', params: [id] });
  return o ?? null;
}

/* ------------------------------------------------------------------ returns */

export function returnDto(r, history) {
  return {
    id: r.id,
    orderId: r.order_id,
    customer: { name: r.cust_name, phone: r.cust_phone },
    item: {
      pid: r.item_pid,
      vid: r.item_vid,
      name: r.item_name,
      color: r.item_color,
      sku: r.item_sku,
      qty: r.item_qty,
      price: r.item_price,
      img: r.item_img,
    },
    type: r.type,
    reason: r.reason,
    note: r.note,
    video: r.video,
    photos: r.photos,
    createdAt: iso(r.created_at),
    deliveredAt: iso(r.delivered_at),
    status: r.status,
    resolution: r.resolution,
    ...(r.restocked == null ? {} : { restocked: r.restocked }),
    pickup: r.pickup_courier || r.pickup_date
      ? { courier: r.pickup_courier ?? '', date: r.pickup_date ?? '' }
      : null,
    history: history.map((h) => ({ at: iso(h.at), status: h.status, note: h.note })),
  };
}

export async function loadReturns(where = null) {
  const sql = `SELECT * FROM return_request r ${where ? 'WHERE ' + where.sql : ''}
               ORDER BY r.created_at DESC`;
  const { rows } = await query(sql, where?.params ?? []);
  if (!rows.length) return [];
  const { rows: history } = await query(
    `SELECT * FROM return_history WHERE return_id = ANY($1) ORDER BY at, id`,
    [rows.map((r) => r.id)],
  );
  const hMap = by(history, 'return_id');
  return rows.map((r) => returnDto(r, hMap.get(r.id) ?? []));
}

export async function loadReturn(id) {
  const [r] = await loadReturns({ sql: 'r.id = $1', params: [id] });
  return r ?? null;
}

/* ------------------------------------------------------------------ reference */

export async function loadCategories() {
  const { rows: cats } = await query(`SELECT * FROM category ORDER BY sort_order, slug`);
  const { rows: subs } = await query(`SELECT * FROM sub_category ORDER BY sort_order, slug`);
  const { rows: pairs } = await query(`SELECT * FROM category_pairing ORDER BY sort_order`);
  const sMap = by(subs, 'category_slug');
  const pMap = by(pairs, 'category_slug');
  return cats.map((c) => ({
    slug: c.slug,
    name: c.name,
    short: c.short,
    ph: c.ph,
    tint: c.tint,
    image: c.image,
    subs: (sMap.get(c.slug) ?? []).map((s) => ({ slug: s.slug, name: s.name })),
    pairs: (pMap.get(c.slug) ?? []).map((p) => p.paired_slug),
  }));
}

export async function loadColors() {
  const { rows } = await query(`SELECT * FROM color ORDER BY sort_order, key`);
  return Object.fromEntries(rows.map((c) => [c.key, { label: c.label, hex: c.hex, tint: c.tint }]));
}

export function ledgerDto(m) {
  return {
    at: iso(m.at),
    pid: m.product_id,
    vid: m.variant_id,
    sku: m.sku,
    name: m.name,
    color: m.color_key,
    change: m.change,
    reason: m.reason,
    ref: m.ref,
    ...(m.note ? { note: m.note } : {}),
  };
}

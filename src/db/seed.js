/* Loads the demo dataset into Postgres.

   The data comes from seed-source.mjs, bundled straight from the admin prototype's own
   seed builder, so a freshly seeded database shows exactly what the prototype showed.
   Running it twice is safe: every data table is cleared first.

   Accounts seeded: one admin (the store owner) and one ordinary user. */
import 'dotenv/config';
import { pool, tx } from './pool.js';
import { buildSeed } from './seed-source.mjs';
import { hashPassword } from '../lib/password.js';

const USER_EMAIL = process.env.SEED_USER_EMAIL || 'user@aarunyajewels.in';
const USER_PASSWORD = process.env.SEED_USER_PASSWORD || 'user12345';

/* Cleared in dependency order; app_user included so credentials are reset too. */
const TABLES = [
  'stock_ledger', 'return_history', 'return_request',
  'order_history', 'shipment', 'order_item', '"order"',
  'variant_image', 'variant', 'product_spec', 'product',
  'category_pairing', 'sub_category', 'category', 'color',
  'announcement', 'offer', 'banner', 'setting',
  'password_reset_token', 'login_attempt', 'app_user',
];

async function main() {
  const d = buildSeed();

  await tx(async (c) => {
    await c.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);

    /* ---------------------------------------------------------- accounts */
    await c.query(
      `INSERT INTO app_user (email, name, password_hash, role) VALUES ($1,$2,$3,'admin')`,
      [d.admin.email.toLowerCase(), d.admin.name, await hashPassword(d.admin.pass)],
    );
    await c.query(
      `INSERT INTO app_user (email, name, password_hash, role) VALUES ($1,$2,$3,'user')`,
      [USER_EMAIL.toLowerCase(), 'Aarunya Customer', await hashPassword(USER_PASSWORD)],
    );

    /* ---------------------------------------------------------- reference */
    let i = 0;
    for (const [key, v] of Object.entries(d.colors)) {
      await c.query(
        `INSERT INTO color (key, label, hex, tint, sort_order) VALUES ($1,$2,$3,$4,$5)`,
        [key, v.label, v.hex, v.tint, i++],
      );
    }

    i = 0;
    for (const cat of d.categories) {
      await c.query(
        `INSERT INTO category (slug, name, short, ph, tint, image, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [cat.slug, cat.name, cat.short ?? '', cat.ph ?? '', cat.tint ?? '', cat.image ?? '', i++],
      );
      let j = 0;
      for (const s of cat.subs ?? []) {
        await c.query(
          `INSERT INTO sub_category (category_slug, slug, name, sort_order) VALUES ($1,$2,$3,$4)`,
          [cat.slug, s.slug, s.name, j++],
        );
      }
    }
    /* Pairings reference other categories, so they go in after every category exists. */
    for (const cat of d.categories) {
      let j = 0;
      for (const p of cat.pairs ?? []) {
        if (!d.categories.some((x) => x.slug === p)) continue;
        await c.query(
          `INSERT INTO category_pairing (category_slug, paired_slug, sort_order) VALUES ($1,$2,$3)`,
          [cat.slug, p, j++],
        );
      }
    }

    /* ---------------------------------------------------------- catalogue */
    for (const p of d.products) {
      await c.query(
        `INSERT INTO product (id, slug, name, category_slug, sub_slug, popularity, price, mrp,
                              featured, is_new, created_at_ymd, rating, review_count, description,
                              material, status, gift_wrap, exchange, seo_title, seo_desc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [p.id, p.slug, p.name, p.category, p.type ?? null, p.popularity ?? 0, p.price, p.mrp,
         !!p.featured, !!p.isNew, p.createdAt ?? '', p.rating ?? null, p.reviewCount ?? 0,
         p.description ?? '', p.material ?? '', p.status ?? 'active', !!p.giftWrap, !!p.exchange,
         p.seoTitle ?? '', p.seoDesc ?? ''],
      );
      let j = 0;
      for (const s of p.specs ?? []) {
        await c.query(
          `INSERT INTO product_spec (product_id, k, v, sort_order) VALUES ($1,$2,$3,$4)`,
          [p.id, s.k, s.v, j++],
        );
      }
      j = 0;
      for (const v of p.variants) {
        await c.query(
          `INSERT INTO variant (id, product_id, color_key, sku, stock, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [v.id, p.id, v.color, v.sku, Math.max(0, v.stock ?? 0), j++],
        );
        const imgs = (v.images ?? []).filter(Boolean).slice(0, 3);
        for (let s = 0; s < imgs.length; s++) {
          await c.query(
            `INSERT INTO variant_image (variant_id, slot, url) VALUES ($1,$2,$3)`,
            [v.id, s, imgs[s]],
          );
        }
      }
    }

    /* ---------------------------------------------------------- orders */
    for (const o of d.orders) {
      await c.query(
        `INSERT INTO "order" (id, channel, status, created_at, cust_name, cust_phone, cust_email,
                              address, city, state, pin, subtotal, shipping, gift_wrap, gift_fee,
                              discount, total, pay_status, pay_method, provider, pay_ref, location, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [o.id, o.channel, o.status, o.createdAt, o.customer.name, o.customer.phone, o.customer.email,
         o.customer.address, o.customer.city, o.customer.state, o.customer.pin, o.subtotal,
         o.shipping, !!o.giftWrap, o.giftFee ?? 0, o.discount ?? 0, o.total, o.payment.status,
         o.payment.method ?? '', o.payment.provider ?? null, o.payment.ref ?? null,
         o.location ?? '', o.note ?? ''],
      );
      let j = 0;
      for (const l of o.items) {
        await c.query(
          `INSERT INTO order_item (order_id, product_id, variant_id, name, color_key, sku, qty, price, img, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [o.id, l.pid, l.vid, l.name, l.color, l.sku, l.qty, l.price, l.img ?? '', j++],
        );
      }
      for (const h of o.history ?? []) {
        await c.query(
          `INSERT INTO order_history (order_id, status, note, at) VALUES ($1,$2,$3,$4)`,
          [o.id, h.status, h.note ?? '', h.at],
        );
      }
      if (o.shipment) {
        await c.query(
          `INSERT INTO shipment (order_id, courier, awb, shipped_at) VALUES ($1,$2,$3,$4)`,
          [o.id, o.shipment.courier ?? '', o.shipment.awb ?? '', o.shipment.shippedAt ?? null],
        );
      }
    }

    /* ---------------------------------------------------------- returns */
    for (const r of d.returns) {
      await c.query(
        `INSERT INTO return_request (id, order_id, cust_name, cust_phone, item_pid, item_vid,
           item_name, item_color, item_sku, item_qty, item_price, item_img, type, reason, note,
           video, photos, created_at, delivered_at, status, resolution, restocked,
           pickup_courier, pickup_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        [r.id, r.orderId, r.customer.name, r.customer.phone, r.item.pid, r.item.vid, r.item.name,
         r.item.color, r.item.sku, r.item.qty ?? 1, r.item.price ?? 0, r.item.img ?? '',
         r.type, r.reason ?? '', r.note ?? '', !!r.video, r.photos ?? 0, r.createdAt,
         r.deliveredAt || null, r.status, r.resolution ?? '', r.restocked ?? null,
         r.pickup?.courier ?? null, r.pickup?.date ?? null],
      );
      for (const h of r.history ?? []) {
        await c.query(
          `INSERT INTO return_history (return_id, status, note, at) VALUES ($1,$2,$3,$4)`,
          [r.id, h.status, h.note ?? '', h.at],
        );
      }
      await c.query(`UPDATE "order" SET return_id = $1 WHERE id = $2`, [r.id, r.orderId]);
    }

    /* ---------------------------------------------------------- ledger */
    for (const m of d.ledger) {
      await c.query(
        `INSERT INTO stock_ledger (at, product_id, variant_id, sku, name, color_key, change, reason, ref, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [m.at, m.pid, m.vid, m.sku, m.name, m.color, m.change, m.reason, m.ref ?? '', m.note ?? ''],
      );
    }

    /* ---------------------------------------------------------- storefront */
    const b = d.banners;
    await c.query(
      `INSERT INTO banner (id, hero_desktop, hero_mobile, hero_alt, personalised,
                           personalised_mobile, personalised_alt, personalised_cta)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7)`,
      [b.heroDesktop, b.heroMobile, b.heroAlt, b.personalised, b.personalisedMobile,
       b.personalisedAlt, b.personalisedCta],
    );

    i = 0;
    for (const o of d.offers) {
      await c.query(
        `INSERT INTO offer (badge, title, accent, sub, cta, href, match_key, image, w, btn, bx, by, alt, hidden, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [o.badge ?? '', o.title ?? '', o.accent ?? '', o.sub ?? '', o.cta ?? '', o.href ?? '',
         o.match ?? 'sale', o.image ?? '', o.w ?? 0, o.btn ?? 'solid', o.bx ?? 50, o.by ?? 50,
         o.alt ?? '', !!o.hidden, i++],
      );
    }

    i = 0;
    for (const text of d.announcements) {
      await c.query(`INSERT INTO announcement (text, sort_order) VALUES ($1,$2)`, [text, i++]);
    }

    await c.query(
      `INSERT INTO setting (key, value) VALUES ('config', $1)`,
      [JSON.stringify(d.config)],
    );
  });

  console.log(
    `seeded: ${d.products.length} products, ${d.categories.length} categories, ` +
    `${d.orders.length} orders, ${d.returns.length} returns, ${d.ledger.length} ledger rows`,
  );
  console.log(`admin login: ${d.admin.email} / ${d.admin.pass}`);
  console.log(`user  login: ${USER_EMAIL} / ${USER_PASSWORD}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

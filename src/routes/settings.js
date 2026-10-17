/* Store settings: contact details, shipping and fees, couriers, offline places, the
   colour swatches and the signed-in account.

   The validation mirrors what the Settings screen shows inline: a WhatsApp number with
   its country code, valid emails, a password of at least six characters that matches
   its confirmation, and every colour named. A colour a product still uses is never
   dropped, even if it was removed from the list. */
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { loadColors } from '../lib/repo.js';
import { getConfig, saveConfig } from '../lib/settings.js';
import { num, slugify, tintOf } from '../lib/format.js';
import { hashPassword } from '../lib/password.js';
import { validation, wrap } from '../lib/errors.js';
import { parseBody } from '../middleware/validate.js';
import { issueSession } from '../middleware/auth.js';

export const router = Router();

router.get('/', wrap(async (req, res) => {
  const config = await getConfig();
  const colors = await loadColors();
  const { rows } = await query(`SELECT name, email FROM app_user WHERE id = $1`, [req.user.id]);
  res.json({
    config,
    couriers: config.couriers ?? [],
    locations: config.locations ?? [],
    colors: Object.entries(colors).map(([key, c]) => ({ key, label: c.label, hex: c.hex })),
    admin: { name: rows[0]?.name ?? '', email: rows[0]?.email ?? '' },
  });
}));

/** Colour keys currently used by a product, which therefore cannot be removed. */
router.get('/colors-in-use', wrap(async (_req, res) => {
  const { rows } = await query(`SELECT DISTINCT color_key FROM variant`);
  res.json(rows.map((r) => r.color_key));
}));

const saveIn = z.object({
  /* Accepts the whole config object GET returns, nested arrays and all. Only the keys
     listed in the handler below are persisted, so unknown ones are simply ignored. */
  config: z.record(z.unknown()).default({}),
  couriers: z.array(z.object({
    id: z.string().max(100).default(''),
    name: z.string().max(200).default(''),
    url: z.string().max(500).default(''),
  })).default([]),
  locations: z.array(z.string().max(200)).default([]),
  colors: z.array(z.object({
    key: z.string().max(100).default(''),
    label: z.string().max(200).default(''),
    hex: z.string().max(20).default('#000000'),
  })).default([]),
  name: z.string().max(200).default(''),
  email: z.string().max(200).default(''),
  password: z.string().max(200).default(''),
  passwordConfirm: z.string().max(200).default(''),
});

router.put('/', parseBody(saveIn), wrap(async (req, res) => {
  const input = req.body;
  const c = input.config;
  const fields = {};

  const whatsapp = String(c.WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
  if (whatsapp.length < 11 || whatsapp.length > 13) {
    fields.wa = 'Use country code + number, e.g. 919876543210';
  }
  if (!/^\S+@\S+\.\S+$/.test(String(c.EMAIL ?? ''))) fields.email = 'Enter a valid email';
  if (!/^\S+@\S+\.\S+$/.test(input.email)) fields.login = 'Enter a valid login email';
  if (input.password && input.password.length < 6) {
    fields.pass = 'Use at least 6 characters';
  } else if (input.password && input.password !== input.passwordConfirm) {
    fields.pass = 'Passwords don’t match';
  }
  if (input.colors.some((x) => !x.label.trim())) fields.colors = 'Every colour needs a name';

  if (Object.keys(fields).length) throw validation(fields);

  const { rows: used } = await query(`SELECT DISTINCT color_key FROM variant`);
  const inUse = new Set(used.map((r) => r.color_key));

  await tx(async (db) => {
    await saveConfig({
      WHATSAPP_NUMBER: whatsapp,
      EMAIL: String(c.EMAIL ?? ''),
      INSTAGRAM_HANDLE: String(c.INSTAGRAM_HANDLE ?? ''),
      FREE_SHIPPING_THRESHOLD: num(c.FREE_SHIPPING_THRESHOLD),
      SHIPPING_FEE: num(c.SHIPPING_FEE),
      GIFT_WRAP_FEE: num(c.GIFT_WRAP_FEE),
      DISPATCH_CUTOFF_HOUR: num(c.DISPATCH_CUTOFF_HOUR),
      PAYMENT_PROVIDER: String(c.PAYMENT_PROVIDER ?? 'razorpay'),
      LOW_STOCK: Math.max(0, num(c.LOW_STOCK)),
      defaultCourier: String(c.defaultCourier ?? ''),
      notifyOnShip: !!c.notifyOnShip,
      shipMsg: String(c.shipMsg ?? ''),
      couriers: input.couriers
        .filter((x) => x.name.trim() && x.url.trim())
        .map((x) => ({ ...x, id: x.id || slugify(x.name) })),
      locations: input.locations.map((x) => x.trim()).filter(Boolean),
    }, db);

    /* Keep the existing tint when the hex hasn't changed, else derive a new one. */
    const { rows: existing } = await db.query(`SELECT * FROM color`);
    const old = new Map(existing.map((r) => [r.key, r]));
    const next = new Map();
    let i = 0;
    for (const x of input.colors) {
      const key = x.key || slugify(x.label);
      const prev = old.get(key);
      next.set(key, {
        label: x.label.trim(),
        hex: x.hex,
        tint: prev && prev.hex === x.hex ? prev.tint : tintOf(x.hex),
        sort: i++,
      });
    }
    /* A colour a product still uses stays, even if it was removed from the list. */
    for (const key of inUse) {
      if (!next.has(key) && old.has(key)) {
        const p = old.get(key);
        next.set(key, { label: p.label, hex: p.hex, tint: p.tint, sort: i++ });
      }
    }

    await db.query(`DELETE FROM color WHERE NOT (key = ANY($1))`, [[...next.keys()]]);
    for (const [key, v] of next) {
      await db.query(
        `INSERT INTO color (key, label, hex, tint, sort_order) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, hex = EXCLUDED.hex,
           tint = EXCLUDED.tint, sort_order = EXCLUDED.sort_order`,
        [key, v.label, v.hex, v.tint, v.sort],
      );
    }

    /* The login block on the same screen. */
    const sets = ['email = $2', 'name = $3'];
    const params = [req.user.id, input.email.trim().toLowerCase(), input.name.trim()];
    if (!input.name.trim()) sets[1] = 'name = name';
    if (input.password) {
      params.push(await hashPassword(input.password));
      sets.push(`password_hash = $${params.length}`);
    }
    const { rows: u } = await db.query(
      `UPDATE app_user SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $1 RETURNING id, email, name, role`,
      params,
    );
    if (u[0]) issueSession(res, u[0]);
  });

  res.json({ ok: true });
}));

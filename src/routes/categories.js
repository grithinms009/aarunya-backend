/* Categories, their sub-categories and "Pair it up with" links.

   Two rules the screen depends on: a category holding products cannot be deleted, and
   deleting one also strips it from every other category's pairings. Renaming a
   sub-category away clears `type` on the products that pointed at it. */
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { loadCategories } from '../lib/repo.js';
import { slugify } from '../lib/format.js';
import { conflict, wrap } from '../lib/errors.js';
import { parseBody } from '../middleware/validate.js';

export const router = Router();

const draftIn = z.object({
  slug: z.string().max(100).default(''),
  name: z.string().max(200).default(''),
  short: z.string().max(200).default(''),
  tint: z.string().max(40).default(''),
  image: z.string().max(2_000_000).default(''),
  subs: z.array(z.object({
    slug: z.string().max(100).default(''),
    name: z.string().max(200).default(''),
  })).default([]),
  pairs: z.array(z.string().max(100)).default([]),
  isNew: z.boolean().default(false),
});

router.get('/', wrap(async (_req, res) => res.json(await loadCategories())));

/** Product counts per category and per sub-category, for the cards. */
router.get('/counts', wrap(async (_req, res) => {
  const { rows: cats } = await query(`SELECT slug FROM category`);
  const { rows: counts } = await query(
    `SELECT category_slug, sub_slug, count(*)::int AS n
       FROM product GROUP BY category_slug, sub_slug`);
  const { rows: subs } = await query(`SELECT category_slug, slug FROM sub_category`);

  const out = {};
  for (const c of cats) out[c.slug] = { total: 0, subs: {} };
  for (const s of subs) if (out[s.category_slug]) out[s.category_slug].subs[s.slug] = 0;
  for (const r of counts) {
    if (!out[r.category_slug]) continue;
    out[r.category_slug].total += r.n;
    if (r.sub_slug && r.sub_slug in out[r.category_slug].subs) {
      out[r.category_slug].subs[r.sub_slug] = r.n;
    }
  }
  res.json(out);
}));

router.post('/', parseBody(draftIn), wrap(async (req, res) => {
  const d = req.body;
  const name = d.name.trim();
  if (!name) throw conflict('Add a category name');

  const short = (d.short || '').trim() || name.replace(/^Anti-Tarnish\s+/i, '');
  const slug = d.isNew ? slugify(short) : d.slug;

  if (d.isNew) {
    const { rows } = await query(`SELECT 1 FROM category WHERE slug = $1`, [slug]);
    if (rows.length) throw conflict('A category with this name already exists');
  }

  /* Sub-category slugs stay unique and stable, so products keep their type. */
  const seen = new Set();
  const subs = d.subs.filter((x) => x.name.trim()).map((x) => {
    let sl = x.slug || slugify(x.name);
    while (seen.has(sl)) sl += '-2';
    seen.add(sl);
    return { slug: sl, name: x.name.trim() };
  });

  await tx(async (c) => {
    const { rows: old } = await c.query(`SELECT ph FROM category WHERE slug = $1`, [slug]);
    const ph = old[0]?.ph ?? short.toLowerCase();

    if (d.isNew) {
      const { rows: n } = await c.query(
        `SELECT COALESCE(max(sort_order), -1) + 1 AS next FROM category`);
      await c.query(
        `INSERT INTO category (slug, name, short, ph, tint, image, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [slug, name, short, ph, d.tint, d.image, n[0].next],
      );
    } else {
      await c.query(
        `UPDATE category SET name=$2, short=$3, ph=$4, tint=$5, image=$6 WHERE slug=$1`,
        [slug, name, short, ph, d.tint, d.image],
      );
    }

    await c.query(`DELETE FROM sub_category WHERE category_slug = $1`, [slug]);
    let i = 0;
    for (const s of subs) {
      await c.query(
        `INSERT INTO sub_category (category_slug, slug, name, sort_order) VALUES ($1,$2,$3,$4)`,
        [slug, s.slug, s.name, i++],
      );
    }

    await c.query(`DELETE FROM category_pairing WHERE category_slug = $1`, [slug]);
    i = 0;
    for (const p of d.pairs) {
      const { rows } = await c.query(`SELECT 1 FROM category WHERE slug = $1`, [p]);
      if (!rows.length) continue;
      await c.query(
        `INSERT INTO category_pairing (category_slug, paired_slug, sort_order) VALUES ($1,$2,$3)`,
        [slug, p, i++],
      );
    }

    /* A product pointing at a removed sub-category falls back to none. */
    if (!d.isNew) {
      await c.query(
        `UPDATE product SET sub_slug = NULL
          WHERE category_slug = $1 AND sub_slug IS NOT NULL AND NOT (sub_slug = ANY($2))`,
        [slug, subs.map((s) => s.slug)],
      );
    }
  });

  const all = await loadCategories();
  res.json(all.find((c) => c.slug === slug));
}));

/** Refused while the category still holds products. */
router.delete('/:slug', wrap(async (req, res) => {
  const slug = req.params.slug;
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM product WHERE category_slug = $1`, [slug]);
  const n = rows[0].n;
  if (n) {
    throw conflict(`Move or delete the ${n} product${n === 1 ? '' : 's'} in this category first`);
  }
  await tx(async (c) => {
    await c.query(`DELETE FROM category WHERE slug = $1`, [slug]);
    /* Drop it from every other category's "Pair it up" list too. */
    await c.query(`DELETE FROM category_pairing WHERE paired_slug = $1`, [slug]);
  });
  res.json({ ok: true });
}));

/** Shop menu order: swap this card with its neighbour. */
router.put(
  '/order',
  parseBody(z.object({ index: z.coerce.number().int().min(0), delta: z.coerce.number().int() })),
  wrap(async (req, res) => {
    const { index, delta } = req.body;
    await tx(async (c) => {
      const { rows } = await c.query(`SELECT slug FROM category ORDER BY sort_order, slug`);
      const j = index + delta;
      if (index >= rows.length || j < 0 || j >= rows.length) return;
      const order = rows.map((r) => r.slug);
      [order[index], order[j]] = [order[j], order[index]];
      for (let i = 0; i < order.length; i++) {
        await c.query(`UPDATE category SET sort_order = $1 WHERE slug = $2`, [i, order[i]]);
      }
    });
    res.json({ ok: true });
  }),
);

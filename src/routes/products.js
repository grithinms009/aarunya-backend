/* Products: list, read, create, replace, duplicate, delete and CSV export.

   The validation here is the authority — the editor mirrors it for a fast response, but
   a request that skips the UI still gets the same answer: name and category required,
   price above zero, MRP at or above price, at least one colour, colours unique per
   product and the page URL unique across products.

   Saving writes one ledger row per variant whose stock changed, through applyStock. */
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { loadProduct, loadProducts } from '../lib/repo.js';
import { getConfig, lowStockOf } from '../lib/settings.js';
import { num, skuFor, slugify, ymd } from '../lib/format.js';
import { applyStock } from '../lib/stock.js';
import { sendCsv } from '../lib/csv.js';
import { notFound, validation, wrap } from '../lib/errors.js';
import { parseBody, parseQuery } from '../middleware/validate.js';

export const router = Router();

const SORTS = ['new', 'popular', 'name', 'price-asc', 'price-desc', 'stock'];
const FLAGS = ['featured', 'new', 'sale', 'noimg'];

const listQuery = z.object({
  q: z.string().max(200).optional(),
  cat: z.string().max(100).optional(),
  sub: z.string().max(100).optional(),
  color: z.string().max(100).optional(),
  stock: z.enum(['', 'in', 'low', 'out']).optional(),
  status: z.enum(['', 'active', 'draft']).optional(),
  /* Arrives as repeated query params or one comma-joined value. */
  flags: z.preprocess(
    (v) => (v == null ? [] : Array.isArray(v) ? v : String(v).split(',').filter(Boolean)),
    z.array(z.enum(FLAGS)),
  ).optional(),
  sort: z.enum(SORTS).optional(),
});

const variantIn = z.object({
  id: z.string().max(120).optional(),
  color: z.string().min(1).max(60),
  stock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  sku: z.string().max(60).default(''),
  images: z.array(z.string().max(2_000_000)).default([]),
});

const productIn = z.object({
  id: z.string().max(120).optional(),
  slug: z.string().max(200).default(''),
  name: z.string().max(200).default(''),
  category: z.string().max(100).default(''),
  type: z.string().max(100).nullable().default(null),
  popularity: z.coerce.number().int().default(0),
  price: z.coerce.number().default(0),
  mrp: z.coerce.number().default(0),
  featured: z.boolean().default(false),
  isNew: z.boolean().default(false),
  createdAt: z.string().max(40).default(''),
  rating: z.coerce.number().nullable().default(null),
  reviewCount: z.coerce.number().int().default(0),
  description: z.string().max(20000).default(''),
  material: z.string().max(500).default(''),
  status: z.enum(['active', 'draft']).default('active'),
  giftWrap: z.boolean().default(true),
  exchange: z.boolean().default(true),
  seoTitle: z.string().max(300).default(''),
  seoDesc: z.string().max(1000).default(''),
  specs: z.array(z.object({ k: z.string().max(200), v: z.string().max(500) })).default([]),
  variants: z.array(variantIn).default([]),
});

const totalStock = (p) => p.variants.reduce((t, v) => t + num(v.stock), 0);

/** Applies the filters the SQL didn't cover, then sorts — the admin's exact semantics. */
function refine(rows, q, low) {
  const flags = q.flags ?? [];
  const out = rows.filter((p) => {
    const t = totalStock(p);
    if (q.color && !p.variants.some((v) => v.color === q.color)) return false;
    if (q.stock === 'out' && t > 0) return false;
    if (q.stock === 'low' && !(t > 0 && p.variants.some((v) => v.stock <= low))) return false;
    if (q.stock === 'in' && t === 0) return false;
    if (flags.includes('featured') && !p.featured) return false;
    if (flags.includes('new') && !p.isNew) return false;
    if (flags.includes('sale') && !(p.mrp > p.price)) return false;
    /* "Missing photos" means any variant with fewer than three. */
    if (flags.includes('noimg') && p.variants.every((v) => v.images.filter(Boolean).length >= 3))
      return false;
    return true;
  });

  const sorters = {
    new: (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
    name: (a, b) => a.name.localeCompare(b.name),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    stock: (a, b) => totalStock(a) - totalStock(b),
    popular: (a, b) => b.popularity - a.popularity,
  };
  return out.sort(sorters[q.sort ?? 'new']);
}

async function listed(q) {
  const where = [];
  const params = [];
  if (q.cat) { params.push(q.cat); where.push(`p.category_slug = $${params.length}`); }
  if (q.sub) { params.push(q.sub); where.push(`p.sub_slug = $${params.length}`); }
  if (q.status) { params.push(q.status); where.push(`p.status = $${params.length}`); }
  if (q.q) {
    params.push(`%${q.q.trim()}%`);
    const i = params.length;
    where.push(`(p.name ILIKE $${i} OR p.slug ILIKE $${i}
                 OR EXISTS (SELECT 1 FROM variant v WHERE v.product_id = p.id AND v.sku ILIKE $${i}))`);
  }
  const rows = await loadProducts(where.length ? { sql: where.join(' AND '), params } : null);
  const low = lowStockOf(await getConfig());
  return refine(rows, q, low);
}

router.get('/', parseQuery(listQuery), wrap(async (req, res) => {
  const rows = await listed(req.valid);
  const { rows: all } = await query(`SELECT count(*)::int AS n FROM product`);
  /* `total` is the unfiltered count, for the "N of M products" line. */
  res.json({ rows, total: all[0].n });
}));

router.get('/export.csv', parseQuery(listQuery), wrap(async (req, res) => {
  const rows = await listed(req.valid);
  sendCsv(res, 'aarunya-products.csv',
    ['Product', 'Page URL', 'Category', 'Sub-category', 'Price', 'MRP', 'Status', 'Colours', 'Stock'],
    rows.map((p) => [p.name, p.slug, p.category, p.type ?? '', p.price, p.mrp, p.status,
      p.variants.map((v) => v.color).join(' / '), totalStock(p)]));
}));

router.get('/:id', wrap(async (req, res) => {
  const p = await loadProduct(req.params.id);
  if (!p) throw notFound('This product doesn’t exist any more.');
  res.json(p);
}));

/* ---------------------------------------------------------------- save */

async function validate(draft, id) {
  const fields = {};
  const price = num(draft.price);
  const mrp = num(draft.mrp) || price;

  if (!draft.name.trim()) fields.name = 'Add a product name';
  if (!draft.category) fields.category = 'Choose a category';
  if (!(price > 0)) fields.price = 'Enter a selling price';
  if (mrp < price) fields.mrp = 'MRP can’t be lower than the selling price';

  const colors = draft.variants.map((v) => v.color);
  if (!draft.variants.length) fields.variants = 'Add at least one colour';
  else if (new Set(colors).size !== colors.length)
    fields.variants = 'Each colour can only be added once';

  const slug = slugify(draft.slug || draft.name).replace(/^-+|-+$/g, '');
  const { rows: clash } = await query(
    `SELECT 1 FROM product WHERE slug = $1 AND id <> $2 LIMIT 1`, [slug, id ?? '']);
  if (clash.length) fields.slug = 'Another product already uses this URL';

  if (draft.category) {
    const { rows } = await query(`SELECT 1 FROM category WHERE slug = $1`, [draft.category]);
    if (!rows.length) fields.category = 'Choose a category';
  }

  if (Object.keys(fields).length) throw validation(fields);
  return { price, mrp, slug };
}

/** Writes the product, its specs and variants, and the ledger rows for stock changes. */
async function writeProduct(c, p, isNew) {
  if (isNew) {
    await c.query(
      `INSERT INTO product (id, slug, name, category_slug, sub_slug, popularity, price, mrp,
         featured, is_new, created_at_ymd, rating, review_count, description, material, status,
         gift_wrap, exchange, seo_title, seo_desc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [p.id, p.slug, p.name, p.category, p.type, p.popularity, p.price, p.mrp, p.featured,
       p.isNew, p.createdAt, p.rating, p.reviewCount, p.description, p.material, p.status,
       p.giftWrap, p.exchange, p.seoTitle, p.seoDesc],
    );
  } else {
    await c.query(
      `UPDATE product SET slug=$2, name=$3, category_slug=$4, sub_slug=$5, popularity=$6,
         price=$7, mrp=$8, featured=$9, is_new=$10, rating=$11, review_count=$12,
         description=$13, material=$14, status=$15, gift_wrap=$16, exchange=$17,
         seo_title=$18, seo_desc=$19, updated_at=now()
       WHERE id=$1`,
      [p.id, p.slug, p.name, p.category, p.type, p.popularity, p.price, p.mrp, p.featured,
       p.isNew, p.rating, p.reviewCount, p.description, p.material, p.status, p.giftWrap,
       p.exchange, p.seoTitle, p.seoDesc],
    );
  }

  await c.query(`DELETE FROM product_spec WHERE product_id = $1`, [p.id]);
  let i = 0;
  for (const s of p.specs) {
    await c.query(`INSERT INTO product_spec (product_id, k, v, sort_order) VALUES ($1,$2,$3,$4)`,
      [p.id, s.k, s.v, i++]);
  }

  /* Variants the editor removed go first, so a freed colour can be reused below. */
  const keep = p.variants.map((v) => v.id);
  await c.query(
    `DELETE FROM variant WHERE product_id = $1 AND NOT (id = ANY($2))`, [p.id, keep]);

  i = 0;
  for (const v of p.variants) {
    const { rows } = await c.query(`SELECT stock FROM variant WHERE id = $1`, [v.id]);
    const before = rows[0]?.stock ?? 0;
    if (rows.length) {
      await c.query(
        `UPDATE variant SET color_key=$2, sku=$3, sort_order=$4 WHERE id=$1`,
        [v.id, v.color, v.sku, i],
      );
    } else {
      await c.query(
        `INSERT INTO variant (id, product_id, color_key, sku, stock, sort_order)
         VALUES ($1,$2,$3,$4,0,$5)`,
        [v.id, p.id, v.color, v.sku, i],
      );
    }
    i += 1;

    await c.query(`DELETE FROM variant_image WHERE variant_id = $1`, [v.id]);
    const imgs = v.images.filter(Boolean).slice(0, 3);
    for (let s = 0; s < imgs.length; s++) {
      await c.query(`INSERT INTO variant_image (variant_id, slot, url) VALUES ($1,$2,$3)`,
        [v.id, s, imgs[s]]);
    }

    /* Opening stock on create, and any later change, is a stock movement. */
    const delta = v.stock - before;
    if (delta) {
      await applyStock(c, v.id, delta, 'adjust', '',
        isNew ? 'Opening stock' : 'Edited in product form');
    }
  }
}

router.post('/', parseBody(productIn), wrap(async (req, res) => {
  const draft = req.body;
  const id = draft.id || 'p' + Date.now().toString(36);
  const { price, mrp, slug } = await validate(draft, id);

  const prod = {
    ...draft, id, slug, name: draft.name.trim(), price, mrp,
    type: draft.type || null,
    createdAt: draft.createdAt || ymd(),
    specs: draft.specs.filter((x) => x.k.trim() && x.v.trim()),
    variants: draft.variants.map((v) => ({
      ...v,
      id: `${id}-${v.color}`,
      stock: Math.max(0, parseInt(String(v.stock), 10) || 0),
      sku: (v.sku || '').trim() || skuFor({ id, category: draft.category }, v.color),
      images: v.images.filter(Boolean),
    })),
  };

  await tx((c) => writeProduct(c, prod, true));
  res.status(201).json(await loadProduct(id));
}));

router.put('/:id', parseBody(productIn), wrap(async (req, res) => {
  const id = req.params.id;
  const { rows } = await query(`SELECT 1 FROM product WHERE id = $1`, [id]);
  if (!rows.length) throw notFound('This product doesn’t exist any more.');

  const draft = req.body;
  const { price, mrp, slug } = await validate(draft, id);
  const prod = {
    ...draft, id, slug, name: draft.name.trim(), price, mrp,
    type: draft.type || null,
    createdAt: draft.createdAt || ymd(),
    specs: draft.specs.filter((x) => x.k.trim() && x.v.trim()),
    variants: draft.variants.map((v) => ({
      ...v,
      id: `${id}-${v.color}`,
      stock: Math.max(0, parseInt(String(v.stock), 10) || 0),
      sku: (v.sku || '').trim() || skuFor({ id, category: draft.category }, v.color),
      images: v.images.filter(Boolean),
    })),
  };

  await tx((c) => writeProduct(c, prod, false));
  res.json(await loadProduct(id));
}));

/** Duplicates as a draft with zero stock, as the prototype does. */
router.post('/:id/duplicate', wrap(async (req, res) => {
  const src = await loadProduct(req.params.id);
  if (!src) throw notFound('This product doesn’t exist any more.');

  const nid = 'p' + Date.now().toString(36);
  const copy = {
    ...src,
    id: nid,
    name: src.name + ' (copy)',
    slug: `${src.slug}-copy-${nid.slice(-3)}`,
    status: 'draft',
    popularity: 0,
    createdAt: ymd(),
    variants: src.variants.map((v) => ({
      ...v,
      id: `${nid}-${v.color}`,
      stock: 0,
      sku: skuFor({ id: nid, category: src.category }, v.color) + '-C',
    })),
  };

  await tx((c) => writeProduct(c, copy, true));
  res.status(201).json(await loadProduct(nid));
}));

/** Order items keep their own snapshots, so deleting never rewrites history. */
router.delete('/:id', wrap(async (req, res) => {
  await query(`DELETE FROM product WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

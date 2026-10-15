/* The storefront's read-only surface. Draft products and hidden offers never appear
   here, so an unpublished piece can't be reached by guessing its URL. */
import { Router } from 'express';
import { z } from 'zod';
import { loadCategories, loadColors, loadProducts } from '../lib/repo.js';
import { getConfig } from '../lib/settings.js';
import { readContent } from './storefront.js';
import { notFound, wrap } from '../lib/errors.js';
import { parseQuery } from '../middleware/validate.js';

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
  price: z.enum(['u500', '500-1000', 'o1000']).optional(),
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

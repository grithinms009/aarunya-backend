/* Reference data and the nav badge counts the sidebar shows. */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { loadCategories, loadColors } from '../lib/repo.js';
import { getConfig } from '../lib/settings.js';
import { reference } from '../lib/reference.js';
import { wrap } from '../lib/errors.js';

export const router = Router();

router.get('/categories', wrap(async (_req, res) => res.json(await loadCategories())));
router.get('/colors', wrap(async (_req, res) => res.json(await loadColors())));
router.get('/config', wrap(async (_req, res) => res.json(await getConfig())));

/* The fixed vocabularies the screens render: adjustment reasons, return reasons, refund
   methods, the order and return flows, offer link targets, default artwork and the SKU
   code maps. Defined once in lib/reference.js, where the rules read them too. */
router.get('/reference', (_req, res) => res.json(reference()));

/** Orders needing packing, returns awaiting review, variants out of stock. */
router.get('/badges', wrap(async (_req, res) => {
  const { rows } = await query(`
    SELECT
      (SELECT count(*)::int FROM "order"
        WHERE channel = 'online' AND status = 'new' AND pay_status = 'paid')   AS orders,
      (SELECT count(*)::int FROM return_request WHERE status = 'requested')    AS returns,
      (SELECT count(*)::int FROM variant WHERE stock = 0)                      AS inventory
  `);
  res.json(rows[0]);
}));

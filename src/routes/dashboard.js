/* Dashboard summary for a period, matching the DTO the admin's dashboard screen reads.

   Cancelled orders are excluded from every revenue and count figure, exactly as the
   prototype does. */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { loadOrders } from '../lib/repo.js';
import { getConfig, lowStockOf } from '../lib/settings.js';
import { DAY, sod } from '../lib/format.js';
import { wrap } from '../lib/errors.js';
import { parseQuery } from '../middleware/validate.js';

export const router = Router();

router.get(
  '/',
  parseQuery(z.object({ period: z.enum(['today', '7', '30']).default('7') })),
  wrap(async (req, res) => {
    const { period } = req.valid;
    const config = await getConfig();
    const low = lowStockOf(config);
    const start = new Date(period === 'today' ? sod() : Date.now() - Number(period) * DAY);

    const live = await loadOrders({
      sql: `o.created_at >= $1 AND o.status <> 'cancelled'`,
      params: [start.toISOString()],
    });
    const online = live.filter((o) => o.channel === 'online');
    const offline = live.filter((o) => o.channel === 'offline');
    const sum = (a) => a.reduce((t, o) => t + o.total, 0);
    const revenue = sum(live);

    /* Variant-level stock rollups for the attention counters and the low-stock list. */
    const { rows: vRows } = await query(
      `SELECT v.id, v.stock, v.sku, v.color_key, p.id AS pid, p.name,
              (SELECT i.url FROM variant_image i WHERE i.variant_id = v.id ORDER BY i.slot LIMIT 1) AS img
         FROM variant v JOIN product p ON p.id = v.product_id`,
    );
    const lowRows = vRows.filter((v) => v.stock > 0 && v.stock <= low);
    const outRows = vRows.filter((v) => v.stock === 0);

    const { rows: att } = await query(`
      SELECT
        (SELECT count(*)::int FROM "order"
          WHERE channel = 'online' AND status = 'new' AND pay_status = 'paid')      AS paid_to_pack,
        (SELECT count(*)::int FROM "order" WHERE status = 'packed')                 AS packed_to_ship,
        (SELECT count(*)::int FROM "order"
          WHERE pay_status = 'pending' AND status <> 'cancelled')                   AS awaiting_payment,
        (SELECT count(*)::int FROM return_request WHERE status = 'requested')       AS returns_to_review
    `);

    /* Best sellers by units, then revenue, over the live orders in the period. */
    const tops = new Map();
    for (const o of live) {
      for (const l of o.items) {
        const t = tops.get(l.pid) ?? { pid: l.pid, name: l.name, img: l.img, units: 0, revenue: 0 };
        t.units += l.qty;
        t.revenue += l.qty * l.price;
        tops.set(l.pid, t);
      }
    }

    const recent = await loadOrders(null, 6);

    res.json({
      period,
      revenue: { total: revenue, online: sum(online), offline: sum(offline) },
      orderCount: { total: live.length, online: online.length, offline: offline.length },
      units: live.reduce((t, o) => t + o.items.reduce((u, l) => u + l.qty, 0), 0),
      pieces: new Set(live.flatMap((o) => o.items.map((l) => l.pid))).size,
      average: live.length ? revenue / live.length : 0,
      attention: {
        paidToPack: att[0].paid_to_pack,
        packedToShip: att[0].packed_to_ship,
        awaitingPayment: att[0].awaiting_payment,
        returnsToReview: att[0].returns_to_review,
        lowStock: lowRows.length,
        outOfStock: outRows.length,
      },
      recent,
      top: [...tops.values()]
        .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
        .slice(0, 5),
      /* Out of stock first, then the lowest counts. */
      low: [...outRows, ...lowRows]
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 6)
        .map((v) => ({
          pid: v.pid, name: v.name, color: v.color_key, sku: v.sku,
          img: v.img ?? '', stock: v.stock,
        })),
    });
  }),
);

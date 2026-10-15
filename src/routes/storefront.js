/* Home page content the admin edits: banners, offer cards and the announcement bar.
   The same rows are served to the storefront through GET /api/storefront. */
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { wrap } from '../lib/errors.js';
import { parseBody } from '../middleware/validate.js';

export const router = Router();

export async function readContent() {
  const { rows: b } = await query(`SELECT * FROM banner WHERE id = 1`);
  const { rows: offers } = await query(`SELECT * FROM offer ORDER BY sort_order, id`);
  const { rows: ann } = await query(`SELECT text FROM announcement ORDER BY sort_order, id`);
  const banner = b[0] ?? {};
  return {
    banners: {
      heroDesktop: banner.hero_desktop ?? '',
      heroMobile: banner.hero_mobile ?? '',
      heroAlt: banner.hero_alt ?? '',
      personalised: banner.personalised ?? '',
      personalisedMobile: banner.personalised_mobile ?? '',
      personalisedAlt: banner.personalised_alt ?? '',
      personalisedCta: banner.personalised_cta ?? '',
    },
    offers: offers.map((o) => ({
      badge: o.badge, title: o.title, accent: o.accent, sub: o.sub, cta: o.cta,
      href: o.href, match: o.match_key, image: o.image, w: o.w, btn: o.btn,
      bx: Number(o.bx), by: Number(o.by), alt: o.alt,
      ...(o.hidden ? { hidden: true } : {}),
    })),
    announcements: ann.map((a) => a.text),
  };
}

router.get('/', wrap(async (_req, res) => res.json(await readContent())));

const contentIn = z.object({
  banners: z.object({
    heroDesktop: z.string().max(2_000_000).default(''),
    heroMobile: z.string().max(2_000_000).default(''),
    heroAlt: z.string().max(1000).default(''),
    personalised: z.string().max(2_000_000).default(''),
    personalisedMobile: z.string().max(2_000_000).default(''),
    personalisedAlt: z.string().max(1000).default(''),
    personalisedCta: z.string().max(200).default(''),
  }),
  offers: z.array(z.object({
    badge: z.string().max(100).default(''),
    title: z.string().max(200).default(''),
    accent: z.string().max(100).default(''),
    sub: z.string().max(300).default(''),
    cta: z.string().max(100).default(''),
    href: z.string().max(500).default(''),
    match: z.enum(['sale', 'u500', '500-1000', 'o1000']).default('sale'),
    image: z.string().max(2_000_000).default(''),
    w: z.coerce.number().default(0),
    btn: z.enum(['solid', 'outline']).default('solid'),
    bx: z.coerce.number().default(50),
    by: z.coerce.number().default(50),
    alt: z.string().max(1000).default(''),
    hidden: z.boolean().optional(),
  })).default([]),
  announcements: z.array(z.string().max(300)).default([]),
});

router.put('/', parseBody(contentIn), wrap(async (req, res) => {
  const { banners: b, offers, announcements } = req.body;

  await tx(async (c) => {
    await c.query(
      `INSERT INTO banner (id, hero_desktop, hero_mobile, hero_alt, personalised,
         personalised_mobile, personalised_alt, personalised_cta)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET hero_desktop = EXCLUDED.hero_desktop,
         hero_mobile = EXCLUDED.hero_mobile, hero_alt = EXCLUDED.hero_alt,
         personalised = EXCLUDED.personalised,
         personalised_mobile = EXCLUDED.personalised_mobile,
         personalised_alt = EXCLUDED.personalised_alt,
         personalised_cta = EXCLUDED.personalised_cta`,
      [b.heroDesktop, b.heroMobile, b.heroAlt, b.personalised, b.personalisedMobile,
       b.personalisedAlt, b.personalisedCta],
    );

    await c.query(`DELETE FROM offer`);
    let i = 0;
    for (const o of offers) {
      await c.query(
        `INSERT INTO offer (badge, title, accent, sub, cta, href, match_key, image, w, btn, bx, by, alt, hidden, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [o.badge, o.title, o.accent, o.sub, o.cta, o.href, o.match, o.image, o.w, o.btn,
         o.bx, o.by, o.alt, !!o.hidden, i++],
      );
    }

    /* Blank rows are dropped rather than shown as gaps in the marquee. */
    await c.query(`DELETE FROM announcement`);
    i = 0;
    for (const text of announcements.map((x) => x.trim()).filter(Boolean)) {
      await c.query(`INSERT INTO announcement (text, sort_order) VALUES ($1,$2)`, [text, i++]);
    }
  });

  res.json({ ok: true });
}));

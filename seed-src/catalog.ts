/* Catalogue seed, ported from design_handoff_aarunya_admin/aarunya-api.js.
   Replaced by the backend's seed script; kept here so the admin runs standalone. */
import type {
  Category,
  ColorDef,
  ColorKey,
  Config,
  Courier,
  Offer,
  Product,
  Variant,
} from '../types';

export const ANNOUNCEMENTS = [
  'Pan India Shipping',
  'Free Shipping on Orders Above ₹499',
  'Anti-Tarnish Jewellery, Made for Everyday',
  'New Arrivals Every Week',
];

export const COLORS: Record<ColorKey, ColorDef> = {
  gold: { label: 'Gold', hex: '#CDA349', tint: '#F5E8CD' },
  rose: { label: 'Rose Gold', hex: '#D9A38E', tint: '#F7E1D9' },
  silver: { label: 'Silver', hex: '#C3C7CC', tint: '#ECEDEF' },
  black: { label: 'Black', hex: '#2E2826', tint: '#E6DFDC' },
  green: { label: 'Green', hex: '#3F7B5D', tint: '#DFECE3' },
};

/** "Pair it up" suggestions: which categories complete the look. */
export const PAIRINGS: Record<string, string[]> = {
  necklaces: ['earrings', 'bangles'],
  earrings: ['necklaces', 'rings'],
  bangles: ['earrings', 'rings'],
  bracelets: ['rings', 'necklaces'],
  rings: ['bracelets', 'earrings'],
  handchains: ['bangles', 'earrings'],
  hipchains: ['necklaces', 'earrings'],
  'nose-rings': ['earrings', 'necklaces'],
};

type SeedCategory = Omit<Category, 'image' | 'pairs' | 'subs'> & {
  subs?: Category['subs'];
};

const CATEGORY_SEED: SeedCategory[] = [
  {
    slug: 'necklaces', name: 'Anti-Tarnish Necklaces', short: 'Necklaces', ph: 'necklace', tint: '#F7E4E4',
    subs: [
      { slug: 'short', name: 'Short Necklaces' },
      { slug: 'long', name: 'Long Necklaces' },
      { slug: 'chokers', name: 'Chokers' },
      { slug: 'layered', name: 'Layered Necklaces' },
    ],
  },
  {
    slug: 'bangles', name: 'Anti-Tarnish Bangles', short: 'Bangles', ph: 'bangle', tint: '#F5ECDD',
    subs: [
      { slug: 'kadas', name: 'Kadas' },
      { slug: 'bangle-sets', name: 'Bangle Sets' },
      { slug: 'stone', name: 'Stone Bangles' },
    ],
  },
  {
    slug: 'bracelets', name: 'Anti-Tarnish Bracelets', short: 'Bracelets', ph: 'bracelet', tint: '#F3E1D7',
    subs: [
      { slug: 'chain', name: 'Chain Bracelets' },
      { slug: 'charm', name: 'Charm Bracelets' },
      { slug: 'cuffs', name: 'Cuffs' },
    ],
  },
  { slug: 'rings', name: 'Anti-Tarnish Rings', short: 'Rings', ph: 'ring', tint: '#F7E4E4' },
  { slug: 'handchains', name: 'Anti-Tarnish Handchains', short: 'Handchains', ph: 'handchain', tint: '#F5ECDD' },
  { slug: 'hipchains', name: 'Anti-Tarnish Hipchains', short: 'Hipchains', ph: 'hipchain', tint: '#F3E1D7' },
  {
    slug: 'earrings', name: 'Anti-Tarnish Earrings', short: 'Earrings', ph: 'earring', tint: '#F7E4E4',
    subs: [
      { slug: 'studs', name: 'Studs' },
      { slug: 'jhumkas', name: 'Jhumkas' },
      { slug: 'drops', name: 'Drops & Danglers' },
      { slug: 'hoops', name: 'Hoops' },
    ],
  },
  {
    slug: 'nose-rings', name: 'Anti-Tarnish Nose Rings', short: 'Nose Rings', ph: 'nose ring', tint: '#F5ECDD',
    subs: [
      { slug: 'nose-pins', name: 'Nose Pins' },
      { slug: 'clip-ons', name: 'Clip-ons' },
      { slug: 'nath', name: 'Nath' },
    ],
  },
];

export const OFFERS: Offer[] = [
  {
    badge: 'Up to {maxOff}% off', title: 'Festive', accent: 'Sale Picks',
    sub: 'Real savings on everyday favourites', cta: 'Shop the sale', href: '/shop?sale=1',
    match: 'sale', image: '/assets/offer-festive-sale.jpg', w: 846, btn: 'solid', bx: 6.74, by: 77.6,
    alt: 'Festive Sale Picks. Real savings on everyday favourites',
  },
  {
    badge: 'Under ₹500', title: 'Little', accent: 'Gifts of Love',
    sub: 'Thoughtful pieces for every budget', cta: 'Find a gift', href: '/shop?price=u500',
    match: 'u500', image: '/assets/offer-little-gifts.jpg', w: 878, btn: 'outline', bx: 5.81, by: 81,
    alt: 'Little Gifts of Love. Thoughtful pieces for every budget',
  },
];

export const COURIERS: Courier[] = [
  { id: 'shiprocket', name: 'Shiprocket', url: 'https://shiprocket.co/tracking/{awb}' },
  { id: 'delhivery', name: 'Delhivery', url: 'https://www.delhivery.com/track/package/{awb}' },
  { id: 'dtdc', name: 'DTDC', url: 'https://www.dtdc.in/tracking.asp?awb={awb}' },
  {
    id: 'indiapost', name: 'India Post (Speed Post)',
    url: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?id={awb}',
  },
];

export const OFFLINE_LOCATIONS = [
  'Home studio, Thrissur',
  'Exhibition / pop-up',
  'Walk-in',
  'Phone / WhatsApp (paid offline)',
];

export const CONFIG: Config = {
  WHATSAPP_NUMBER: '919876543210',
  WHATSAPP_TEXT: 'Hi Aarunya Jewels by Veena, I would like to know more about your jewellery.',
  INSTAGRAM_HANDLE: 'aarunyajewelsbyveena',
  EMAIL: 'hello@aarunyajewels.in',
  FREE_SHIPPING_THRESHOLD: 499,
  SHIPPING_FEE: 60,
  GIFT_WRAP_FEE: 49,
  DISPATCH_CUTOFF_HOUR: 16,
  PAYMENT_PROVIDER: 'razorpay',
  HOME_STATE_PIN_PREFIXES: ['67', '68', '69'],
  DELIVERY_DAYS: { local: [2, 3], rest: [4, 7] },
  LOW_STOCK: 2,
  couriers: COURIERS,
  defaultCourier: 'shiprocket',
  notifyOnShip: true,
  shipMsg: 'Hi {name}, your Aarunya order {order} is on its way! Track it here: {link}',
  returnWindow: 3,
  nonEligible: ['earrings', 'nose-rings'],
  requireVideo: true,
  allowRefund: true,
  locations: OFFLINE_LOCATIONS,
};

const v = (id: string, color: string, stock: number): Variant => ({
  id, color, stock, sku: '', images: [],
});

type SeedProduct = Omit<
  Product,
  'status' | 'giftWrap' | 'exchange' | 'seoTitle' | 'seoDesc' | 'specs'
>;

const PRODUCT_SEED: SeedProduct[] = [
  { id: 'p01', slug: 'mango-mala-necklace', name: 'Mango Mala Necklace', category: 'necklaces', type: 'long', popularity: 142, price: 1290, mrp: 1690, featured: true, isNew: false, createdAt: '2026-07-10', rating: null, reviewCount: 0,
    description: 'A Kerala-inspired mango motif necklace with a soft matte finish, made for festive mornings and family functions.',
    material: 'Brass base with anti-tarnish gold plating and kemp-style stones.',
    variants: [v('p01-gold', 'gold', 6), v('p01-rose', 'rose', 2)] },
  { id: 'p02', slug: 'pearl-drop-choker', name: 'Pearl Drop Choker', category: 'necklaces', type: 'chokers', popularity: 210, price: 899, mrp: 1199, featured: true, isNew: true, createdAt: '2026-09-20', rating: null, reviewCount: 0,
    description: 'A delicate choker with tiny pearl drops that sits close to the neck. Lovely with sarees and simple kurtis alike.',
    material: 'Stainless steel base with anti-tarnish plating and shell pearls.',
    variants: [v('p02-gold', 'gold', 8), v('p02-silver', 'silver', 4)] },
  { id: 'p03', slug: 'lakshmi-coin-short-necklace', name: 'Lakshmi Coin Short Necklace', category: 'necklaces', type: 'short', popularity: 64, price: 1490, mrp: 1490, featured: false, isNew: false, createdAt: '2026-05-02', rating: null, reviewCount: 0,
    description: 'Traditional coin necklace with Lakshmi motifs, a short length that works with every neckline.',
    material: 'Brass base with anti-tarnish gold plating.',
    variants: [v('p03-gold', 'gold', 3)] },
  { id: 'p04', slug: 'butterfly-pendant-chain', name: 'Butterfly Pendant Chain', category: 'necklaces', type: 'short', popularity: 188, price: 599, mrp: 799, featured: false, isNew: true, createdAt: '2026-09-28', rating: null, reviewCount: 0,
    description: 'A tiny butterfly on a fine chain. The kind of piece you put on once and forget to take off.',
    material: '316L stainless steel with anti-tarnish PVD coating.',
    variants: [v('p04-gold', 'gold', 10), v('p04-rose', 'rose', 5), v('p04-silver', 'silver', 0)] },
  { id: 'p05', slug: 'classic-kada-bangle-pair', name: 'Classic Kada Bangle Pair', category: 'bangles', type: 'kadas', popularity: 256, price: 749, mrp: 999, featured: true, isNew: false, createdAt: '2026-06-14', rating: null, reviewCount: 0,
    description: 'A pair of smooth, everyday kadas with a gentle shine. Stack them or wear one on each wrist.',
    material: 'Stainless steel with anti-tarnish PVD coating.',
    variants: [v('p05-gold', 'gold', 12), v('p05-rose', 'rose', 6), v('p05-silver', 'silver', 3)] },
  { id: 'p06', slug: 'emerald-stone-bangle-pair', name: 'Emerald Stone Bangle Pair', category: 'bangles', type: 'stone', popularity: 58, price: 849, mrp: 849, featured: false, isNew: false, createdAt: '2026-04-21', rating: null, reviewCount: 0,
    description: 'Gold-toned bangles set with a row of coloured stones, made for weddings and Onam.',
    material: 'Brass base with anti-tarnish gold plating and glass stones.',
    variants: [v('p06-green', 'green', 4), v('p06-black', 'black', 2)] },
  { id: 'p07', slug: 'twisted-rope-bracelet', name: 'Twisted Rope Bracelet', category: 'bracelets', type: 'chain', popularity: 173, price: 449, mrp: 599, featured: true, isNew: false, createdAt: '2026-03-30', rating: null, reviewCount: 0,
    description: 'A twisted rope bracelet with a secure lobster clasp. Light enough to wear every day.',
    material: '316L stainless steel with anti-tarnish PVD coating.',
    variants: [v('p07-gold', 'gold', 9), v('p07-silver', 'silver', 7), v('p07-rose', 'rose', 0)] },
  { id: 'p08', slug: 'evil-eye-charm-bracelet', name: 'Evil Eye Charm Bracelet', category: 'bracelets', type: 'charm', popularity: 121, price: 399, mrp: 549, featured: false, isNew: true, createdAt: '2026-09-12', rating: null, reviewCount: 0,
    description: 'A fine chain bracelet with a small evil eye charm, adjustable to fit most wrists.',
    material: 'Stainless steel with anti-tarnish plating and enamel charm.',
    variants: [v('p08-gold', 'gold', 15), v('p08-silver', 'silver', 6)] },
  { id: 'p09', slug: 'everyday-band-ring', name: 'Everyday Band Ring', category: 'rings', type: null, popularity: 96, price: 299, mrp: 299, featured: false, isNew: false, createdAt: '2026-02-18', rating: null, reviewCount: 0,
    description: 'A slim, comfortable band in four finishes. Wear one alone or stack a few.',
    material: '316L stainless steel with anti-tarnish PVD coating.',
    variants: [v('p09-gold', 'gold', 14), v('p09-silver', 'silver', 9), v('p09-rose', 'rose', 5), v('p09-black', 'black', 3)] },
  { id: 'p10', slug: 'floral-cz-adjustable-ring', name: 'Floral CZ Adjustable Ring', category: 'rings', type: null, popularity: 77, price: 349, mrp: 449, featured: false, isNew: true, createdAt: '2026-09-05', rating: null, reviewCount: 0,
    description: 'A little flower of sparkling stones on an adjustable band.',
    material: 'Brass base with anti-tarnish plating and cubic zirconia.',
    variants: [v('p10-gold', 'gold', 5), v('p10-rose', 'rose', 3)] },
  { id: 'p11', slug: 'petal-handchain', name: 'Petal Handchain', category: 'handchains', type: null, popularity: 49, price: 699, mrp: 899, featured: true, isNew: false, createdAt: '2026-06-01', rating: null, reviewCount: 0,
    description: 'A handchain with petal links that joins a ring and bracelet, pretty for mehendi and haldi.',
    material: 'Brass base with anti-tarnish gold plating.',
    variants: [v('p11-gold', 'gold', 4)] },
  { id: 'p12', slug: 'oddiyanam-hipchain', name: 'Oddiyanam Hipchain', category: 'hipchains', type: null, popularity: 31, price: 1890, mrp: 2290, featured: false, isNew: false, createdAt: '2026-05-19', rating: null, reviewCount: 0,
    description: 'A lightweight oddiyanam-style hipchain with temple detailing, adjustable at the back.',
    material: 'Brass base with anti-tarnish gold plating.',
    variants: [v('p12-gold', 'gold', 2)] },
  { id: 'p13', slug: 'mini-jhumka-drops', name: 'Mini Jhumka Drops', category: 'earrings', type: 'jhumkas', popularity: 298, price: 549, mrp: 699, featured: true, isNew: false, createdAt: '2026-07-22', rating: null, reviewCount: 0,
    description: 'Small, light jhumkas with a soft bell shape. Comfortable enough for a full day.',
    material: 'Brass base with anti-tarnish gold plating. Nickel-free hooks.',
    variants: [v('p13-gold', 'gold', 10), v('p13-green', 'green', 4)] },
  { id: 'p14', slug: 'pearl-huggie-hoops', name: 'Pearl Huggie Hoops', category: 'earrings', type: 'hoops', popularity: 134, price: 399, mrp: 399, featured: false, isNew: true, createdAt: '2026-09-16', rating: null, reviewCount: 0,
    description: 'Tiny huggie hoops with a single pearl drop.',
    material: 'Stainless steel with anti-tarnish plating and shell pearls.',
    variants: [v('p14-gold', 'gold', 8), v('p14-silver', 'silver', 5)] },
  { id: 'p15', slug: 'tiny-stud-nose-pin', name: 'Tiny Stud Nose Pin', category: 'nose-rings', type: 'nose-pins', popularity: 167, price: 199, mrp: 199, featured: false, isNew: false, createdAt: '2026-01-10', rating: null, reviewCount: 0,
    description: 'A tiny sparkling stud nose pin with a comfortable screw back.',
    material: 'Surgical steel with anti-tarnish plating.',
    variants: [v('p15-gold', 'gold', 20), v('p15-silver', 'silver', 12), v('p15-rose', 'rose', 6)] },
  { id: 'p16', slug: 'clip-on-nose-ring', name: 'Clip-on Nose Ring', category: 'nose-rings', type: 'clip-ons', popularity: 88, price: 249, mrp: 299, featured: false, isNew: false, createdAt: '2026-03-08', rating: null, reviewCount: 0,
    description: 'A clip-on nose ring, no piercing needed.',
    material: 'Brass base with anti-tarnish plating.',
    variants: [v('p16-gold', 'gold', 0)] },
];

/** Demo photos (Unsplash, free licence) — replaced by real product shots. */
const DEMO_IMAGES: Record<string, string[]> = {
  p01: ['1601121141461-9d6647bca1ed', '1722410180687-b05b50922362', '1601121141418-c1caa10a2a0b'],
  p02: ['1722410180670-b6d5a2e704fa', '1722410180644-5955f83ec8b1', '1601121141461-920cb1993441'],
  p03: ['1651160670627-2896ddf7822f', '1722410180687-b05b50922362', '1721807644561-9efcabee5c42'],
  p04: ['1611107683227-e9060eccd846', '1601121141461-920cb1993441', '1722410180644-5955f83ec8b1'],
  p05: ['1626784215013-13322cb0e471', '1679156271456-d6068c543ee7', '1721206625226-c064ff8d92a7'],
  p06: ['1724594888502-34f2b647ce33', '1626784215013-13322cb0e471', '1721206625226-c064ff8d92a7'],
  p07: ['1679156271456-d6068c543ee7', '1633810542706-90e5ff7557be', '1626784215013-13322cb0e471'],
  p08: ['1633810542706-90e5ff7557be', '1679156271456-d6068c543ee7', '1721807644561-9efcabee5c42'],
  p09: ['1689367436629-1d288f1e23b6', '1731406322264-dac59f83828b', '1724594963412-d98c3cd9eab6'],
  p10: ['1626784213922-d9f1e050cf8f', '1724594963412-d98c3cd9eab6', '1689367436629-1d288f1e23b6'],
  p11: ['1731406322264-dac59f83828b', '1633810542706-90e5ff7557be', '1721807644561-9efcabee5c42'],
  p12: ['1641699862936-be9f49b1c38d', '1617627143750-d86bc21e42bb', '1721206625226-c064ff8d92a7'],
  p13: ['1701450723521-788008974862', '1671642883395-0ab89c3ac890', '1688382654723-a7366006519b'],
  p14: ['1671642883395-0ab89c3ac890', '1701450723521-788008974862', '1722410180687-b05b50922362'],
  p15: ['1652374968229-a66a1c170c04', '1740431377901-c2f28d50c759', '1677084214263-13a2ef96a54c'],
  p16: ['1733937108021-d5db469f2216', '1652375152241-d3e62ab52b57', '1652374968229-a66a1c170c04'],
};

const demoUrl = (id: string) => `/assets/demo/${id}.jpg`;

/** Each colour gets the set rotated, so switching colour visibly swaps the photo. */
export const seedProducts = (): SeedProduct[] =>
  PRODUCT_SEED.map((p) => ({
    ...p,
    variants: p.variants.map((vr, i) => {
      const ids = DEMO_IMAGES[p.id] || [];
      return {
        ...vr,
        images: ids.map((_, k) => demoUrl(ids[(k + i) % ids.length])),
      };
    }),
  }));

export const seedCategories = (): Category[] =>
  CATEGORY_SEED.map((c) => ({
    ...c,
    subs: c.subs ?? [],
    pairs: PAIRINGS[c.slug] ?? [],
    image: '',
  }));

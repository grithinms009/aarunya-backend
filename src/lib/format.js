/* The same helpers the admin uses in src/lib, so SKUs, slugs and tints come out
   identical on both sides. */

export const num = (x) => Number(x) || 0;
export const DAY = 864e5;

export const inr = (n) => '₹' + Math.round(num(n)).toLocaleString('en-IN');

export const ymd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const slugify = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

/** Pale tint derived from a hex, as Settings does when a colour is added. */
export const tintOf = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  const m = (v) => Math.round(v + (255 - v) * 0.78);
  return '#' + [m(n >> 16), m((n >> 8) & 255), m(n & 255)]
    .map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
};

const COLOR_CODE = { gold: 'GLD', rose: 'RSG', silver: 'SLV', black: 'BLK', green: 'GRN' };
const CAT_CODE = {
  necklaces: 'NK', bangles: 'BG', bracelets: 'BR', rings: 'RG',
  handchains: 'HC', hipchains: 'HP', earrings: 'ER', 'nose-rings': 'NR',
};

/** AJ-{CATEGORY}{PRODUCT NUMBER}-{COLOUR}, the same rule as the admin's skuFor. */
export const skuFor = (p, color) => {
  const cat = CAT_CODE[p.category] || String(p.category || 'XX').slice(0, 2).toUpperCase();
  const n = String(p.id).replace(/\D/g, '').padStart(3, '0');
  const col = COLOR_CODE[color] || String(color).slice(0, 3).toUpperCase();
  return `AJ-${cat}${n}-${col}`;
};

/** Start of today, local time. */
export const sod = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return +d; };

export const iso = (v) => (v instanceof Date ? v.toISOString() : v ? new Date(v).toISOString() : '');

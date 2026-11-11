/* GST calculation engine. Pure functions, no I/O, integer paise only.

   Everything authoritative about tax lives here and on the server; the storefront and the
   admin only display what this returns.

   Conventions
   - Money is integer PAISE inside this module (₹207.77 = 20777). Never floats.
   - Rates are basis points of a percent ×100: 3% = 300, 1.5% = 150, 18% = 1800.
   - Rounding is round-half-up on integers (see divRound), applied at one declared level.

   Legal basis (verify with the CA, see the GST report):
   - Place of supply for goods that move: where the movement terminates, IGST Act s.10(1)(a).
     If the goods are delivered to another person on the direction of a *third person*, the
     third person is deemed the recipient and the place of supply is his principal place of
     business, s.10(1)(b) — enable with `thirdPartyDirection`.
   - Intra-state (supplier state == place of supply): CGST + SGST (UTGST in a UT without a
     legislature). Otherwise IGST. Never a mixture on one supply.
   - Discounts that are recorded on the invoice before supply are excluded from the value of
     supply, CGST Act s.15(3)(a): they are applied before GST here.
   - Packing / shipping charged by the supplier to the customer are part of the value of the
     supply, s.15(2)(c), and follow the tax treatment of the principal supply (s.8). */

/* ------------------------------------------------------------------ integer helpers */

/** round-half-up integer division for non-negative or negative numerators. */
export function divRound(num, den) {
  if (den === 0) throw new Error('division by zero');
  const neg = (num < 0) !== (den < 0);
  const n = Math.abs(num), d = Math.abs(den);
  const q = Math.floor((2 * n + d) / (2 * d));
  return neg ? -q : q;
}

/** Whole rupees → paise, refusing anything that is not an integer amount of paise. */
export function toPaise(rupees) {
  const p = Math.round(Number(rupees) * 100);
  if (!Number.isFinite(p)) throw new Error('bad amount');
  return p;
}

export const rupees = (paise) => paise / 100;

/** "₹1,234.50" style Indian grouping, two decimals. Used by the PDF and the API. */
export function formatINR(paise, { symbol = true } = {}) {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const whole = String(Math.floor(abs / 100));
  const frac = String(abs % 100).padStart(2, '0');
  let grouped;
  if (whole.length <= 3) grouped = whole;
  else grouped = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + whole.slice(-3);
  return `${neg ? '-' : ''}${symbol ? '₹ ' : ''}${grouped}.${frac}`;
}

/** Splits `total` across weights so the parts sum to exactly `total` (largest remainder). */
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!weights.length) return [];
  if (sum === 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => [e - Math.floor(e), i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]] += 1;
  return out;
}

/* ------------------------------------------------------------------ states */

/** GST state / UT codes. `ut` marks the UTs without a legislature, which levy UTGST. */
export const STATES = [
  ['01', 'Jammu & Kashmir', ['jammuandkashmir', 'jk', 'jammukashmir']],
  ['02', 'Himachal Pradesh', ['hp']],
  ['03', 'Punjab', ['pb']],
  ['04', 'Chandigarh', ['ch'], true],
  ['05', 'Uttarakhand', ['uttaranchal', 'uk']],
  ['06', 'Haryana', ['hr']],
  ['07', 'Delhi', ['newdelhi', 'nctofdelhi', 'dl']],
  ['08', 'Rajasthan', ['rj']],
  ['09', 'Uttar Pradesh', ['up']],
  ['10', 'Bihar', ['br']],
  ['11', 'Sikkim', ['sk']],
  ['12', 'Arunachal Pradesh', ['ar']],
  ['13', 'Nagaland', ['nl']],
  ['14', 'Manipur', ['mn']],
  ['15', 'Mizoram', ['mz']],
  ['16', 'Tripura', ['tr']],
  ['17', 'Meghalaya', ['ml']],
  ['18', 'Assam', ['as']],
  ['19', 'West Bengal', ['wb']],
  ['20', 'Jharkhand', ['jh']],
  ['21', 'Odisha', ['orissa', 'od', 'or']],
  ['22', 'Chhattisgarh', ['cg', 'chattisgarh']],
  ['23', 'Madhya Pradesh', ['mp']],
  ['24', 'Gujarat', ['gj']],
  ['26', 'Dadra & Nagar Haveli and Daman & Diu',
    ['dadraandnagarhaveli', 'damananddiu', 'dnhdd', 'dd', 'dn', 'daman', 'diu'], true],
  ['27', 'Maharashtra', ['mh']],
  ['29', 'Karnataka', ['ka']],
  ['30', 'Goa', ['ga']],
  ['31', 'Lakshadweep', ['ld'], true],
  ['32', 'Kerala', ['kl']],
  ['33', 'Tamil Nadu', ['tn', 'tamilnad']],
  ['34', 'Puducherry', ['pondicherry', 'py']],
  ['35', 'Andaman & Nicobar Islands', ['andamanandnicobar', 'an'], true],
  ['36', 'Telangana', ['tg', 'ts']],
  ['37', 'Andhra Pradesh', ['ap']],
  ['38', 'Ladakh', ['la'], true],
].map(([code, name, aliases = [], ut = false]) => ({ code, name, aliases, ut }));

const norm = (s) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
const BY_KEY = new Map();
for (const s of STATES) {
  BY_KEY.set(norm(s.name), s);
  for (const a of s.aliases) if (!BY_KEY.has(a)) BY_KEY.set(a, s);
}

/** Free text ("Kerala", "KL", "32", "32-Kerala", "kerala ") → {code, name, ut} or null. */
export function resolveState(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const digits = raw.match(/^(\d{2})\b/);
  if (digits) {
    const hit = STATES.find((s) => s.code === digits[1]);
    if (hit) return hit;
  }
  return BY_KEY.get(norm(raw)) ?? BY_KEY.get(norm(raw.replace(/^\d{2}\s*[-–]?\s*/, ''))) ?? null;
}

export const stateByCode = (code) => STATES.find((s) => s.code === code) ?? null;

/* ------------------------------------------------------------------ GSTIN */

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Structural + check-digit validation. This does NOT prove the registration exists. */
export function validateGstin(gstin) {
  const g = String(gstin ?? '').trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return { ok: false, reason: 'format' };
  if (!stateByCode(g.slice(0, 2))) return { ok: false, reason: 'state code' };
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(g[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  const check = GSTIN_CHARS[(36 - (sum % 36)) % 36];
  if (check !== g[14]) return { ok: false, reason: 'check digit' };
  return { ok: true, stateCode: g.slice(0, 2), pan: g.slice(2, 12), gstin: g };
}

/* ------------------------------------------------------------------ place of supply */

/**
 * Decides the place of supply and the tax type.
 * @param supplierStateCode  e.g. '32'
 * @param delivery           state text/code where the goods are delivered
 * @param billing            billing state text/code (used only for third-party direction)
 * @param thirdPartyDirection true when a third person directed delivery elsewhere (s.10(1)(b))
 */
export function determinePlaceOfSupply({ supplierStateCode, delivery, billing, thirdPartyDirection = false }) {
  const supplier = stateByCode(supplierStateCode);
  if (!supplier) throw new GstError('supplier_state', 'The business state is not configured');
  const d = resolveState(delivery);
  const b = resolveState(billing);
  const pos = thirdPartyDirection ? (b ?? null) : d;
  if (!pos) {
    throw new GstError('place_of_supply',
      thirdPartyDirection ? 'Billing state is needed to decide the place of supply'
        : 'Delivery state is needed to decide the GST treatment');
  }
  const intra = pos.code === supplier.code;
  return {
    supplier, pos, intra,
    taxType: intra ? 'intra' : 'inter',
    /** The state-level component is UTGST when the place of supply is a UT without a legislature. */
    stateTaxLabel: pos.ut ? 'UTGST' : 'SGST',
  };
}

export class GstError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}

/* ------------------------------------------------------------------ the engine */

/**
 * @param input.lines   [{ key, unitPaise, qty, itemDiscountPaise?, rateBp, hsn? }]
 *                      unitPaise is the catalogue price: GST-inclusive or exclusive per `mode`.
 * @param input.orderDiscountPaise  order-level discount, apportioned over goods before GST
 * @param input.charges [{ key, label, amountPaise }] shipping / packing / gift-wrap; priced in `mode`
 * @param input.mode    'inclusive' | 'exclusive'
 * @param input.rounding 'line' | 'invoice'  — level at which tax is rounded
 * @param input.roundOffToRupee  round the grand total to a whole rupee and show the difference
 * @param input.taxType 'intra' | 'inter'
 */
export function computeTax(input) {
  const {
    lines, charges = [], orderDiscountPaise = 0, mode = 'inclusive', rounding = 'line',
    roundOffToRupee = false, taxType,
  } = input;
  if (!['inclusive', 'exclusive'].includes(mode)) throw new GstError('mode', 'bad price mode');
  if (!['line', 'invoice'].includes(rounding)) throw new GstError('rounding', 'bad rounding policy');
  if (!['intra', 'inter'].includes(taxType)) throw new GstError('tax_type', 'bad tax type');
  if (!lines.length) throw new GstError('empty', 'No lines to tax');

  const int = (n, what) => {
    if (!Number.isInteger(n) || n < 0) throw new GstError('amount', `${what} must be whole paise`);
    return n;
  };

  /* 1. gross of each goods line, less its own discount */
  const goods = lines.map((l) => {
    const gross = int(l.unitPaise, 'price') * int(l.qty, 'qty');
    const disc = int(l.itemDiscountPaise ?? 0, 'discount');
    if (disc > gross) throw new GstError('discount', 'A line discount exceeds the line value');
    if (!Number.isInteger(l.rateBp) || l.rateBp < 0) throw new GstError('rate', `No GST rate for ${l.key}`);
    return { ...l, gross, itemDiscountPaise: disc, net: gross - disc };
  });

  /* 2. order-level discount, spread over goods in proportion to their net value */
  const odisc = int(orderDiscountPaise, 'discount');
  const goodsNet = goods.reduce((t, g) => t + g.net, 0);
  if (odisc > goodsNet) throw new GstError('discount', 'The discount exceeds the order value');
  const spread = allocate(odisc, goods.map((g) => g.net));
  goods.forEach((g, i) => { g.orderDiscountPaise = spread[i]; g.value = g.net - spread[i]; });

  /* 3. additional charges follow the principal supply (apportioned over rate groups by
        goods value). Each rate group yields its own charge line, so a single-rate basket
        gets exactly one line per charge. */
  const rates = [...new Set(goods.map((g) => g.rateBp))].sort((a, b) => a - b);
  const rateValue = rates.map((r) => goods.filter((g) => g.rateBp === r).reduce((t, g) => t + g.value, 0));
  const chargeLines = [];
  for (const ch of charges) {
    const amt = int(ch.amountPaise, 'charge');
    if (!amt) continue;
    const parts = allocate(amt, rateValue);
    parts.forEach((p, i) => {
      if (p > 0) chargeLines.push({
        key: ch.key, label: ch.label, kind: 'charge', hsn: '', qty: 1, unitPaise: p,
        itemDiscountPaise: 0, orderDiscountPaise: 0, gross: p, net: p, value: p, rateBp: rates[i],
      });
    });
  }
  const all = [...goods.map((g) => ({ ...g, kind: 'goods' })), ...chargeLines];

  /* 4. split each value into taxable + GST */
  if (rounding === 'line') {
    for (const l of all) {
      if (mode === 'inclusive') {
        l.taxable = divRound(l.value * 10000, 10000 + l.rateBp);
        l.tax = l.value - l.taxable;
      } else {
        l.taxable = l.value;
        l.tax = divRound(l.value * l.rateBp, 10000);
      }
    }
  } else {
    /* invoice level: round once per rate group, then allocate back to the lines */
    for (const r of rates) {
      const grp = all.filter((l) => l.rateBp === r);
      const v = grp.reduce((t, l) => t + l.value, 0);
      const taxable = mode === 'inclusive' ? divRound(v * 10000, 10000 + r) : v;
      const tax = mode === 'inclusive' ? v - taxable : divRound(v * r, 10000);
      const tx = allocate(tax, grp.map((l) => l.value));
      grp.forEach((l, i) => {
        l.tax = tx[i];
        l.taxable = mode === 'inclusive' ? l.value - tx[i] : l.value;
      });
    }
  }

  /* 5. tax components. CGST takes the odd paisa, so CGST + SGST == GST exactly. */
  for (const l of all) {
    if (taxType === 'intra') {
      l.cgst = Math.ceil(l.tax / 2); l.sgst = l.tax - l.cgst; l.igst = 0;
    } else {
      l.cgst = 0; l.sgst = 0; l.igst = l.tax;
    }
    l.total = l.taxable + l.tax;
  }

  const sum = (f) => all.reduce((t, l) => t + f(l), 0);
  const totals = {
    grossGoods: goods.reduce((t, g) => t + g.gross, 0),
    itemDiscount: goods.reduce((t, g) => t + g.itemDiscountPaise, 0),
    orderDiscount: odisc,
    discount: goods.reduce((t, g) => t + g.itemDiscountPaise, 0) + odisc,
    taxable: sum((l) => l.taxable),
    cgst: sum((l) => l.cgst), sgst: sum((l) => l.sgst), igst: sum((l) => l.igst),
    tax: sum((l) => l.tax),
    charges: chargeLines.reduce((t, l) => t + l.total, 0),
  };
  const preRound = totals.taxable + totals.tax;
  const grand = roundOffToRupee ? Math.round(preRound / 100) * 100 : preRound;
  totals.roundOff = grand - preRound;
  totals.grandTotal = grand;

  /* Invariants: if any of these ever fails the invoice must not be issued. */
  const bad = (m) => { throw new GstError('invariant', `GST invariant failed: ${m}`); };
  if (totals.cgst + totals.sgst + totals.igst !== totals.tax) bad('components != tax');
  if (taxType === 'intra' && totals.igst) bad('IGST on an intra-state supply');
  if (taxType === 'inter' && (totals.cgst || totals.sgst)) bad('CGST/SGST on an inter-state supply');
  if (mode === 'inclusive' && !roundOffToRupee) {
    const expected = goodsNet - odisc + charges.reduce((t, c) => t + c.amountPaise, 0);
    if (totals.grandTotal !== expected) bad('inclusive total drifted from customer price');
  }
  return { taxType, mode, rounding, lines: all, totals };
}

/* ------------------------------------------------------------------ amount in words */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
const below1000 = (n) => (n >= 100
  ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + below100(n % 100) : '')
  : below100(n));

/** Indian system (lakh / crore). 41800 → "Four Hundred and Eighteen Rupees only". */
export function amountInWords(paise) {
  const rs = Math.floor(Math.abs(paise) / 100);
  const ps = Math.abs(paise) % 100;
  const part = (n) => {
    if (n === 0) return 'Zero';
    const out = [];
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thou = Math.floor(n / 1000); n %= 1000;
    if (crore) out.push(below100(crore) + ' Crore');
    if (lakh) out.push(below100(lakh) + ' Lakh');
    if (thou) out.push(below100(thou) + ' Thousand');
    if (n) out.push(below1000(n));
    return out.join(' ');
  };
  let s = `${part(rs)} Rupees`;
  if (ps) s += ` and ${part(ps)} Paise`;
  return s + ' only';
}

/* ------------------------------------------------------------------ financial year */

/** Indian FY runs 1 Apr – 31 Mar, evaluated in IST. 2026-11-10 → { fy: '26-27', startYear: 2026 }. */
export function financialYear(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  const yy = (n) => String(n % 100).padStart(2, '0');
  return { fy: `${yy(start)}-${yy(start + 1)}`, startYear: start };
}

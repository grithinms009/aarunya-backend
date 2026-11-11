/* Pure tests of the GST engine (tests A–J). No database, no network. Run: node test/gst.engine.test.mjs */
import { computeTax, determinePlaceOfSupply, amountInWords, allocate, divRound, validateGstin, resolveState, financialYear } from '../src/lib/gst.js';

const fails = [];
const ok = (n, c, x = '') => { if (!c) fails.push(n); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${c ? '' : x}`); };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const sec = (t) => console.log(`\n── ${t} ──`);
const KL = '32';
const pos = (delivery, extra = {}) => determinePlaceOfSupply({ supplierStateCode: KL, delivery, billing: delivery, ...extra });
const one = (o) => computeTax({ lines: [{ key: '0', unitPaise: 20777, qty: 1, rateBp: 300 }], ...o });

sec('A  Kerala customer: CGST + SGST');
{
  const p = pos('Kerala');
  const r = one({ taxType: p.taxType, mode: 'exclusive' });
  eq('tax type intra', p.taxType, 'intra');
  eq('CGST 3.12 / SGST 3.11', [r.totals.cgst, r.totals.sgst], [312, 311]);
  eq('total GST 6.23', r.totals.tax, 623);
  eq('IGST nil', r.totals.igst, 0);
  eq('invoice total 214.00', r.totals.grandTotal, 21400);
}
sec('B  Karnataka customer: IGST');
{
  const p = pos('Karnataka');
  const r = one({ taxType: p.taxType, mode: 'exclusive' });
  eq('tax type inter', p.taxType, 'inter');
  eq('IGST 6.23, no CGST/SGST', [r.totals.igst, r.totals.cgst, r.totals.sgst], [623, 0, 0]);
  eq('invoice total 214.00', r.totals.grandTotal, 21400);
}
sec('C  Tamil Nadu customer: IGST');
eq('TN is inter-state', pos('Tamil Nadu').taxType, 'inter');
eq('state aliases resolve', [resolveState('KL').code, resolveState('32-Kerala').code, resolveState('  kerala ').code, resolveState('Orissa').code], ['32', '32', '32', '21']);

sec('D  Billing differs from delivery');
{
  const a = determinePlaceOfSupply({ supplierStateCode: KL, delivery: 'Kerala', billing: 'Karnataka' });
  eq('delivery Kerala, billing Karnataka → place of supply Kerala, CGST+SGST', [a.pos.code, a.taxType], ['32', 'intra']);
  const b = determinePlaceOfSupply({ supplierStateCode: KL, delivery: 'Kerala', billing: 'Karnataka', thirdPartyDirection: true });
  eq('third-person direction s.10(1)(b) → billing state, IGST', [b.pos.code, b.taxType], ['29', 'inter']);
  const c = determinePlaceOfSupply({ supplierStateCode: KL, delivery: 'Karnataka', billing: 'Kerala' });
  eq('delivery Karnataka, billing Kerala → IGST', c.taxType, 'inter');
  let threw = false; try { pos(''); } catch { threw = true; }
  ok('unknown delivery state is refused, not guessed', threw);
  eq('Delhi is SGST, Ladakh is UTGST', [pos('Delhi').stateTaxLabel, pos('Ladakh').stateTaxLabel], ['SGST', 'UTGST']);
}

sec('E  Mixed products, per-line rates');
{
  const r = computeTax({ taxType: 'intra', mode: 'inclusive', lines: [
    { key: '0', unitPaise: 21400, qty: 1, rateBp: 300 }, { key: '1', unitPaise: 11200, qty: 1, rateBp: 1200 }] });
  eq('line 1 @3%', [r.lines[0].taxable, r.lines[0].tax], [20777, 623]);
  eq('line 2 @12%', [r.lines[1].taxable, r.lines[1].tax], [10000, 1200]);
  eq('totals', [r.totals.taxable, r.totals.tax, r.totals.grandTotal], [30777, 1823, 32600]);
}

sec('F  Inclusive pricing');
{
  const r = one({ taxType: 'intra', mode: 'inclusive', lines: [{ key: '0', unitPaise: 21400, qty: 1, rateBp: 300 }] });
  eq('₹214 inclusive → 207.77 + 6.23 = 214.00', [r.totals.taxable, r.totals.tax, r.totals.grandTotal], [20777, 623, 21400]);
  const s = computeTax({ taxType: 'intra', mode: 'inclusive', lines: [{ key: '0', unitPaise: 20900, qty: 2, rateBp: 300 }] });
  eq('sample invoice: 2 × ₹209 → 405.83 + 12.17 = 418.00', [s.totals.taxable, s.totals.tax, s.totals.grandTotal], [40583, 1217, 41800]);
  eq('…and its CGST/SGST add up (the sample PDF printed 6.09 + 6.09 = 12.18)', s.totals.cgst + s.totals.sgst, 1217);
}

sec('G  Exclusive pricing: GST added once');
{
  const r = computeTax({ taxType: 'inter', mode: 'exclusive', lines: [{ key: '0', unitPaise: 21400, qty: 1, rateBp: 300 }] });
  eq('₹214 + 3% = 220.42', [r.totals.taxable, r.totals.igst, r.totals.grandTotal], [21400, 642, 22042]);
  const w = computeTax({ taxType: 'intra', mode: 'exclusive', roundOffToRupee: true, lines: [{ key: '0', unitPaise: 21400, qty: 1, rateBp: 300 }] });
  eq('round-off to the rupee is shown separately', [w.totals.roundOff, w.totals.grandTotal], [-42, 22000]);
}

sec('H  Discounts before GST');
{
  const r = computeTax({ taxType: 'intra', mode: 'exclusive', orderDiscountPaise: 3000, lines: [
    { key: '0', unitPaise: 10000, qty: 2, itemDiscountPaise: 2000, rateBp: 300 },
    { key: '1', unitPaise: 15000, qty: 1, rateBp: 300 }] });
  eq('item discount then order discount', [r.totals.itemDiscount, r.totals.orderDiscount], [2000, 3000]);
  eq('taxable = 20000-2000 + 15000 - 3000', r.totals.taxable, 30000);
  eq('GST on the discounted value', r.totals.tax, 900);
  eq('order discount spread exactly', r.lines[0].orderDiscountPaise + r.lines[1].orderDiscountPaise, 3000);
  let threw = false; try { computeTax({ taxType: 'intra', orderDiscountPaise: 999999, lines: [{ key: '0', unitPaise: 100, qty: 1, rateBp: 300 }] }); } catch { threw = true; }
  ok('a discount larger than the order is refused', threw);
}

sec('I  Shipping and gift wrap follow the principal supply');
{
  const r = computeTax({ taxType: 'inter', mode: 'inclusive', lines: [{ key: '0', unitPaise: 29900, qty: 1, rateBp: 300 }],
    charges: [{ key: 'shipping', label: 'Shipping charges', amountPaise: 6000 }, { key: 'gift', label: 'Gift wrap', amountPaise: 4900 }] });
  eq('single-rate basket: one line per charge', r.lines.filter((l) => l.kind === 'charge').length, 2);
  eq('shipping ₹60 inclusive @3% → 58.25 + 1.75', [r.lines[1].taxable, r.lines[1].tax], [5825, 175]);
  eq('customer pays 299 + 60 + 49 = 408', r.totals.grandTotal, 40800);
  const m = computeTax({ taxType: 'intra', mode: 'inclusive',
    lines: [{ key: '0', unitPaise: 30000, qty: 1, rateBp: 300 }, { key: '1', unitPaise: 10000, qty: 1, rateBp: 1200 }],
    charges: [{ key: 'shipping', label: 'Shipping charges', amountPaise: 6000 }] });
  const ch = m.lines.filter((l) => l.kind === 'charge');
  eq('mixed basket: shipping apportioned by goods value 3:1', ch.map((l) => l.value), [4500, 1500]);
  eq('…each part at its own rate', ch.map((l) => l.rateBp), [300, 1200]);
  eq('…and the customer still pays exactly 460', m.totals.grandTotal, 46000);
}

sec('J  Rounding fuzz: components, totals and payment reconcile to the paisa');
{
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let bad = 0, runs = 0;
  for (let i = 0; i < 6000; i++) {
    const n = 1 + rnd(5);
    const rates = [0, 300, 500, 1200, 1800];
    const lines = Array.from({ length: n }, (_, k) => ({ key: String(k), unitPaise: 100 * (1 + rnd(2500)) + (rnd(2) ? rnd(100) : 0), qty: 1 + rnd(7), rateBp: rates[rnd(rates.length)] }));
    const goods = lines.reduce((t, l) => t + l.unitPaise * l.qty, 0);
    const odisc = rnd(3) ? 0 : rnd(Math.max(1, goods));
    const mode = rnd(2) ? 'inclusive' : 'exclusive';
    const rounding = rnd(2) ? 'line' : 'invoice';
    const taxType = rnd(2) ? 'intra' : 'inter';
    const charges = [{ key: 'shipping', label: 's', amountPaise: rnd(2) ? 6000 : 0 }, { key: 'gift', label: 'g', amountPaise: rnd(2) ? 4900 : 0 }];
    let r;
    try { r = computeTax({ taxType, mode, rounding, lines, orderDiscountPaise: odisc, charges }); } catch (e) { bad++; console.log(e.message); continue; }
    runs++;
    const t = r.totals;
    const lineTax = r.lines.reduce((s, l) => s + l.tax, 0);
    const compOk = r.lines.every((l) => l.cgst + l.sgst + l.igst === l.tax && l.taxable + l.tax === l.total);
    const sumOk = t.taxable + t.tax + t.roundOff === t.grandTotal && lineTax === t.tax && t.cgst + t.sgst + t.igst === t.tax;
    const payable = goods - odisc + charges.reduce((s, c) => s + c.amountPaise, 0);
    const incl = mode !== 'inclusive' || t.grandTotal === payable;
    const excl = mode !== 'exclusive' || t.taxable === payable;
    const noMix = taxType === 'intra' ? t.igst === 0 : t.cgst === 0 && t.sgst === 0;
    if (!(compOk && sumOk && incl && excl && noMix)) { bad++; if (bad < 4) console.log('bad', JSON.stringify({ lines, odisc, mode, rounding, taxType, t })); }
  }
  ok(`${runs} random baskets: zero one-paisa discrepancies`, bad === 0, `${bad} bad`);
}

sec('helpers');
eq('allocate keeps the total', allocate(100, [1, 1, 1]).reduce((a, b) => a + b), 100);
eq('divRound half-up', [divRound(5, 2), divRound(-5, 2), divRound(4, 3)], [3, -3, 1]);
eq('amount in words (lakh/crore)', amountInWords(12345678900), 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred and Eighty Nine Rupees only');
eq('paise in words', amountInWords(10150), 'One Hundred and One Rupees and Fifty Paise only');
eq('candidate GSTIN passes structure + check digit', validateGstin('32BTBPG5961M1ZK').ok, true);
eq('a one-character typo fails', validateGstin('32BTBPG5961M1ZL').ok, false);
eq('financial year boundary (IST)', [financialYear(new Date('2027-03-31T18:00:00Z')).fy, financialYear(new Date('2027-03-31T19:00:00Z')).fy], ['26-27', '27-28']);

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join('; ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);

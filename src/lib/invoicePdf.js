/* Renders an invoice or credit-note snapshot to a PDF. Reads only the stored snapshot — never
   live product, customer or settings rows — so a re-download always matches what was issued.

   Layout follows the supplied sample invoices (header band, Bill To / Invoice Details, item
   table, totals block), extended with the statutory particulars of Rule 46: HSN, tax rate and
   CGST/SGST/IGST per line, delivery address, place of supply, reverse charge. */
import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { amountInWords, formatINR, stateByCode } from './gst.js';

const require = createRequire(import.meta.url);
const FONTS = join(dirname(require.resolve('@fontsource/noto-sans/package.json')), 'files');
const F = {
  r: join(FONTS, 'noto-sans-latin-400-normal.woff'),
  b: join(FONTS, 'noto-sans-latin-700-normal.woff'),
};

const INK = '#1c1a22', MUTED = '#5f5b68', RULE = '#cfcbd8', ACCENT = '#5b4fb3', BAND = '#ece9f8';
const dmy = (d) => {
  const t = new Date(new Date(d).getTime() + 5.5 * 3600e3);
  return `${String(t.getUTCDate()).padStart(2, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${t.getUTCFullYear()}`;
};
const pct = (bp) => `${(bp / 100).toFixed(bp % 100 ? (bp % 10 ? 2 : 1) : 1)}%`;

export function renderDocument(doc, { watermark = '' } = {}) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 0, info: { Title: doc.title, Author: doc.supplier.legalName || doc.supplier.tradeName || '' } });
    const chunks = [];
    pdf.on('data', (d) => chunks.push(d));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    try { draw(pdf, doc, watermark); pdf.end(); } catch (e) { reject(e); }
  });
}

function draw(pdf, d, watermark) {
  pdf.registerFont('r', F.r); pdf.registerFont('b', F.b);
  const W = 595.28, H = 841.89, M = 32, CW = W - 2 * M;

  /* ₹ is drawn as vector strokes (two bars, a bowl and a leg) instead of being embedded as a
     font glyph, so it looks the same in every PDF viewer and prints crisply. */
  const rupeeW = (_f, size) => size * 0.66;
  const drawRupee = (x, baseline, size, color, bold) => {
    const w = size * 0.5, h = size * 0.7, top = baseline - h, x0 = x + size * 0.05;
    pdf.save().lineWidth(size * (bold ? 0.1 : 0.075)).strokeColor(color).lineCap('butt').lineJoin('miter');
    pdf.moveTo(x0, top).lineTo(x0 + w, top).stroke();
    pdf.moveTo(x0, top + h * 0.2).lineTo(x0 + w, top + h * 0.2).stroke();
    pdf.moveTo(x0, top).lineTo(x0 + w * 0.5, top)
      .bezierCurveTo(x0 + w * 0.95, top, x0 + w * 0.95, top + h * 0.5, x0 + w * 0.5, top + h * 0.5)
      .lineTo(x0, top + h * 0.5).stroke();
    pdf.moveTo(x0 + w * 0.12, top + h * 0.5).lineTo(x0 + w * 0.8, baseline).stroke();
    pdf.restore();
  };
  const width = (str, f, size) => {
    let w = 0;
    for (const part of String(str).split(/(₹)/)) {
      if (!part) continue;
      if (part === '₹') { w += rupeeW(f, size); continue; }
      pdf.font(f).fontSize(size);
      w += pdf.widthOfString(part);
    }
    return w;
  };
  const put = (str, x, y, { f = 'r', size = 8.5, color = INK, align = 'left', w = 0 } = {}) => {
    let sx = x;
    if (align === 'right') sx = x + w - width(str, f, size);
    else if (align === 'center') sx = x + (w - width(str, f, size)) / 2;
    pdf.fillColor(color);
    for (const part of String(str).split(/(₹)/)) {
      if (!part) continue;
      pdf.font(f).fontSize(size);
      if (part === '₹') {
        drawRupee(sx, y + (pdf._font.ascender / 1000) * size, size, color, f === 'b');
        sx += rupeeW(f, size);
      } else {
        pdf.text(part, sx, y, { lineBreak: false });
        sx += pdf.widthOfString(part);
      }
    }
  };
  const wrapLines = (s, maxW, f = 'r', size = 8.5) => {
    const out = [];
    for (const para of String(s ?? '').split('\n')) {
      let cur = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = cur ? `${cur} ${word}` : word;
        if (width(t, f, size) > maxW && cur) { out.push(cur); cur = word; } else cur = t;
      }
      if (cur) out.push(cur);
    }
    return out;
  };
  const block = (s, x, y, maxW, o = {}) => {
    const size = o.size ?? 8.5;
    const ls = wrapLines(s, maxW, o.f ?? 'r', size);
    ls.forEach((l, i) => put(l, x, y + i * (size + 3.2), { ...o, size }));
    return y + ls.length * (size + 3.2);
  };
  const rule = (y, c = RULE, x1 = M, x2 = W - M, lw = 0.7) => {
    pdf.moveTo(x1, y).lineTo(x2, y).lineWidth(lw).strokeColor(c).stroke();
  };

  const isNote = d.kind === 'credit_note';
  const s = d.supplier;
  const cancelled = d.status === 'cancelled';
  let y = 34;

  /* ---- supplier header */
  put(s.tradeName || s.legalName, M, y, { f: 'b', size: 15 }); y += 20;
  if (s.legalName && s.tradeName && s.legalName !== s.tradeName) { put(`Legal name: ${s.legalName}`, M, y, { color: MUTED }); y += 12; }
  const addr = [s.address.line1, s.address.line2, s.address.city, s.address.pin && `PIN ${s.address.pin}`].filter(Boolean).join(', ');
  y = block(addr, M, y, 330, { color: MUTED });
  put(`Phone: ${s.phone || '—'}${s.email ? `   Email: ${s.email}` : ''}`, M, y, { color: MUTED }); y += 12;
  put(`GSTIN: ${s.gstin}`, M, y, { f: 'b' }); y += 12;
  put(`State: ${s.stateCode}-${s.state}`, M, y, { color: MUTED }); y += 10;
  rule(y + 6, ACCENT, M, W - M, 1.3); y += 16;

  const title = isNote ? 'CREDIT NOTE' : (d.reverseCharge ? 'TAX INVOICE' : 'TAX INVOICE');
  put(title, M, y, { f: 'b', size: 15, color: ACCENT, align: 'center', w: CW }); y += 30;

  /* ---- parties + document block */
  const c = d.customer;
  const colW = 230;
  let yl = y;
  put('Bill To', M, yl, { f: 'b' }); yl += 13;
  put(c.billing.name || c.name, M, yl, { f: 'b', size: 9.5 }); yl += 13;
  yl = block([c.billing.address, c.billing.city, c.billing.pin].filter(Boolean).join(', '), M, yl, colW);
  if (c.billing.state) { put(`State: ${c.billing.stateCode}-${c.billing.state}`, M, yl, { color: MUTED }); yl += 11.7; }
  if (c.billing.gstin) { put(`GSTIN: ${c.billing.gstin}`, M, yl, { color: MUTED }); yl += 11.7; }
  if (c.phone) { put(`Contact No.: ${c.phone}`, M, yl, { color: MUTED }); yl += 11.7; }

  const sx = M + 255;
  let ys = y;
  put('Ship To / Delivery Address', sx, ys, { f: 'b' }); ys += 13;
  put(c.shipping.name || c.name, sx, ys, { f: 'b', size: 9.5 }); ys += 13;
  ys = block([c.shipping.address, c.shipping.city, c.shipping.pin].filter(Boolean).join(', '), sx, ys, 150);
  if (c.shipping.state) { put(`State: ${c.shipping.stateCode}-${c.shipping.state}`, sx, ys, { color: MUTED }); ys += 11.7; }

  const rx = W - M - 150;
  let yr = y;
  put(isNote ? 'Credit Note Details' : 'Invoice Details', rx, yr, { f: 'b', w: 150, align: 'right' }); yr += 13;
  const kv = (k, v) => { put(`${k}: ${v}`, rx, yr, { w: 150, align: 'right' }); yr += 12; };
  kv(isNote ? 'Credit Note No.' : 'Invoice No.', d.number);
  kv('Date', dmy(d.issuedAt));
  kv('Order No.', d.orderId);
  if (isNote) kv('Against Invoice', d.invoiceNo);
  const pos = stateByCode(d.placeOfSupply);
  kv('Place of Supply', `${d.placeOfSupply}-${pos?.name ?? ''}`);
  kv('Reverse Charge', d.reverseCharge ? 'Yes' : 'No');
  y = Math.max(yl, ys, yr) + 8;

  /* ---- line table */
  const intra = d.taxType === 'intra';
  const cols = intra
    ? [['#', 18, 'l'], ['Item / Description', 128, 'l'], ['HSN', 38, 'l'], ['Qty', 24, 'r'], ['Price', 46, 'r'],
       ['Taxable', 50, 'r'], ['GST%', 28, 'r'], ['CGST', 42, 'r'], ['SGST', 42, 'r'], ['Amount', 57, 'r']]
    : [['#', 18, 'l'], ['Item / Description', 150, 'l'], ['HSN', 40, 'l'], ['Qty', 24, 'r'], ['Price', 48, 'r'],
       ['Taxable', 54, 'r'], ['GST%', 30, 'r'], ['IGST', 50, 'r'], ['Amount', 71, 'r']];
  const scale = CW / cols.reduce((t, k) => t + k[1], 0);
  const xs = []; { let x = M; for (const k of cols) { xs.push(x); x += k[1] * scale; } }
  const cw = cols.map((k) => k[1] * scale);
  const header = () => {
    pdf.rect(M, y, CW, 19).fill(ACCENT);
    cols.forEach((k, i) => put(k[0], xs[i] + 3, y + 5.5, { f: 'b', size: 7.5, color: '#fff', align: k[2] === 'r' ? 'right' : 'left', w: cw[i] - 6 }));
    y += 19;
  };
  header();
  const mo = (p) => formatINR(p, { symbol: false });
  d.lines.forEach((l, n) => {
    const name = l.sku ? `${l.name}\nSKU: ${l.sku}` : l.name;
    const sign = isNote ? '' : '';
    const nl = wrapLines(name, cw[1] - 6, 'r', 8);
    const rowH = Math.max(18, nl.length * 10.5 + 7);
    if (y + rowH > H - 190) { pdf.addPage(); y = 40; header(); }
    const cells = intra
      ? [String(n + 1), null, l.hsn || '—', String(l.qty ?? ''), l.unitPaise != null ? mo(l.unitPaise) : '',
         mo(l.taxablePaise), pct(l.rateBp), mo(l.cgstPaise), mo(l.sgstPaise), mo(l.totalPaise)]
      : [String(n + 1), null, l.hsn || '—', String(l.qty ?? ''), l.unitPaise != null ? mo(l.unitPaise) : '',
         mo(l.taxablePaise), pct(l.rateBp), mo(l.igstPaise), mo(l.totalPaise)];
    cells.forEach((v, i) => {
      if (i === 1) { nl.forEach((t, k) => put(t, xs[1] + 3, y + 4.5 + k * 10.5, { size: 8, f: k === 0 ? 'b' : 'r', color: k === 0 ? INK : MUTED })); return; }
      put(sign + v, xs[i] + 3, y + 4.5, { size: 8, align: cols[i][2] === 'r' ? 'right' : 'left', w: cw[i] - 6 });
    });
    if (l.discountPaise) put(`Disc. ${mo(l.discountPaise)}`, xs[4] + 3, y + 14.5, { size: 6.5, color: MUTED, align: 'right', w: cw[4] - 6 });
    y += rowH; rule(y, RULE, M, W - M, 0.4);
  });
  y += 8;

  /* ---- words (left) and totals (right) */
  if (y > H - 200) { pdf.addPage(); y = 40; }
  const t = d.totals;
  const totX = M + CW * 0.52, totW = CW * 0.48;
  const row = (k, v, o = {}) => {
    if (o.band) pdf.rect(totX, y - 3, totW, 17).fill(ACCENT);
    put(k, totX + 5, y, { f: o.b ? 'b' : 'r', color: o.band ? '#fff' : INK });
    put(v, totX + 5, y, { f: o.b ? 'b' : 'r', color: o.band ? '#fff' : INK, align: 'right', w: totW - 10 });
    y += o.band ? 19 : 14.5;
  };
  const top = y;
  put(isNote ? 'Credit Amount In Words' : 'Invoice Amount In Words', M, y, { f: 'b' });
  block(amountInWords(isNote ? d.grandTotalPaise : t.grandTotal), M, y + 13, totX - M - 14);

  if (!isNote) {
    if (t.itemDiscount + t.orderDiscount) row('Discount', `- ${formatINR(t.itemDiscount + t.orderDiscount)}`);
    row('Taxable value', formatINR(t.taxable));
    if (intra) { row(`CGST`, formatINR(t.cgst)); row(d.stateTaxLabel || 'SGST', formatINR(t.sgst)); }
    else row('IGST', formatINR(t.igst));
    if (t.charges) row('(incl. shipping / other charges)', formatINR(t.charges));
    if (t.roundOff) row('Round off', formatINR(t.roundOff));
    row('Total', formatINR(t.grandTotal), { b: true, band: true });
    row('Received', formatINR(t.receivedPaise));
    row('Balance', formatINR(t.balancePaise));
  } else {
    row('Taxable value', formatINR(d.taxablePaise));
    if (intra) { row('CGST', formatINR(d.cgstPaise)); row(d.stateTaxLabel || 'SGST', formatINR(d.sgstPaise)); }
    else row('IGST', formatINR(d.igstPaise));
    row('Credit total', formatINR(d.grandTotalPaise), { b: true, band: true });
    put(`Reason: ${d.reason || d.kind}`, M, top + 44, { size: 8, color: MUTED });
  }

  /* ---- declaration, terms, signature */
  let yb = Math.max(y, top + 70) + 8;
  if (d.priceMode === 'inclusive' && !isNote) { put('Prices shown to the customer are inclusive of GST.', M, yb, { size: 7.5, color: MUTED }); yb += 11; }
  if (s.template?.terms) yb = block(s.template.terms, M, yb, CW * 0.5, { size: 7.5, color: MUTED });
  const sigX = W - M - 170;
  put(`For: ${s.tradeName || s.legalName}`, sigX, yb, { w: 170, align: 'center' });
  if (s.template?.showSignature !== false) {
    rule(yb + 56, INK, sigX + 15, sigX + 155, 0.6);
    put(s.template?.signatureText || 'Authorized Signatory', sigX, yb + 61, { f: 'b', w: 170, align: 'center' });
  }
  const fn = [s.template?.footerNote, 'This is a computer generated document.'].filter(Boolean).join('  ');
  put(fn, M, H - 36, { size: 7, color: MUTED, align: 'center', w: CW });

  /* ---- status stamp / watermark */
  const stamp = cancelled ? 'CANCELLED' : watermark;
  if (stamp) {
    pdf.save().rotate(-30, { origin: [W / 2, H / 2] }).opacity(0.1);
    put(stamp, 60, H / 2 - 30, { f: 'b', size: stamp.length > 12 ? 40 : 90, color: '#b00020', align: 'center', w: W - 120 });
    pdf.restore();
  }
}

/** Shapes a DB invoice row into the document the renderer reads. */
export function invoiceDoc(inv) {
  return {
    kind: 'invoice', title: `Tax Invoice ${inv.invoice_no}`, number: inv.invoice_no, orderId: inv.order_id,
    issuedAt: inv.issued_at, status: inv.status, supplier: inv.supplier, customer: inv.customer, lines: inv.lines,
    totals: inv.totals, taxType: inv.tax_type, placeOfSupply: inv.place_of_supply, reverseCharge: inv.reverse_charge,
    priceMode: inv.price_mode, stateTaxLabel: stateByCode(inv.place_of_supply)?.ut ? 'UTGST' : 'SGST',
  };
}

export function creditNoteDoc(note, inv) {
  return {
    kind: 'credit_note', title: `Credit Note ${note.note_no}`, number: note.note_no, invoiceNo: inv.invoice_no,
    orderId: inv.order_id, issuedAt: note.issued_at, status: 'issued', supplier: inv.supplier, customer: inv.customer,
    lines: note.lines.map((l) => ({ ...l, qty: '', unitPaise: null })), totals: {},
    taxablePaise: Number(note.taxable_paise), cgstPaise: Number(note.cgst_paise), sgstPaise: Number(note.sgst_paise),
    igstPaise: Number(note.igst_paise), grandTotalPaise: Number(note.grand_total_paise),
    taxType: inv.tax_type, placeOfSupply: inv.place_of_supply, reverseCharge: inv.reverse_charge,
    reason: note.reason, stateTaxLabel: stateByCode(inv.place_of_supply)?.ut ? 'UTGST' : 'SGST',
  };
}

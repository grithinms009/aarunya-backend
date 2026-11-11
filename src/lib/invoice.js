/* Tax invoices and credit notes.

   - Numbers come from invoice_sequence with one UPSERT per document: the row lock serialises
     concurrent issuers, and a rolled-back transaction rolls the counter back too, so the
     series has no gaps and no duplicates. A cancelled invoice keeps its number for good.
   - An invoice is a frozen snapshot (supplier, customer, lines, HSN, rates, tax). The
     database trigger in migration 001 refuses edits and deletes, so a later change to a
     product or to the GST settings can never alter an issued invoice.
   - Invoices are issued by the caller, inside the caller's transaction, at the legal moment:
     for goods that move, at or before removal (dispatch) — CGST Act s.31(1). */
import { ruleError, notFound } from './errors.js';
import { financialYear, determinePlaceOfSupply, resolveState, stateByCode, divRound, allocate, computeTax, toPaise } from './gst.js';
import { getGst, invoicingStatus } from './gstSettings.js';
import { buildOrderTax } from './orderTax.js';

export const docNo = (prefix, fy, seq, series = 'INV') =>
  `${prefix}${series === 'CN' ? 'C' : series === 'DN' ? 'D' : ''}/${fy}/${String(seq).padStart(4, '0')}`;

/** Next number for a series in a financial year. Must run inside a transaction. */
export async function nextDocSeq(c, series, fy) {
  const { rows } = await c.query(
    `INSERT INTO invoice_sequence (series, fy, last_no) VALUES ($1,$2,1)
     ON CONFLICT (series, fy) DO UPDATE SET last_no = invoice_sequence.last_no + 1
     RETURNING last_no`, [series, fy]);
  const n = rows[0].last_no;
  if (n > 99999) throw ruleError('The invoice series for this financial year is full');
  return n;
}

const audit = (c, invoiceId, event, actor, detail = {}) =>
  c.query(`INSERT INTO invoice_event (invoice_id, event, actor, detail) VALUES ($1,$2,$3,$4)`,
    [invoiceId, event, actor, JSON.stringify(detail)]);

export async function liveInvoiceFor(c, orderId) {
  const { rows } = await c.query(`SELECT * FROM invoice WHERE order_id = $1 AND status = 'issued'`, [orderId]);
  return rows[0] ?? null;
}

/** Does this order owe an invoice at dispatch? Pre-GST orders are left alone. */
export const owesInvoiceAtDispatch = (o) => o.gst_applied || o.tax_issues != null;

async function loadClassifiedItems(c, orderId) {
  const { rows } = await c.query(
    `SELECT i.*, p.hsn_code AS p_hsn, p.gst_rate_bp AS p_rate, p.hsn_status AS p_status
       FROM order_item i LEFT JOIN product p ON p.id = i.product_id
      WHERE i.order_id = $1 ORDER BY i.sort_order, i.id`, [orderId]);
  return rows;
}

/**
 * Issues the tax invoice for an order. Idempotent: returns the live invoice if there is one.
 * @param opts.actor   who triggered it (email or 'system')
 * @param opts.manual  admin pressed "Generate invoice" — allowed for pre-GST orders
 */
export async function issueInvoice(c, orderId, { actor = 'system', manual = false } = {}) {
  const { rows } = await c.query(`SELECT * FROM "order" WHERE id = $1 FOR UPDATE`, [orderId]);
  const o = rows[0];
  if (!o) throw notFound('That order no longer exists');

  const existing = await liveInvoiceFor(c, orderId);
  if (existing) return { invoice: existing, created: false };

  const gst = await getGst(c);
  const st = invoicingStatus(gst);
  if (!st.active) throw ruleError(`GST invoicing is not active yet. ${st.problems[0]}`);
  if (o.status === 'cancelled') throw ruleError('A cancelled order cannot be invoiced');
  if (!['paid', 'partial'].includes(o.pay_status) && !(o.paid_paise > 0)) {
    throw ruleError('A tax invoice is issued once payment is received');
  }

  const items = await loadClassifiedItems(c, orderId);
  let breakup = o.gst_applied ? o.tax_breakup : null;
  let legacy = false;

  if (breakup) {
    if (breakup.supplierStateCode !== gst.stateCode) {
      throw ruleError('The business state changed after this order was placed. Review the order with your CA.');
    }
  } else {
    /* Placed before GST was active, or while a product was unclassified: tax it now from the
       current verified classification, treating the amount the customer actually paid as
       GST-inclusive. The order's own totals are never touched. */
    legacy = true;
    const lines = items.map((i) => ({
      pid: i.product_id, name: i.name, sku: i.sku, qty: i.qty, priceRupees: i.price,
      hsn: i.p_hsn ?? '', gstRateBp: i.p_rate, hsnStatus: i.p_status ?? 'unverified',
    }));
    const t = buildOrderTax({
      gst, lines, deliveryState: o.state || (o.channel === 'offline' ? stateByCode(gst.stateCode).name : ''),
      billingState: o.bill_state || o.state,
      discountRupees: o.discount, shippingRupees: o.shipping, giftFeeRupees: o.gift_fee, forceInclusive: true,
    });
    if (!t.applied) {
      const why = t.issues.map((i) => (i.name ? `${i.name}: ${i.problem}` : i.problem)).join('; ');
      throw ruleError(`Cannot issue the invoice yet — ${why}`);
    }
    if (t.result.totals.grandTotal !== o.total * 100) {
      throw ruleError('The recalculated total does not match what the customer paid. Review with your CA.');
    }
    breakup = {
      supplierStateCode: gst.stateCode,
      pos: { code: t.pos.pos.code, name: t.pos.pos.name }, stateTaxLabel: t.pos.stateTaxLabel,
      result: t.result,
    };
  }
  if (!o.gst_applied && !manual && !owesInvoiceAtDispatch(o)) {
    throw ruleError('This order pre-dates GST invoicing. Generate its invoice manually from the Invoices screen.');
  }

  const r = breakup.result;
  const goods = r.lines.filter((l) => l.kind === 'goods');
  if (goods.length !== items.length) throw ruleError('The order items changed after the tax was calculated');

  const lines = r.lines.map((l, idx) => {
    const it = l.kind === 'goods' ? items[Number(l.key)] : null;
    return {
      idx, kind: l.kind,
      sku: it?.sku ?? '',
      name: it ? (it.color_key ? `${it.name} (${it.color_key})` : it.name) : l.label,
      hsn: it ? (it.hsn_code || it.p_hsn || l.hsn || '') : '',
      uom: it ? 'NOS' : '',
      qty: l.qty, unitPaise: l.unitPaise,
      discountPaise: (l.itemDiscountPaise ?? 0) + (l.orderDiscountPaise ?? 0),
      taxablePaise: l.taxable, rateBp: l.rateBp,
      cgstPaise: l.cgst, sgstPaise: l.sgst, igstPaise: l.igst, totalPaise: l.total,
    };
  });
  if (lines.some((l) => l.kind === 'goods' && !/^\d{4,8}$/.test(l.hsn))) {
    throw ruleError('A line has no HSN code, so no tax invoice can be issued');
  }

  const billState = resolveState(o.bill_state || o.state);
  const shipState = resolveState(o.state) ?? billState;
  const addr = (a, city, state, pin) => ({
    address: a, city, state: state?.name ?? '', stateCode: state?.code ?? '', pin,
  });
  const customer = {
    name: o.cust_name, phone: o.cust_phone, email: o.cust_email,
    billing: {
      name: o.bill_name || o.cust_name, gstin: o.bill_gstin || '',
      ...addr(o.bill_address || o.address, o.bill_city || o.city, billState, o.bill_pin || o.pin),
    },
    shipping: { name: o.cust_name, ...addr(o.address, o.city, shipState, o.pin) },
  };
  const supplier = {
    legalName: gst.legalName, tradeName: gst.tradeName, gstin: gst.gstin,
    address: gst.address, stateCode: gst.stateCode, state: stateByCode(gst.stateCode).name,
    phone: gst.phone, email: gst.email, template: gst.template,
  };

  const { fy } = financialYear(new Date());
  const seq = await nextDocSeq(c, 'INV', fy);
  const invoiceNo = docNo(gst.invoicePrefix, fy, seq);
  const t = r.totals;
  const received = Math.min(t.grandTotal, o.paid_paise > 0 ? Number(o.paid_paise) : o.total * 100);
  const totals = { ...t, receivedPaise: received, balancePaise: t.grandTotal - received };

  const ins = await c.query(
    `INSERT INTO invoice (invoice_no, fy, seq, order_id, place_of_supply, tax_type, reverse_charge, price_mode,
       supplier, customer, lines, totals, taxable_paise, cgst_paise, sgst_paise, igst_paise, tax_paise,
       round_off_paise, grand_total_paise, received_paise, legacy, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
    [invoiceNo, fy, seq, orderId, breakup.pos.code, r.taxType, gst.reverseCharge, r.mode,
     JSON.stringify(supplier), JSON.stringify(customer), JSON.stringify(lines), JSON.stringify(totals),
     t.taxable, t.cgst, t.sgst, t.igst, t.tax, t.roundOff, t.grandTotal, received, legacy, actor]);
  const inv = ins.rows[0];
  await audit(c, inv.id, 'issued', actor, { invoiceNo, orderId, legacy, grandTotalPaise: t.grandTotal });
  await c.query(`INSERT INTO order_history (order_id, status, note) VALUES ($1,$2,$3)`,
    [orderId, o.status, `Tax invoice ${invoiceNo} issued`]);
  return { invoice: inv, created: true };
}

/* ------------------------------------------------------------------ credit notes */

/** What each invoice line has already been credited, summed over existing credit notes. */
async function creditedByLine(c, invoiceId) {
  const { rows } = await c.query(`SELECT lines FROM credit_note WHERE invoice_id = $1`, [invoiceId]);
  const sum = new Map();
  for (const r of rows) for (const l of r.lines) {
    const s = sum.get(l.idx) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
    s.taxable += l.taxablePaise; s.cgst += l.cgstPaise; s.sgst += l.sgstPaise; s.igst += l.igstPaise; s.total += l.totalPaise;
    sum.set(l.idx, s);
  }
  return sum;
}

/**
 * Issues a credit note against an invoice. Run inside a transaction.
 * kind 'cancellation' credits everything still outstanding and cancels the invoice.
 * kind 'refund'/'correction' credits `amountPaise` (GST-inclusive value, as refunded to the
 * customer), taking `sku`'s line first, then spreading any excess over the remaining lines.
 */
export async function issueCreditNote(c, invoiceId, { kind, reason = '', amountPaise, sku, actor = 'system', returnId = null }) {
  const { rows } = await c.query(`SELECT * FROM invoice WHERE id = $1 FOR UPDATE`, [invoiceId]);
  const inv = rows[0];
  if (!inv) throw notFound('Invoice not found');
  if (inv.status === 'cancelled') throw ruleError('This invoice is already cancelled');
  if (!reason.trim() && kind !== 'refund') throw ruleError('Give a reason');

  const credited = await creditedByLine(c, invoiceId);
  const remain = inv.lines.map((l) => {
    const s = credited.get(l.idx) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
    return {
      line: l, taxable: l.taxablePaise - s.taxable, cgst: l.cgstPaise - s.cgst, sgst: l.sgstPaise - s.sgst,
      igst: l.igstPaise - s.igst, total: l.totalPaise - s.total,
    };
  });

  let take; // per-line {taxable,cgst,sgst,igst,total} to credit
  if (kind === 'cancellation') {
    take = remain.map((r) => ({ taxable: r.taxable, cgst: r.cgst, sgst: r.sgst, igst: r.igst, total: r.total }));
  } else {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw ruleError('Enter the amount to credit');
    const left = remain.reduce((t, r) => t + r.total, 0);
    if (amountPaise > left) throw ruleError('That is more than is left to credit on this invoice');
    /* matched goods line first, then the rest in proportion to what remains */
    const amounts = remain.map(() => 0);
    let rest = amountPaise;
    const m = sku ? remain.findIndex((r) => r.line.kind === 'goods' && r.line.sku === sku) : -1;
    if (m >= 0) { amounts[m] = Math.min(rest, remain[m].total); rest -= amounts[m]; }
    if (rest > 0) {
      const w = remain.map((r, i) => (i === m ? 0 : r.total - amounts[i]));
      const parts = allocate(rest, w).map((p, i) => Math.min(p, w[i]));
      parts.forEach((p, i) => { amounts[i] += p; });
      rest -= parts.reduce((a, b) => a + b, 0);
      for (let i = 0; rest > 0 && i < amounts.length; i++) { // clamp spill
        const room = remain[i].total - amounts[i]; const d = Math.min(room, rest); amounts[i] += d; rest -= d;
      }
    }
    take = remain.map((r, i) => {
      const a = amounts[i];
      if (a === 0) return { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
      if (a === r.total) return { taxable: r.taxable, cgst: r.cgst, sgst: r.sgst, igst: r.igst, total: r.total };
      /* inclusive split at the line's own rate, so the credit reverses exactly the tax charged */
      const taxable = Math.min(r.taxable, divRound(a * 10000, 10000 + r.line.rateBp));
      const tax = a - taxable;
      if (inv.tax_type === 'intra') {
        const cg = Math.ceil(tax / 2);
        return { taxable, cgst: cg, sgst: tax - cg, igst: 0, total: a };
      }
      return { taxable, cgst: 0, sgst: 0, igst: tax, total: a };
    });
  }

  const noteLines = remain
    .map((r, i) => ({ r, t: take[i] }))
    .filter(({ t }) => t.total > 0)
    .map(({ r, t }) => ({
      idx: r.line.idx, kind: r.line.kind, sku: r.line.sku, name: r.line.name, hsn: r.line.hsn, rateBp: r.line.rateBp,
      taxablePaise: t.taxable, cgstPaise: t.cgst, sgstPaise: t.sgst, igstPaise: t.igst, totalPaise: t.total,
    }));
  if (!noteLines.length) throw ruleError('Nothing is left to credit on this invoice');
  const sum = (f) => noteLines.reduce((a, l) => a + f(l), 0);
  const total = sum((l) => l.totalPaise);

  const gst = await getGst(c);
  const { fy } = financialYear(new Date());
  const seq = await nextDocSeq(c, 'CN', fy);
  const noteNo = docNo(gst.invoicePrefix, fy, seq, 'CN');
  const ins = await c.query(
    `INSERT INTO credit_note (note_no, fy, seq, invoice_id, kind, reason, lines, taxable_paise, cgst_paise,
       sgst_paise, igst_paise, grand_total_paise, return_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [noteNo, fy, seq, invoiceId, kind, reason, JSON.stringify(noteLines), sum((l) => l.taxablePaise),
     sum((l) => l.cgstPaise), sum((l) => l.sgstPaise), sum((l) => l.igstPaise), total, returnId, actor]);

  let cancelled = false;
  if (kind === 'cancellation') {
    await c.query(`UPDATE invoice SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2 WHERE id = $1`,
      [invoiceId, reason]);
    cancelled = true;
  }
  await audit(c, invoiceId, kind === 'cancellation' ? 'cancelled' : 'credit_note', actor,
    { noteNo, kind, reason, totalPaise: total, returnId });
  return { note: ins.rows[0], cancelled };
}

/** Cancels the live invoice of an order (if any) with a full credit note. */
export async function cancelInvoiceForOrder(c, orderId, reason, actor) {
  const inv = await liveInvoiceFor(c, orderId);
  if (!inv) return null;
  const { note } = await issueCreditNote(c, inv.id, { kind: 'cancellation', reason, actor });
  return note;
}

/** Credit note for a refund against an order's live invoice, if there is one. */
export async function creditRefundForOrder(c, orderId, { amountPaise, sku, reason, returnId, actor }) {
  const inv = await liveInvoiceFor(c, orderId);
  if (!inv) return null;
  const { rows } = await c.query(
    `SELECT COALESCE(sum(grand_total_paise),0)::bigint AS s FROM credit_note WHERE invoice_id = $1`, [inv.id]);
  const left = Number(inv.grand_total_paise) - Number(rows[0].s);
  if (left <= 0) return null;
  const { note } = await issueCreditNote(c, inv.id, {
    kind: 'refund', reason, amountPaise: Math.min(amountPaise, left), sku, actor, returnId });
  return note;
}

export { computeTax, determinePlaceOfSupply, toPaise };

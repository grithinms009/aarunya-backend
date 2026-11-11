/* GST & invoice administration. Mounted under /api/admin, so every route here already
   requires a signed-in admin (requireRole('admin')) and a CSRF token on writes. */
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { getGst, GST_KEY, invoicingStatus, PREFIX_RE } from '../lib/gstSettings.js';
import { STATES, stateByCode, validateGstin, financialYear } from '../lib/gst.js';
import { classificationIssue, HSN_RE } from '../lib/orderTax.js';
import { issueCreditNote, issueInvoice, liveInvoiceFor } from '../lib/invoice.js';
import { creditNoteDoc, invoiceDoc, renderDocument } from '../lib/invoicePdf.js';
import { badRequest, notFound, ruleError, validation, wrap } from '../lib/errors.js';
import { parseBody, parseQuery } from '../middleware/validate.js';

export const router = Router();
const actor = (req) => req.user?.email ?? 'admin';

/* ---------------------------------------------------------------- settings */

const view = (g) => ({ settings: g, status: invoicingStatus(g), states: STATES.map(({ code, name }) => ({ code, name })) });

router.get('/settings', wrap(async (_req, res) => res.json(view(await getGst()))));

const settingsIn = z.object({
  registered: z.boolean(),
  gstin: z.string().trim().toUpperCase().max(15),
  legalName: z.string().trim().max(200),
  tradeName: z.string().trim().max(200),
  address: z.object({
    line1: z.string().trim().max(200), line2: z.string().trim().max(200),
    city: z.string().trim().max(100), pin: z.string().trim().max(6),
  }),
  stateCode: z.string().trim().max(2),
  phone: z.string().trim().max(20),
  email: z.string().trim().max(200),
  invoicePrefix: z.string().trim().toUpperCase().max(8),
  priceMode: z.enum(['inclusive', 'exclusive']),
  rounding: z.enum(['line', 'invoice']),
  roundOffToRupee: z.boolean(),
  reverseCharge: z.boolean(),
  template: z.object({
    terms: z.string().max(1000), footerNote: z.string().max(300),
    signatureText: z.string().max(60), showSignature: z.boolean(),
  }),
});

router.put('/settings', parseBody(settingsIn), wrap(async (req, res) => {
  const b = req.body;
  const fields = {};
  if (b.gstin) {
    const v = validateGstin(b.gstin);
    if (!v.ok) fields.gstin = `Not a valid GSTIN (${v.reason})`;
    else if (v.stateCode !== b.stateCode) fields.stateCode = 'The state must match the first two digits of the GSTIN';
  }
  if (!stateByCode(b.stateCode)) fields.stateCode = 'Choose a state';
  if (!PREFIX_RE.test(b.invoicePrefix)) fields.invoicePrefix = '1–4 capital letters, digits or hyphens';
  if (b.address.pin && !/^[1-9]\d{5}$/.test(b.address.pin)) fields['address.pin'] = 'Enter a 6-digit PIN';
  if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) fields.email = 'Enter a valid email';
  if (Object.keys(fields).length) throw validation(fields);

  const saved = await tx(async (c) => {
    const { rows: [r] } = await c.query(`SELECT value FROM setting WHERE key = $1 FOR UPDATE`, [GST_KEY]);
    const cur = await getGst(c);
    /* Any change to identity / numbering / tax treatment voids the verification: someone must
       re-confirm against the portal. (Layout and wording changes do not.) */
    const identity = (g) => JSON.stringify([g.registered, g.gstin, g.legalName, g.tradeName, g.address, g.stateCode]);
    const changed = identity(cur) !== identity(b);
    if (b.invoicePrefix !== cur.invoicePrefix) {
      const { rows } = await c.query(`SELECT 1 FROM invoice LIMIT 1`);
      if (rows.length) throw ruleError('The invoice prefix cannot change once invoices have been issued');
    }
    if (b.priceMode === 'exclusive' && !b.roundOffToRupee) b.roundOffToRupee = true;
    const next = { ...cur, ...b, verified: changed ? false : cur.verified,
      verifiedAt: changed ? null : cur.verifiedAt, verifiedBy: changed ? '' : cur.verifiedBy };
    await c.query(
      `INSERT INTO setting (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [GST_KEY, JSON.stringify(next)]);
    void r;
    return next;
  });
  res.json(view(saved));
}));

/** The admin attests, after checking the GSTIN on services.gst.gov.in, that it is active and
 *  that legal name, trade name, state and address match the portal record. */
router.post('/settings/verify', parseBody(z.object({
  confirm: z.literal(true),
  note: z.string().trim().min(5, 'Say where and when you checked it').max(500),
})), wrap(async (req, res) => {
  const saved = await tx(async (c) => {
    const g = await getGst(c);
    const probe = invoicingStatus({ ...g, verified: true });
    if (!probe.active) throw ruleError(probe.problems[0]);
    const next = { ...g, verified: true, verifiedAt: new Date().toISOString(), verifiedBy: actor(req),
      verificationNote: req.body.note };
    await c.query(`UPDATE setting SET value = $2 WHERE key = $1`, [GST_KEY, JSON.stringify(next)]);
    return next;
  });
  res.json(view(saved));
}));

router.post('/settings/unverify', wrap(async (_req, res) => {
  const g = await getGst();
  const next = { ...g, verified: false, verifiedAt: null, verifiedBy: '' };
  await query(`UPDATE setting SET value = $2 WHERE key = $1`, [GST_KEY, JSON.stringify(next)]);
  res.json(view(next));
}));

/* ---------------------------------------------------------------- product classification */

const productRow = (p) => {
  const issue = classificationIssue({ hsn: p.hsn_code, gstRateBp: p.gst_rate_bp, hsnStatus: p.hsn_status });
  return {
    id: p.id, name: p.name, category: p.category_slug, material: p.material, description: p.description,
    price: p.price, hsn: p.hsn_code, gstRateBp: p.gst_rate_bp, status: p.hsn_status, note: p.tax_note,
    verifiedAt: p.hsn_verified_at, verifiedBy: p.hsn_verified_by, issue,
    stock: p.stock ?? 0,
  };
};

router.get('/products', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT p.*, COALESCE((SELECT sum(stock) FROM variant v WHERE v.product_id = p.id),0)::int AS stock
       FROM product p ORDER BY p.category_slug, p.name`);
  const items = rows.map(productRow);
  res.json({
    items,
    summary: { total: items.length, needsAttention: items.filter((i) => i.issue).length },
    /* Rates the tariff currently lists for the two jewellery headings. Not a classification:
       the product's material decides which heading applies. */
    reference: [
      { hsn: '7113', rateBp: 300, desc: 'Articles of jewellery of precious metal or metal clad with precious metal' },
      { hsn: '7117', rateBp: 300, desc: 'Imitation jewellery' },
    ],
  });
}));

const classIn = z.object({
  hsn: z.string().trim().max(8),
  gstRateBp: z.coerce.number().int().min(0).max(4000).nullable(),
  verified: z.boolean(),
  note: z.string().trim().max(500).default(''),
});

function checkClass(b) {
  const fields = {};
  if (b.hsn && !HSN_RE.test(b.hsn)) fields.hsn = 'HSN must be 4, 6 or 8 digits';
  if (b.verified && !b.hsn) fields.hsn = 'Enter the HSN code before verifying';
  if (b.verified && b.gstRateBp == null) fields.gstRateBp = 'Enter the GST rate before verifying';
  if (Object.keys(fields).length) throw validation(fields);
}

router.put('/products/:id', parseBody(classIn), wrap(async (req, res) => {
  checkClass(req.body);
  const b = req.body;
  const { rows } = await query(
    `UPDATE product SET hsn_code = $2, gst_rate_bp = $3, hsn_status = $4, tax_note = $5,
       hsn_verified_at = CASE WHEN $4 = 'verified' THEN now() END,
       hsn_verified_by = CASE WHEN $4 = 'verified' THEN $6 ELSE '' END
     WHERE id = $1 RETURNING *`,
    [req.params.id, b.hsn, b.gstRateBp, b.verified ? 'verified' : 'unverified', b.note, actor(req)]);
  if (!rows[0]) throw notFound('That product no longer exists');
  res.json(productRow(rows[0]));
}));

/** Bulk assignment. Two-step: send without `confirm` to preview the count, then repeat with
 *  `confirm: true` and the same `expectedCount`. Existing prices, SKUs, stock are untouched. */
router.post('/products/bulk', parseBody(z.object({
  ids: z.array(z.string().max(120)).max(500).optional(),
  category: z.string().max(100).optional(),
  hsn: z.string().trim().max(8),
  gstRateBp: z.coerce.number().int().min(0).max(4000),
  verified: z.boolean().default(false),
  confirm: z.boolean().default(false),
  expectedCount: z.number().int().optional(),
})), wrap(async (req, res) => {
  const b = req.body;
  checkClass({ ...b });
  if (!b.ids?.length && !b.category) throw badRequest('Choose products or a category');
  const where = b.ids?.length ? `id = ANY($1)` : `category_slug = $1`;
  const { rows } = await query(`SELECT id, name FROM product WHERE ${where}`, [b.ids?.length ? b.ids : b.category]);
  if (!b.confirm) {
    return res.json({ preview: true, count: rows.length, products: rows.slice(0, 50).map((r) => r.name) });
  }
  if (b.expectedCount !== rows.length) throw ruleError(`The selection changed (${rows.length} products now). Preview again.`);
  await query(
    `UPDATE product SET hsn_code = $2, gst_rate_bp = $3, hsn_status = $4, hsn_verified_at = CASE WHEN $4 = 'verified' THEN now() END,
       hsn_verified_by = CASE WHEN $4 = 'verified' THEN $5 ELSE '' END
     WHERE id = ANY($1)`,
    [rows.map((r) => r.id), b.hsn, b.gstRateBp, b.verified ? 'verified' : 'unverified', actor(req)]);
  res.json({ preview: false, updated: rows.length });
}));

/* ---------------------------------------------------------------- invoices */

const listQ = z.object({
  q: z.string().max(100).optional(),           // invoice no / order no / customer
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  status: z.enum(['', 'issued', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const invoiceRow = (r) => ({
  id: r.id, invoiceNo: r.invoice_no, orderId: r.order_id, status: r.status, issuedAt: r.issued_at,
  customer: r.customer.billing.name || r.customer.name, phone: r.customer.phone,
  placeOfSupply: r.place_of_supply, placeOfSupplyName: stateByCode(r.place_of_supply)?.name ?? '',
  taxType: r.tax_type, taxTypeLabel: r.tax_type === 'intra' ? 'CGST + SGST' : 'IGST',
  taxablePaise: r.taxable_paise, taxPaise: r.tax_paise, cgstPaise: r.cgst_paise, sgstPaise: r.sgst_paise,
  igstPaise: r.igst_paise, grandTotalPaise: r.grand_total_paise, receivedPaise: r.received_paise,
  payStatus: r.pay_status, legacy: r.legacy, creditedPaise: Number(r.credited_paise ?? 0),
  creditNotes: r.credit_notes ?? [],
});

router.get('/invoices', parseQuery(listQ), wrap(async (req, res) => {
  const q = req.valid;
  const params = [];
  const where = [];
  if (q.q) {
    params.push(`%${q.q}%`);
    where.push(`(i.invoice_no ILIKE $${params.length} OR i.order_id ILIKE $${params.length}
      OR i.customer->>'name' ILIKE $${params.length} OR i.customer->'billing'->>'name' ILIKE $${params.length}
      OR i.customer->>'phone' ILIKE $${params.length})`);
  }
  if (q.from) { params.push(`${q.from}T00:00:00+05:30`); where.push(`i.issued_at >= $${params.length}`); }
  if (q.to) { params.push(`${q.to}T23:59:59+05:30`); where.push(`i.issued_at <= $${params.length}`); }
  if (q.status) { params.push(q.status); where.push(`i.status = $${params.length}`); }
  params.push(q.limit);
  const { rows } = await query(
    `SELECT i.*, o.pay_status,
       COALESCE((SELECT sum(grand_total_paise) FROM credit_note n WHERE n.invoice_id = i.id),0)::bigint AS credited_paise,
       COALESCE((SELECT json_agg(json_build_object('id', n.id, 'noteNo', n.note_no, 'kind', n.kind,
          'issuedAt', n.issued_at, 'totalPaise', n.grand_total_paise, 'reason', n.reason) ORDER BY n.id)
          FROM credit_note n WHERE n.invoice_id = i.id), '[]'::json) AS credit_notes
     FROM invoice i JOIN "order" o ON o.id = i.order_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY i.issued_at DESC, i.id DESC LIMIT $${params.length}`, params);
  const live = rows.filter((r) => r.status === 'issued');
  res.json({
    rows: rows.map(invoiceRow),
    summary: {
      count: rows.length,
      taxablePaise: live.reduce((t, r) => t + r.taxable_paise, 0),
      taxPaise: live.reduce((t, r) => t + r.tax_paise, 0),
      grandTotalPaise: live.reduce((t, r) => t + r.grand_total_paise, 0),
    },
  });
}));

async function loadInvoice(id) {
  const { rows } = await query(`SELECT * FROM invoice WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound('Invoice not found');
  return rows[0];
}

router.get('/invoices/:id', wrap(async (req, res) => {
  const inv = await loadInvoice(req.params.id);
  const { rows: notes } = await query(`SELECT * FROM credit_note WHERE invoice_id = $1 ORDER BY id`, [inv.id]);
  const { rows: events } = await query(`SELECT * FROM invoice_event WHERE invoice_id = $1 ORDER BY id`, [inv.id]);
  res.json({
    invoice: { id: inv.id, invoiceNo: inv.invoice_no, orderId: inv.order_id, status: inv.status, issuedAt: inv.issued_at,
      placeOfSupply: inv.place_of_supply, taxType: inv.tax_type, priceMode: inv.price_mode, reverseCharge: inv.reverse_charge,
      supplier: inv.supplier, customer: inv.customer, lines: inv.lines, totals: inv.totals, legacy: inv.legacy,
      cancelledAt: inv.cancelled_at, cancelReason: inv.cancel_reason },
    creditNotes: notes.map((n) => ({ id: n.id, noteNo: n.note_no, kind: n.kind, reason: n.reason, issuedAt: n.issued_at,
      lines: n.lines, taxablePaise: n.taxable_paise, cgstPaise: n.cgst_paise, sgstPaise: n.sgst_paise,
      igstPaise: n.igst_paise, totalPaise: n.grand_total_paise, returnId: n.return_id })),
    events: events.map((e) => ({ event: e.event, actor: e.actor, detail: e.detail, at: e.at })),
  });
}));

const sendPdf = (res, buf, name) => {
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name.replace(/\//g, '-')}.pdf"`,
    'Cache-Control': 'private, no-store' });
  res.send(buf);
};

router.get('/invoices/:id/pdf', wrap(async (req, res) => {
  const inv = await loadInvoice(req.params.id);
  sendPdf(res, await renderDocument(invoiceDoc(inv)), inv.invoice_no);
}));

router.get('/credit-notes/:id/pdf', wrap(async (req, res) => {
  const { rows } = await query(`SELECT * FROM credit_note WHERE id = $1`, [req.params.id]);
  if (!rows[0]) throw notFound('Credit note not found');
  const inv = await loadInvoice(rows[0].invoice_id);
  sendPdf(res, await renderDocument(creditNoteDoc(rows[0], inv)), rows[0].note_no);
}));

/** Manual issue: for an order that pre-dates GST invoicing, or that was blocked at dispatch. */
router.post('/orders/:orderId/invoice', wrap(async (req, res) => {
  const out = await tx((c) => issueInvoice(c, req.params.orderId, { actor: actor(req), manual: true }));
  res.status(out.created ? 201 : 200).json(invoiceRow({ ...out.invoice, pay_status: 'paid' }));
}));

/** Which paid/dispatched orders are still without a tax invoice, and why. */
router.get('/pending', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT o.id, o.created_at, o.cust_name, o.total, o.status, o.gst_applied, o.tax_issues
       FROM "order" o
      WHERE o.status <> 'cancelled' AND o.pay_status IN ('paid','partial')
        AND NOT EXISTS (SELECT 1 FROM invoice i WHERE i.order_id = o.id AND i.status = 'issued')
      ORDER BY o.created_at DESC LIMIT 200`);
  res.json(rows.map((o) => ({ orderId: o.id, createdAt: o.created_at, customer: o.cust_name, total: o.total,
    status: o.status, owesInvoice: o.gst_applied || o.tax_issues != null, issues: o.tax_issues ?? [] })));
}));

const cnIn = z.object({
  kind: z.enum(['cancellation', 'refund', 'correction']),
  reason: z.string().trim().min(3, 'Give a reason').max(300),
  amount: z.coerce.number().positive().optional(),     // rupees, GST-inclusive, for refund/correction
  sku: z.string().max(60).optional(),
});

/** Cancels an invoice (full credit note) or credits part of it. The invoice is never edited. */
router.post('/invoices/:id/credit-notes', parseBody(cnIn), wrap(async (req, res) => {
  const b = req.body;
  if (b.kind !== 'cancellation' && !b.amount) throw badRequest('Enter the amount to credit');
  const out = await tx((c) => issueCreditNote(c, Number(req.params.id), {
    kind: b.kind, reason: b.reason, amountPaise: b.amount ? Math.round(b.amount * 100) : undefined, sku: b.sku, actor: actor(req) }));
  res.status(201).json({ noteNo: out.note.note_no, id: out.note.id, cancelled: out.cancelled });
}));

/* ---------------------------------------------------------------- numbering */

router.get('/sequence', wrap(async (_req, res) => {
  const { rows } = await query(`SELECT series, fy, last_no FROM invoice_sequence ORDER BY fy DESC, series`);
  res.json({ currentFy: financialYear().fy, sequences: rows.map((r) => ({ series: r.series, fy: r.fy, lastNo: r.last_no })) });
}));

/** Sets where this financial year's series continues from — for carrying on from invoices
 *  already issued elsewhere (the sample invoices were numbered 99 by another billing app). It
 *  can only move forward, so a number can never be reused. */
router.put('/sequence', parseBody(z.object({
  series: z.enum(['INV', 'CN']), lastNo: z.number().int().min(0).max(99998),
})), wrap(async (req, res) => {
  const { fy } = financialYear();
  const out = await tx(async (c) => {
    await c.query(`INSERT INTO invoice_sequence (series, fy, last_no) VALUES ($1,$2,0) ON CONFLICT DO NOTHING`, [req.body.series, fy]);
    const { rows } = await c.query(`SELECT last_no FROM invoice_sequence WHERE series = $1 AND fy = $2 FOR UPDATE`, [req.body.series, fy]);
    if (req.body.lastNo < rows[0].last_no) throw ruleError(`The series is already at ${rows[0].last_no}; it can only move forward`);
    await c.query(`UPDATE invoice_sequence SET last_no = $3 WHERE series = $1 AND fy = $2`, [req.body.series, fy, req.body.lastNo]);
    return req.body.lastNo;
  });
  res.json({ series: req.body.series, fy, lastNo: out });
}));

/* ---------------------------------------------------------------- compliance notes */

router.get('/compliance', wrap(async (_req, res) => res.json({
  verifiedOn: '2026-11-10',
  items: [
    { topic: 'E-invoicing (IRN / dynamic QR)', applicable: false,
      why: 'Mandatory only for registered persons whose aggregate turnover in any year since 2017-18 exceeds ₹5 crore (notification 10/2023-CT, in force from 1 Aug 2023). A one-person online jewellery shop is far below it, and B2C invoices are outside e-invoicing anyway. Not built; revisit if turnover approaches the threshold.' },
    { topic: 'E-way bill', applicable: 'conditional',
      why: 'Required when the consignment value exceeds ₹50,000 for movement of goods (Rule 138). Typical orders are far below this; an order above it needs an e-way bill before dispatch. Not auto-generated.' },
    { topic: 'Invoice timing', applicable: true,
      why: 'For goods that move, the tax invoice is issued at or before removal (CGST Act s.31(1)); the system issues it at dispatch, in the same step as marking the order shipped.' },
    { topic: 'Invoice number', applicable: true,
      why: 'Consecutive, unique per financial year, at most 16 characters of letters, digits, “-” and “/” (Rule 46(b)). Format: AJ/26-27/0001.' },
  ],
})));

/* Turns a priced cart/order into a GST breakup. The only caller-facing entry for tax maths:
   routes never compute tax themselves, they call this. */
import { computeTax, determinePlaceOfSupply, GstError, toPaise } from './gst.js';
import { invoicingStatus } from './gstSettings.js';

export const HSN_RE = /^\d{4}(\d{2}(\d{2})?)?$/;

/** A product can be taxed only after an admin verified its HSN and rate. */
export function classificationIssue(p) {
  if (!p.hsn || !HSN_RE.test(p.hsn)) return 'HSN code missing';
  if (p.gstRateBp == null) return 'GST rate missing';
  if (p.hsnStatus !== 'verified') return 'HSN/GST classification not yet verified by the business or CA';
  return null;
}

/**
 * @param lines  [{ pid, vid, name, sku, qty, priceRupees, hsn, gstRateBp, hsnStatus }]
 * @returns { applied:false, reason, issues? } | { applied:true, pos, result }
 */
export function buildOrderTax({
  gst, lines, deliveryState, billingState, thirdPartyDirection = false,
  discountRupees = 0, shippingRupees = 0, giftFeeRupees = 0, forceInclusive = false,
}) {
  const status = invoicingStatus(gst);
  if (!status.active) return { applied: false, reason: 'inactive', issues: status.problems.map((p) => ({ problem: p })) };

  const issues = lines
    .map((l) => ({ pid: l.pid, name: l.name, problem: classificationIssue(l) }))
    .filter((i) => i.problem);
  if (issues.length) return { applied: false, reason: 'unclassified', issues };

  const pos = determinePlaceOfSupply({
    supplierStateCode: gst.stateCode, delivery: deliveryState, billing: billingState, thirdPartyDirection,
  }); // throws GstError('place_of_supply') when the state is unknown

  const mode = forceInclusive ? 'inclusive' : gst.priceMode;
  const result = computeTax({
    taxType: pos.taxType,
    mode,
    rounding: gst.rounding,
    /* exclusive prices would otherwise leave paise in an INTEGER-rupee order total */
    roundOffToRupee: mode === 'exclusive' ? true : gst.roundOffToRupee,
    orderDiscountPaise: toPaise(discountRupees),
    lines: lines.map((l, i) => ({
      key: String(i), unitPaise: toPaise(l.priceRupees), qty: l.qty, rateBp: l.gstRateBp, hsn: l.hsn,
    })),
    charges: [
      { key: 'shipping', label: 'Shipping charges', amountPaise: toPaise(shippingRupees) },
      { key: 'gift', label: 'Gift wrap', amountPaise: toPaise(giftFeeRupees) },
    ],
  });
  return { applied: true, pos, result };
}

/** The slice of the engine output that is safe to send to the storefront. */
export function publicTax(t) {
  if (!t?.applied) return { applied: false };
  const r = t.result;
  return {
    applied: true,
    taxType: r.taxType,
    priceMode: r.mode,
    placeOfSupply: { code: t.pos.pos.code, name: t.pos.pos.name },
    stateTaxLabel: t.pos.stateTaxLabel,
    taxablePaise: r.totals.taxable,
    cgstPaise: r.totals.cgst,
    sgstPaise: r.totals.sgst,
    igstPaise: r.totals.igst,
    taxPaise: r.totals.tax,
    roundOffPaise: r.totals.roundOff,
    grandTotalPaise: r.totals.grandTotal,
  };
}

export { GstError };

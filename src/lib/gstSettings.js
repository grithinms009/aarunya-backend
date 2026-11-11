/* GST & invoice settings: one JSONB row (`setting.key = 'gst'`), read through this facade.

   Nothing here is invented. The supplier's legal name and registered address start empty and
   are filled from the GST registration certificate / portal record by an admin. Invoicing is
   switched on only when `invoicingStatus().active` is true, which needs the admin to record
   that the GSTIN has been verified on the official portal. */
import { query } from '../db/pool.js';
import { stateByCode, validateGstin } from './gst.js';

export const GST_KEY = 'gst';

export const DEFAULT_GST = {
  registered: false,
  verified: false,
  verifiedAt: null,
  verifiedBy: '',
  verificationNote: '',
  /* Candidate values read off the two sample invoices. NOT verified — `verified` stays false
     until an admin confirms them on the GST portal. */
  gstin: '32BTBPG5961M1ZK',
  legalName: '',
  tradeName: '',
  address: { line1: '', line2: '', city: '', pin: '' },
  stateCode: '32',
  phone: '9747738193',
  email: '',
  invoicePrefix: 'AJ',
  priceMode: 'inclusive',       // 'inclusive' | 'exclusive'
  rounding: 'line',             // 'line' | 'invoice'
  roundOffToRupee: false,
  reverseCharge: false,
  issueOn: 'dispatch',          // legal timing for goods that move: at/before removal
  template: { terms: '', footerNote: '', signatureText: 'Authorized Signatory', showSignature: true },
};

export async function getGst(client) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(`SELECT value FROM setting WHERE key = $1`, [GST_KEY]);
  const v = rows[0]?.value ?? {};
  return {
    ...DEFAULT_GST, ...v,
    address: { ...DEFAULT_GST.address, ...(v.address ?? {}) },
    template: { ...DEFAULT_GST.template, ...(v.template ?? {}) },
  };
}

/** Invoice number prefix: short enough that the longest document number stays within the
 *  16 characters Rule 46(b) allows ("<prefix>C/26-27/00001" for credit notes). */
export const PREFIX_RE = /^[A-Z0-9-]{1,4}$/;

/** What stops invoicing, in plain words. `active` only when this list is empty. */
export function invoicingStatus(g) {
  const problems = [];
  if (!g.registered) problems.push('Mark the business as GST-registered once the registration is confirmed.');
  const v = validateGstin(g.gstin);
  if (!v.ok) problems.push(`GSTIN is not valid (${v.reason}).`);
  else if (v.stateCode !== g.stateCode) problems.push('The first two digits of the GSTIN do not match the state code.');
  if (!stateByCode(g.stateCode)) problems.push('Choose the state of registration.');
  if (!g.legalName.trim()) problems.push('Enter the legal name exactly as on the GST registration.');
  if (!g.address.line1.trim() || !g.address.city.trim() || !/^[1-9]\d{5}$/.test(g.address.pin))
    problems.push('Enter the full registered address (street, city and 6-digit PIN) from the GST portal record.');
  if (!PREFIX_RE.test(g.invoicePrefix)) problems.push('The invoice prefix must be 1–4 letters, digits or hyphens.');
  if (!g.verified) problems.push('The GSTIN has not been verified on the GST portal. Verify it, then confirm here.');
  return { active: problems.length === 0, problems };
}


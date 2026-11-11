/* India Post PIN directory (src/data/pincodes.json, built from deploy/Pincodes.csv by
   scripts/build-pincodes.mjs). The PIN, not the free-text state, decides where goods are
   delivered, so it decides the place of supply and the shipping zone. */
import { createRequire } from 'node:module';
import { validation } from './errors.js';
import { resolveState, stateByCode } from './gst.js';

const require = createRequire(import.meta.url);
let DIR = null;
const dir = () => (DIR ??= require('../data/pincodes.json'));

/** → null when the directory has no such PIN. */
export function lookupPin(pin) {
  const e = dir()[String(pin ?? '').trim()];
  if (!e) return null;
  return { pin: String(pin).trim(), codes: e[0] ? e[0].split(',') : [], deliverable: e[1] === 1, district: e[2] };
}

/** States where couriers typically add a remote-area surcharge. Only used to pick a zone;
 *  the fee for it is whatever the owner sets (blank = the normal fee). */
export const REMOTE_STATE_CODES = new Set(['01', '38', '11', '12', '13', '14', '15', '16', '17', '18', '35', '31']);

export const zoneFor = (stateCode, supplierStateCode) =>
  stateCode === supplierStateCode ? 'home' : REMOTE_STATE_CODES.has(stateCode) ? 'remote' : 'rest';

/**
 * Works out the delivery state from the PIN and the state the shopper chose.
 * Never guesses: a PIN that contradicts the chosen state, or straddles states without the
 * choice settling it, is refused with a message the checkout shows next to the field.
 * @returns {{ state, pin: object|null, source: 'pin'|'customer', zone }}
 */
export function resolveDelivery({ pin, state, supplierStateCode, requirePin = false }) {
  const raw = String(pin ?? '').trim();
  const chosen = resolveState(state);
  if (!raw) {
    if (requirePin) throw validation({ pin: 'Enter your PIN code' }, 'Enter your PIN code');
    if (!chosen) return { state: null, pin: null, source: 'customer', zone: null };
    return { state: chosen, pin: null, source: 'customer', zone: zoneFor(chosen.code, supplierStateCode) };
  }
  const fail = (msg) => { throw validation({ pin: msg }, msg); };
  if (!/^[1-9]\d{5}$/.test(raw)) fail('Check the PIN code (6 digits)');
  const info = lookupPin(raw);
  if (!info) fail('We could not find that PIN code. Please check it.');
  if (!info.deliverable) fail('India Post has no delivery office for this PIN code, so we cannot deliver there.');

  let st;
  if (info.codes.length === 1) {
    st = stateByCode(info.codes[0]);
    if (chosen && chosen.code !== st.code) fail(`PIN ${raw} is in ${st.name}. Please change the state.`);
  } else if (info.codes.length > 1) {
    if (!chosen || !info.codes.includes(chosen.code)) {
      fail(`PIN ${raw} spans ${info.codes.map((c) => stateByCode(c).name).join(' and ')}. Choose the state of your address.`);
    }
    st = chosen;
  } else {
    if (!chosen) fail('Choose the state of your address.');
    st = chosen; // the directory has no state for this PIN; the shopper's choice stands
  }
  return { state: st, pin: info, source: info.codes.length === 1 ? 'pin' : 'customer', zone: zoneFor(st.code, supplierStateCode) };
}

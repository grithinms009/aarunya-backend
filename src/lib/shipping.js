/* Shipping charge for a delivery zone. SHIPPING_RATES = { home, rest, remote } (rupees);
   a blank / missing zone falls back to SHIPPING_FEE, so nothing changes until the owner
   sets a rate. The free-shipping threshold applies in every zone. */
import { num } from './format.js';

export function shippingFee(config, zone) {
  const r = config.SHIPPING_RATES?.[zone];
  return r === undefined || r === null || r === '' ? num(config.SHIPPING_FEE) : num(r);
}

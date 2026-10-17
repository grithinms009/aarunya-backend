/* Prepares an empty store.

   No products, categories, colours, orders, returns or home-page content are created:
   all of that is added through the admin panel, which is the only way it should ever
   arrive. What this does write is the two accounts and the store's default settings,
   because the app cannot run without somewhere to sign in and a shipping rule.

   Running it twice is safe: every table is cleared first. */
import 'dotenv/config';
import { pool, tx } from './pool.js';
import { hashPassword } from '../lib/password.js';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'veena@aarunyajewels.in';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'aarunya123';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Veena';
const USER_EMAIL = process.env.SEED_USER_EMAIL || 'user@aarunyajewels.in';
const USER_PASSWORD = process.env.SEED_USER_PASSWORD || 'user12345';

/* Cleared in dependency order. */
const TABLES = [
  'stock_ledger', 'return_history', 'return_request',
  'order_history', 'shipment', 'order_item', '"order"',
  'variant_image', 'variant', 'product_spec', 'product',
  'category_pairing', 'sub_category', 'category', 'color',
  'announcement', 'offer', 'banner', 'setting', 'contact_message',
  'password_reset_token', 'login_attempt', 'app_user',
];

/* The store's starting settings. Every one of these is editable on the Settings screen;
   they are here only so the first run has a working shipping rule and contact block. */
const DEFAULT_CONFIG = {
  WHATSAPP_NUMBER: '919747738193',
  WHATSAPP_TEXT: 'Hi Aarunya Jewels by Veena, I would like to know more about your jewellery.',
  INSTAGRAM_HANDLE: 'aarunyajewelsbyveena',
  EMAIL: 'Aarunyajewelsbyveena@gmail.com',
  FREE_SHIPPING_THRESHOLD: 499,
  SHIPPING_FEE: 60,
  GIFT_WRAP_FEE: 49,
  DISPATCH_CUTOFF_HOUR: 16,
  PAYMENT_PROVIDER: 'razorpay',
  HOME_STATE_PIN_PREFIXES: ['67', '68', '69'],
  DELIVERY_DAYS: { local: [2, 3], rest: [4, 7] },
  LOW_STOCK: 2,
  couriers: [
    { id: 'shiprocket', name: 'Shiprocket', url: 'https://shiprocket.co/tracking/{awb}' },
    { id: 'delhivery', name: 'Delhivery', url: 'https://www.delhivery.com/track/package/{awb}' },
    { id: 'dtdc', name: 'DTDC', url: 'https://www.dtdc.in/tracking.asp?awb={awb}' },
    { id: 'indiapost', name: 'India Post (Speed Post)', url: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?awb={awb}' },
  ],
  defaultCourier: 'shiprocket',
  notifyOnShip: true,
  shipMsg: 'Hi {name}, your Aarunya order {order} has shipped. Track it here: {link}',
  returnWindow: 3,
  nonEligible: [],
  requireVideo: true,
  allowRefund: true,
  locations: ['Home studio, Thrissur', 'Exhibition / pop-up', 'Customer visit'],
};

async function main() {
  await tx(async (c) => {
    await c.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);

    await c.query(
      `INSERT INTO app_user (email, name, password_hash, role) VALUES ($1,$2,$3,'admin')`,
      [ADMIN_EMAIL.toLowerCase(), ADMIN_NAME, await hashPassword(ADMIN_PASSWORD)],
    );
    await c.query(
      `INSERT INTO app_user (email, name, password_hash, role) VALUES ($1,$2,$3,'user')`,
      [USER_EMAIL.toLowerCase(), 'Aarunya Customer', await hashPassword(USER_PASSWORD)],
    );

    /* The banner row is a singleton the Banners screen edits in place, so it has to
       exist; every field starts blank. */
    await c.query(`INSERT INTO banner (id) VALUES (1)`);

    await c.query(
      `INSERT INTO setting (key, value) VALUES ('config', $1)`,
      [JSON.stringify(DEFAULT_CONFIG)],
    );
  });

  console.log('store prepared — no catalogue, ready to fill from the admin panel');
  console.log(`  admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  user  login: ${USER_EMAIL} / ${USER_PASSWORD}`);
  console.log('  next: Settings → add colours, Categories → add a category, then Products');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

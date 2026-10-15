/* The demo dataset: catalogue, orders, returns and the stock ledger.

   Ported from the admin prototype's design handoff. Bundled into src/db/seed-source.mjs by
   scripts/gen-seed.sh, which is what db:seed loads. Dates are relative to run time, so a
   fresh seed always lands in the last 40 days. */
import { skuFor, ymd } from '../src/lib/format.js';
import type {
  AdminDb,
  LedgerEntry,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ReturnRequest,
  ReturnStatus,
  ReturnType,
} from '../types';
import {
  ANNOUNCEMENTS,
  COLORS,
  CONFIG,
  OFFERS,
  OFFLINE_LOCATIONS,
  seedCategories,
  seedProducts,
} from './catalog';

const DAY = 864e5;

const PEOPLE: [string, string, string, string][] = [
  ['Anjali Menon', 'Kochi', 'Kerala', '682020'],
  ['Lakshmi Nair', 'Thrissur', 'Kerala', '680001'],
  ['Fathima Rahman', 'Kozhikode', 'Kerala', '673001'],
  ['Divya Pillai', 'Thiruvananthapuram', 'Kerala', '695001'],
  ['Sneha Thomas', 'Kottayam', 'Kerala', '686001'],
  ['Aparna Krishnan', 'Palakkad', 'Kerala', '678001'],
  ['Meera Varghese', 'Kochi', 'Kerala', '682016'],
  ['Nikhila Joseph', 'Kannur', 'Kerala', '670001'],
  ['Gayathri Suresh', 'Alappuzha', 'Kerala', '688001'],
  ['Riya Mathew', 'Bengaluru', 'Karnataka', '560034'],
  ['Ananya Rao', 'Bengaluru', 'Karnataka', '560076'],
  ['Priya Sharma', 'New Delhi', 'Delhi', '110017'],
  ['Kavya Reddy', 'Hyderabad', 'Telangana', '500081'],
  ['Shruti Iyer', 'Chennai', 'Tamil Nadu', '600020'],
  ['Neha Kulkarni', 'Pune', 'Maharashtra', '411038'],
  ['Haritha Das', 'Thrissur', 'Kerala', '680005'],
];

const FLOW: OrderStatus[] = ['new', 'packed', 'shipped', 'out', 'delivered'];

/** Same seeded generator as the prototype, so the demo data is reproducible. */
const rng = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function seedOrders(products: Product[], now: number): Order[] {
  const r = rng(20261008);
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)];
  const orders: Order[] = [];
  let on = 1041;
  let off = 212;
  const ages = [
    0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 16, 18, 20, 21, 23, 25, 26,
    28, 30, 33, 36, 39,
  ];
  ages.reverse().forEach((age, i) => {
    const offline = r() < 0.3;
    const person = pick(PEOPLE);
    const lines: OrderItem[] = [];
    const n = 1 + Math.floor(r() * (offline ? 2 : 3));
    for (let k = 0; k < n; k++) {
      const p = pick(products);
      const vr = pick(p.variants);
      if (lines.find((l) => l.vid === vr.id)) continue;
      lines.push({
        pid: p.id, vid: vr.id, name: p.name, color: vr.color, sku: vr.sku,
        qty: r() < 0.2 ? 2 : 1, price: p.price, img: vr.images[0] || '',
      });
    }
    const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
    const gift = !offline && r() < 0.25;
    const shipping = offline ? 0 : subtotal >= 499 ? 0 : 60;
    const discount = offline && r() < 0.3 ? Math.round((subtotal * 0.1) / 10) * 10 : 0;
    const total = subtotal + shipping + (gift ? 49 : 0) - discount;
    const at = now - age * DAY - Math.floor(r() * 9 * 36e5) - 36e5;
    const phone = '9' + String(Math.floor(r() * 1e9)).padStart(9, '0');
    const o: Order = {
      id: offline ? 'OS' + off++ : 'AJ' + on++,
      channel: offline ? 'offline' : 'online',
      createdAt: new Date(at).toISOString(),
      customer: offline
        ? {
            name: r() < 0.7 ? person[0] : '', phone: r() < 0.6 ? phone : '',
            email: '', address: '', city: '', state: '', pin: '',
          }
        : {
            name: person[0], phone,
            email: person[0].split(' ')[0].toLowerCase() + '@gmail.com',
            address: `${10 + Math.floor(r() * 90)}, ${pick([
              'Rose Villa', 'Sreenilayam', 'Green Park Apts', 'Lakshmi Bhavan', 'Palm Grove',
            ])}, ${pick(['MG Road', 'Temple Road', 'Church Lane', 'Station Road'])}`,
            city: person[1], state: person[2], pin: person[3],
          },
      items: lines, subtotal, shipping, giftWrap: gift, giftFee: gift ? 49 : 0, discount, total,
      payment: offline
        ? { status: 'paid', method: pick(['Cash', 'UPI', 'UPI', 'Card']) }
        : {
            status: 'paid', method: pick(['UPI', 'UPI', 'Card', 'Netbanking']),
            provider: 'razorpay', ref: 'pay_' + Math.floor(r() * 1e12).toString(36),
          },
      status: 'completed', shipment: null, location: offline ? pick(OFFLINE_LOCATIONS.slice(0, 3)) : '',
      note: '', history: [],
    };
    if (!offline) {
      let st: OrderStatus =
        age === 0 ? 'new' : age === 1 ? 'packed' : age <= 3 ? 'shipped' : age === 4 ? 'out' : 'delivered';
      if (age === 0 && i % 2 === 0) o.payment.status = 'pending';
      if (age > 6 && r() < 0.08) st = 'cancelled';
      o.status = st;
      o.history.push({ at: o.createdAt, status: 'new', note: 'Order placed on website' });
      const idx = FLOW.indexOf(st);
      for (let k = 1; k <= idx; k++) {
        o.history.push({ at: new Date(at + k * 0.9 * DAY).toISOString(), status: FLOW[k], note: '' });
      }
      if (idx >= 2) {
        o.shipment = {
          courier: r() < 0.6 ? 'shiprocket' : 'delhivery',
          awb: String(Math.floor(1e11 + r() * 9e11)),
          shippedAt: new Date(at + 1.8 * DAY).toISOString(),
        };
      }
      if (st === 'cancelled') {
        o.payment.status = 'refunded';
        o.history.push({
          at: new Date(at + 0.4 * DAY).toISOString(), status: 'cancelled',
          note: 'Cancelled by customer',
        });
      }
    } else {
      o.history.push({ at: o.createdAt, status: 'completed', note: 'Offline sale recorded' });
    }
    orders.push(o);
  });
  return orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function seedReturns(orders: Order[], now: number): ReturnRequest[] {
  const delivered = orders.filter((o) => o.channel === 'online' && o.status === 'delivered');
  const spec: [ReturnStatus, ReturnType, string, string, boolean][] = [
    ['requested', 'replacement', 'Arrived damaged', 'The clasp came off when I opened the box.', true],
    ['requested', 'replacement', 'Received wrong colour', 'I ordered rose gold but got gold.', true],
    ['approved', 'replacement', 'Stone missing', 'One stone is missing from the left side.', true],
    ['pickup', 'refund', 'Different from photos', 'The size is much smaller than it looked.', false],
    ['completed', 'replacement', 'Clasp broken', 'Hook is bent.', true],
    ['rejected', 'refund', 'Changed my mind', 'Would like to return it.', false],
  ];
  const order: ReturnStatus[] = ['requested', 'approved', 'pickup', 'received', 'completed'];
  return spec
    .map(([status, type, reason, note, video], i) => {
      const o = delivered[i % Math.max(1, delivered.length)];
      if (!o) return null;
      const it = o.items[0];
      const at = new Date(now - (i + 1) * 0.7 * DAY).toISOString();
      const history = [{ at, status: 'requested', note: 'Requested by customer' }];
      if (status === 'rejected') {
        history.push({
          at, status: 'rejected',
          note: 'Not eligible: change of mind is not covered by policy',
        });
      } else {
        for (let k = 1; k <= order.indexOf(status); k++) {
          history.push({ at, status: order[k], note: '' });
        }
      }
      const id = 'RX' + (301 + i);
      o.returnId = id;
      const req: ReturnRequest = {
        id, orderId: o.id,
        customer: { name: o.customer.name, phone: o.customer.phone },
        item: { ...it, qty: 1 }, type, reason, note, video, photos: video ? 2 : 0,
        createdAt: at,
        deliveredAt: o.history.find((h) => h.status === 'delivered')?.at || o.createdAt,
        status,
        resolution: status === 'completed' ? 'Replacement shipped' : '',
        pickup:
          status === 'pickup'
            ? { courier: 'shiprocket', date: ymd(new Date(now + DAY)) }
            : null,
        history,
      };
      return req;
    })
    .filter((x): x is ReturnRequest => x !== null);
}

function seedLedger(orders: Order[], products: Product[], now: number): LedgerEntry[] {
  const L: LedgerEntry[] = [];
  orders.forEach((o) => {
    o.items.forEach((l) =>
      L.push({
        at: o.createdAt, pid: l.pid, vid: l.vid, sku: l.sku, name: l.name, color: l.color,
        change: -l.qty, reason: o.channel, ref: o.id,
      }),
    );
    if (o.status === 'cancelled') {
      o.items.forEach((l) =>
        L.push({
          at: o.history[o.history.length - 1].at, pid: l.pid, vid: l.vid, sku: l.sku,
          name: l.name, color: l.color, change: l.qty, reason: 'cancel', ref: o.id,
        }),
      );
    }
  });
  products.slice(0, 5).forEach((p, i) => {
    const vr = p.variants[0];
    L.push({
      at: new Date(now - (20 + i) * DAY).toISOString(), pid: p.id, vid: vr.id, sku: vr.sku,
      name: p.name, color: vr.color, change: 10, reason: 'adjust', ref: '',
      note: 'New stock from supplier',
    });
  });
  return L.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** The full starting dataset. */
export function buildSeed(now = Date.now()): AdminDb {
  const products: Product[] = seedProducts().map((p) => ({
    ...p,
    status: 'active',
    giftWrap: true,
    exchange: !['earrings', 'nose-rings'].includes(p.category),
    seoTitle: '',
    seoDesc: '',
    specs: [{ k: 'Finish', v: 'Anti-tarnish, nickel-free' }],
    variants: p.variants.map((vr) => ({ ...vr, sku: skuFor(p, vr.color) })),
  }));
  const orders = seedOrders(products, now);
  const returns = seedReturns(orders, now);
  return {
    v: 1,
    products,
    categories: seedCategories(),
    colors: structuredClone(COLORS),
    banners: {
      heroDesktop: '/assets/aarunya-hero-pastel.jpg',
      heroMobile: '',
      heroAlt: 'Hi, I am Aarunya. Illustration of a little girl holding jewellery.',
      personalised: '/assets/personalised-banner.jpg',
      personalisedMobile: '/assets/personalised-gift-box-v2.jpg',
      personalisedAlt:
        'Made just for you. Personalised Gift, anti-tarnish jewellery, personalised with love.',
      personalisedCta: 'Personalise Your Gift',
    },
    offers: structuredClone(OFFERS),
    announcements: [...ANNOUNCEMENTS],
    config: structuredClone(CONFIG),
    orders,
    returns,
    ledger: seedLedger(orders, products, now),
    admin: { email: 'veena@aarunyajewels.in', name: 'Veena', pass: 'aarunya123' },
  };
}

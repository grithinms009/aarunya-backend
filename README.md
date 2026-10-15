# Aarunya Backend

API for **Aarunya Jewels by Veena** — an anti-tarnish jewellery brand from Kerala selling
pan-India. Node.js + Express + PostgreSQL, no ORM: plain SQL through `pg`, one schema file,
one seed script.

Two surfaces on one app:

| Prefix | Who | What |
|---|---|---|
| `/api/...` | anyone | storefront reads: products, categories, home page content |
| `/api/auth/...` | anyone | sign in, sign out, session, password reset |
| `/api/admin/...` | admins only | everything the admin panel does |

Companion repos: `aarunya-admin` (the admin panel) and `aarunya-web` (the storefront).

## Running it

Needs Docker for PostgreSQL and Node 20+.

```bash
docker compose up -d     # PostgreSQL 16 on localhost:5433
npm install
cp .env.example .env     # then set a real JWT_SECRET
npm run db:migrate       # apply the schema
npm run db:seed          # load the demo catalogue
npm run dev              # http://localhost:4000
```

`npm run db:reset` drops and rebuilds everything, then reseeds — the quickest way back to a
known state.

### Accounts seeded

| Role | Email | Password |
|---|---|---|
| `admin` | veena@aarunyajewels.in | aarunya123 |
| `user` | user@aarunyajewels.in | user12345 |

Both sign in at `POST /api/auth/login`. Only `admin` may touch `/api/admin/**`; a `user`
session gets a 403 there. Change these before anything is deployed.

### Environment

| Variable | Default | Used for |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `DATABASE_URL` | `postgres://aarunya:aarunya_local_pw@localhost:5433/aarunya` | PostgreSQL |
| `JWT_SECRET` | — | signs the session cookie; must be long and random |
| `ADMIN_ORIGIN` | `http://localhost:5174` | CORS allow-list |
| `STORE_ORIGIN` | `http://localhost:5173` | CORS allow-list |
| `COOKIE_SECURE` | `false` | set `true` behind HTTPS |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | see above | the non-admin account `db:seed` creates |

## Tests

```bash
npm test     # resets the database, then checks every business rule against the live API
```

It covers order numbering, the stock and ledger invariants, the order-flow guards, adjustment
clamping, product validation, the return state machine and its stock effects, and the auth
rules (role guard, CSRF, signed-out and wrong-password refusals). These checks came from
`aarunya-admin`'s `check:rules`, which ran them against the browser mock before this API
existed.

## Layout

```
src/
  server.js          app wiring: helmet, CORS, cookies, session, CSRF, rate limits, routes
  db/
    schema.sql       the whole schema, one file
    migrate.js       applies it (--reset drops first)
    seed.js          loads the demo dataset and the two accounts
    seed-source.mjs  GENERATED — the admin prototype's own seed builder, bundled
    pool.js          pg pool + tx() helper
  lib/
    stock.js         applyStock() — the single point of stock mutation
    repo.js          row → DTO assembly, the shapes the admin is written against
    settings.js      typed facade over the `setting` table
    reference.js     the fixed vocabularies, defined once and served to the admin
    password.js      scrypt hashing
    format.js        slug, SKU, tint and money helpers shared with the admin
    csv.js, errors.js
  middleware/
    auth.js          session cookie, role guard, CSRF double-submit
    validate.js      zod body and query parsing
    error.js         one JSON error shape for the whole API
  routes/            one file per resource
test/rules.test.mjs  the business-rule suite
scripts/gen-seed.sh  regenerates seed-source.mjs from aarunya-admin
```

## Reference data

`src/lib/reference.js` is the single definition of the vocabularies the store runs on:
adjustment reasons, return reasons, refund methods, payment modes, the order and return
flows, offer link targets, default artwork, photo slots, return windows, dispatch cut-offs,
category tints and the SKU code maps.

The routes that enforce them import from that module, and `GET /api/admin/meta/reference`
serves the same values to the admin panel, so a rule and the dropdown that triggers it can
never disagree. The admin hard-codes none of this — it reads the endpoint through
`useReference()` and caches it for the session.

Anything that varies per store (fees, couriers, locations, colours, the return policy) is not
reference data: it lives in the `setting` table and is edited on the Settings screen.

## Data model

Money is whole rupees as `INTEGER` everywhere; the UI rounds to rupees and nothing needs
fractions until a payment gateway is wired in.

`variant.stock` is the only mutable stock column, and **every** write goes through
`applyStock(client, variantId, change, reason, ref, note)` inside the caller's transaction. It
locks the row, clamps the result at zero, updates the variant and writes exactly one
`stock_ledger` row. Order placement, cancellation, offline sales, restocked returns,
replacement dispatch and manual adjustments all call it, so stock and ledger can never
diverge. The ledger is append-only and survives the product being deleted.

Order items are snapshots (name, colour, SKU, price, image), so deleting a product never
rewrites order history.

The demo dataset comes from `db/seed-source.mjs`, bundled straight from the admin prototype's
own seed builder, so a freshly seeded database shows exactly what the prototype showed.
Regenerate it with `scripts/gen-seed.sh` when that seed changes. Dates are computed at run
time, so a fresh seed always lands in the last 40 days.

## Security

- **Passwords**: scrypt (node's `crypto`), per-password salt, parameters stored with the hash.
- **Session**: a short-lived JWT in an HTTP-only, `SameSite=Lax` cookie. No token is ever
  readable by page JavaScript. Set `COOKIE_SECURE=true` behind HTTPS.
- **CSRF**: double-submit. Login sets a readable `aj_csrf` cookie; every mutating request must
  echo it in an `x-csrf-token` header. Another site can make the browser send the cookie but
  cannot read it to build the header.
- **Login throttling**: per IP (20 attempts / 15 min) and per email (8 failures / 15 min), with
  every attempt recorded in `login_attempt`. An unknown address still costs a password hash, so
  response timing doesn't reveal which accounts exist.
- **Password reset**: single-use SHA-256-hashed token, 30-minute expiry, and a response that is
  identical whether or not the address is registered. Delivery needs an SMTP provider; until
  one is configured the token is logged for local development.
- **Validation**: zod on every body and query string, with allow-listed enums for sort and
  filter parameters. Every SQL statement is parameterised.
- **CORS**: an explicit origin allow-list with credentials; no wildcard.
- **Errors**: one JSON shape, `{ error, message, fields? }`. Unexpected errors are logged in
  full server-side and reported generically.

## API

### Public

```
GET  /api/storefront                  config, banners, visible offers, announcements,
                                      categories, colours, return policy
GET  /api/products?category=&type=&color=&price=&sale=&instock=&q=&sort=
GET  /api/products/{slug}             active products only
GET  /api/categories
```

### Auth

```
POST /api/auth/login                  { email, password } → sets the session + CSRF cookies
POST /api/auth/logout
GET  /api/auth/me                     the signed-in account, or null
POST /api/auth/forgot-password        always reports success
POST /api/auth/reset-password         { token, password }
PATCH /api/auth/account               name, email, password
```

### Admin — all of these require an `admin` session

```
meta       GET  /meta/{categories,colors,config,badges}
           GET  /meta/reference   the fixed vocabularies the admin renders
dashboard  GET  /dashboard?period=today|7|30
products   GET  /products (q, cat, sub, color, stock, status, flags, sort)
           GET  /products/{id} · POST /products · PUT /products/{id}
           DELETE /products/{id} · POST /products/{id}/duplicate
           GET  /products/export.csv
categories GET  /categories · GET /categories/counts · POST /categories
           DELETE /categories/{slug} · PUT /categories/order
inventory  GET  /inventory/{summary,stock,ledger} · GET /inventory/export.csv
           POST /inventory/quick · POST /inventory/adjust
orders     GET  /orders (ch, status, pay, range, from, to, q)
           GET  /orders/{orderNo} · GET /orders/{recent-offline,returnable}
           GET  /orders/export.csv
           POST /orders/{orderNo}/advance · /cancel · /payment/mark-paid
           PUT  /orders/{orderNo}/shipment · PATCH /orders/{orderNo}/note
           POST /orders/offline-sales
returns    GET  /returns (tab, type, q) · GET /returns/{returnNo} · GET /returns/eligibility
           POST /returns  (log one by hand)
           POST /returns/{returnNo}/{approve,reject,pickup,receive,replacement,refund}
           PUT  /returns/policy
customers  GET  /customers · GET /customers/export.csv
settings   GET  /settings · GET /settings/colors-in-use · PUT /settings
content    GET  /storefront-content · PUT /storefront-content
```

Every list endpoint returns the exact shapes in `aarunya-admin/src/data/types.ts`, which is
why connecting the admin needed no screen changes.

## Not built yet

These were out of scope for this pass and are the obvious next steps:

- **Payments.** No gateway. Orders carry a payment status that an admin sets by hand; the
  webhook endpoint and the Razorpay adapter in the architecture doc are not here.
- **Object storage for images.** Uploads are still resized in the browser and stored as data
  URLs, which is why `express.json` accepts 12 MB bodies. The doc's signed-upload flow and
  CDN renditions would replace that.
- **Transactional email.** Password-reset tokens are logged, not sent.
- **Customer accounts on the storefront.** The `user` role exists and can sign in, but no
  public cart or checkout endpoint writes orders yet.
- **The storefront wiring.** `aarunya-web` still runs on its own mock; `GET /api/storefront`
  is ready for it.

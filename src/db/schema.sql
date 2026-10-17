-- Aarunya store schema.
-- Money is whole rupees as INTEGER throughout; the UI rounds to rupees everywhere.
-- variant.stock is the only mutable stock column and every write goes through
-- lib/stock.js applyStock(), which locks the row and writes exactly one ledger entry.

BEGIN;

CREATE TYPE user_role       AS ENUM ('admin', 'user');
CREATE TYPE product_status  AS ENUM ('active', 'draft');
CREATE TYPE sales_channel   AS ENUM ('online', 'offline');
CREATE TYPE order_status    AS ENUM ('new', 'packed', 'shipped', 'out', 'delivered', 'cancelled', 'completed');
CREATE TYPE payment_status  AS ENUM ('paid', 'pending', 'refunded', 'partial');
CREATE TYPE return_type     AS ENUM ('replacement', 'refund');
CREATE TYPE return_status   AS ENUM ('requested', 'approved', 'pickup', 'received', 'completed', 'rejected');
CREATE TYPE ledger_reason   AS ENUM ('online', 'offline', 'cancel', 'return', 'replacement', 'adjust');

-- ---------------------------------------------------------------- accounts

CREATE TABLE app_user (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'user',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-use, hashed reset tokens. The response never reveals whether an address exists.
CREATE TABLE password_reset_token (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON password_reset_token (user_id);

-- Login throttling per email and per IP.
CREATE TABLE login_attempt (
  id    BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip    TEXT NOT NULL,
  ok    BOOLEAN NOT NULL,
  at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON login_attempt (email, at DESC);
CREATE INDEX ON login_attempt (ip, at DESC);

-- ---------------------------------------------------------------- catalogue

CREATE TABLE color (
  key        TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  hex        TEXT NOT NULL,
  tint       TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE category (
  slug       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  short      TEXT NOT NULL DEFAULT '',
  ph         TEXT NOT NULL DEFAULT '',
  tint       TEXT NOT NULL DEFAULT '',
  image      TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE sub_category (
  category_slug TEXT NOT NULL REFERENCES category(slug) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  name          TEXT NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (category_slug, slug)
);

-- "Pair it up with" suggestions between categories.
CREATE TABLE category_pairing (
  category_slug TEXT NOT NULL REFERENCES category(slug) ON DELETE CASCADE,
  paired_slug   TEXT NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (category_slug, paired_slug)
);

CREATE TABLE product (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  category_slug   TEXT NOT NULL REFERENCES category(slug),
  sub_slug        TEXT,
  popularity      INT NOT NULL DEFAULT 0,
  price           INT NOT NULL CHECK (price >= 0),
  mrp             INT NOT NULL CHECK (mrp >= 0),
  featured        BOOLEAN NOT NULL DEFAULT FALSE,
  is_new          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ymd  TEXT NOT NULL DEFAULT '',
  rating          NUMERIC(2,1),
  review_count    INT NOT NULL DEFAULT 0,
  description     TEXT NOT NULL DEFAULT '',
  material        TEXT NOT NULL DEFAULT '',
  status          product_status NOT NULL DEFAULT 'active',
  gift_wrap       BOOLEAN NOT NULL DEFAULT TRUE,
  exchange        BOOLEAN NOT NULL DEFAULT TRUE,
  seo_title       TEXT NOT NULL DEFAULT '',
  seo_desc        TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON product (category_slug);
CREATE INDEX ON product (status);

CREATE TABLE product_spec (
  id         BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  k          TEXT NOT NULL,
  v          TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
CREATE INDEX ON product_spec (product_id);

CREATE TABLE variant (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  color_key  TEXT NOT NULL,
  sku        TEXT NOT NULL,
  stock      INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (product_id, color_key)
);
CREATE INDEX ON variant (product_id);

CREATE TABLE variant_image (
  variant_id TEXT NOT NULL REFERENCES variant(id) ON DELETE CASCADE,
  slot       SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 2),
  url        TEXT NOT NULL,
  PRIMARY KEY (variant_id, slot)
);

-- ---------------------------------------------------------------- orders

CREATE TABLE "order" (
  id         TEXT PRIMARY KEY,                 -- AJ1001… / OS201…
  channel    sales_channel NOT NULL,
  status     order_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cust_name  TEXT NOT NULL DEFAULT '',
  cust_phone TEXT NOT NULL DEFAULT '',
  cust_email TEXT NOT NULL DEFAULT '',
  address    TEXT NOT NULL DEFAULT '',
  city       TEXT NOT NULL DEFAULT '',
  state      TEXT NOT NULL DEFAULT '',
  pin        TEXT NOT NULL DEFAULT '',
  subtotal   INT NOT NULL DEFAULT 0,
  shipping   INT NOT NULL DEFAULT 0,
  gift_wrap  BOOLEAN NOT NULL DEFAULT FALSE,
  gift_fee   INT NOT NULL DEFAULT 0,
  discount   INT NOT NULL DEFAULT 0,
  total      INT NOT NULL DEFAULT 0,
  pay_status payment_status NOT NULL DEFAULT 'pending',
  pay_method TEXT NOT NULL DEFAULT '',
  provider   TEXT,
  pay_ref    TEXT,
  location   TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  return_id  TEXT,
  -- Random, unguessable handle given to the shopper at checkout. Order details are only
  -- ever returned to someone holding this, never to anyone who knows the order number.
  access_token TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "order" (access_token);
CREATE INDEX ON "order" (created_at DESC);
CREATE INDEX ON "order" (channel, status);
CREATE INDEX ON "order" (cust_phone);

-- Snapshots, so deleting a product never rewrites order history.
CREATE TABLE order_item (
  id         BIGSERIAL PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  product_id TEXT,
  variant_id TEXT,
  name       TEXT NOT NULL,
  color_key  TEXT NOT NULL DEFAULT '',
  sku        TEXT NOT NULL DEFAULT '',
  qty        INT NOT NULL CHECK (qty > 0),
  price      INT NOT NULL CHECK (price >= 0),
  img        TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0
);
CREATE INDEX ON order_item (order_id);

CREATE TABLE order_history (
  id         BIGSERIAL PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON order_history (order_id, at);

CREATE TABLE shipment (
  order_id   TEXT PRIMARY KEY REFERENCES "order"(id) ON DELETE CASCADE,
  courier    TEXT NOT NULL DEFAULT '',
  awb        TEXT NOT NULL DEFAULT '',
  shipped_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------- returns

CREATE TABLE return_request (
  id            TEXT PRIMARY KEY,              -- RX301…
  order_id      TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  cust_name     TEXT NOT NULL DEFAULT '',
  cust_phone    TEXT NOT NULL DEFAULT '',
  item_pid      TEXT NOT NULL DEFAULT '',
  item_vid      TEXT NOT NULL DEFAULT '',
  item_name     TEXT NOT NULL DEFAULT '',
  item_color    TEXT NOT NULL DEFAULT '',
  item_sku      TEXT NOT NULL DEFAULT '',
  item_qty      INT NOT NULL DEFAULT 1,
  item_price    INT NOT NULL DEFAULT 0,
  item_img      TEXT NOT NULL DEFAULT '',
  type          return_type NOT NULL,
  reason        TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  video         BOOLEAN NOT NULL DEFAULT FALSE,
  photos        INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at  TIMESTAMPTZ,
  status        return_status NOT NULL DEFAULT 'requested',
  resolution    TEXT NOT NULL DEFAULT '',
  restocked     BOOLEAN,
  pickup_courier TEXT,
  pickup_date   TEXT,
  refund_amount INT,
  refund_method TEXT
);
CREATE INDEX ON return_request (status);
CREATE INDEX ON return_request (order_id);

CREATE TABLE return_history (
  id        BIGSERIAL PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES return_request(id) ON DELETE CASCADE,
  status    TEXT NOT NULL,
  note      TEXT NOT NULL DEFAULT '',
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON return_history (return_id, at);

-- ---------------------------------------------------------------- inventory

-- Append-only. Exactly one row per stock movement.
CREATE TABLE stock_ledger (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  product_id TEXT NOT NULL DEFAULT '',
  variant_id TEXT NOT NULL DEFAULT '',
  sku        TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL DEFAULT '',
  color_key  TEXT NOT NULL DEFAULT '',
  change     INT NOT NULL,
  reason     ledger_reason NOT NULL,
  ref        TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX ON stock_ledger (at DESC);
CREATE INDEX ON stock_ledger (variant_id, at DESC);

-- Messages sent through the storefront's contact form.
CREATE TABLE contact_message (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  order_no   TEXT NOT NULL DEFAULT '',
  subject    TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL,
  ip         TEXT NOT NULL DEFAULT '',
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON contact_message (created_at DESC);

-- ---------------------------------------------------------------- storefront content

CREATE TABLE banner (
  id                   INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hero_desktop         TEXT NOT NULL DEFAULT '',
  hero_mobile          TEXT NOT NULL DEFAULT '',
  hero_alt             TEXT NOT NULL DEFAULT '',
  personalised         TEXT NOT NULL DEFAULT '',
  personalised_mobile  TEXT NOT NULL DEFAULT '',
  personalised_alt     TEXT NOT NULL DEFAULT '',
  personalised_cta     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE offer (
  id         BIGSERIAL PRIMARY KEY,
  badge      TEXT NOT NULL DEFAULT '',
  title      TEXT NOT NULL DEFAULT '',
  accent     TEXT NOT NULL DEFAULT '',
  sub        TEXT NOT NULL DEFAULT '',
  cta        TEXT NOT NULL DEFAULT '',
  href       TEXT NOT NULL DEFAULT '',
  match_key  TEXT NOT NULL DEFAULT 'sale',
  image      TEXT NOT NULL DEFAULT '',
  w          INT NOT NULL DEFAULT 0,
  btn        TEXT NOT NULL DEFAULT 'solid',
  bx         NUMERIC NOT NULL DEFAULT 50,
  by         NUMERIC NOT NULL DEFAULT 50,
  alt        TEXT NOT NULL DEFAULT '',
  hidden     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE announcement (
  id         BIGSERIAL PRIMARY KEY,
  text       TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

-- The config block, read through a typed facade in lib/settings.js.
CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

COMMIT;

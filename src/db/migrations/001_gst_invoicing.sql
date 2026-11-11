-- GST classification, tax snapshots, tax invoices, credit notes, payment reconciliation.
-- Additive and idempotent: nothing existing is dropped, rewritten or back-filled.
-- Rollback: see 001_gst_invoicing.down.sql (only safe while no invoice has been issued).

-- ---------------------------------------------------------------- product classification
-- NULL gst_rate_bp / empty hsn_code = "not classified". A product is only invoiceable once
-- an admin has marked it verified (business/CA confirmed the HSN and rate).
ALTER TABLE product
  ADD COLUMN IF NOT EXISTS hsn_code        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gst_rate_bp     INT CHECK (gst_rate_bp IS NULL OR gst_rate_bp BETWEEN 0 AND 4000),
  ADD COLUMN IF NOT EXISTS hsn_status      TEXT NOT NULL DEFAULT 'unverified'
                                           CHECK (hsn_status IN ('unverified','verified')),
  ADD COLUMN IF NOT EXISTS hsn_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hsn_verified_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tax_note        TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------- order: tax + payment
ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS gst_applied         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tax_type            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS price_mode          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS place_of_supply     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS taxable_paise       BIGINT,
  ADD COLUMN IF NOT EXISTS cgst_paise          BIGINT,
  ADD COLUMN IF NOT EXISTS sgst_paise          BIGINT,
  ADD COLUMN IF NOT EXISTS igst_paise          BIGINT,
  ADD COLUMN IF NOT EXISTS round_off_paise     BIGINT,
  ADD COLUMN IF NOT EXISTS grand_total_paise   BIGINT,
  ADD COLUMN IF NOT EXISTS tax_breakup         JSONB,
  ADD COLUMN IF NOT EXISTS tax_issues          JSONB,
  ADD COLUMN IF NOT EXISTS bill_name           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bill_address        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bill_city           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bill_state          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bill_pin            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bill_gstin          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS third_party_direction BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gateway_order_id    TEXT,
  ADD COLUMN IF NOT EXISTS gateway_payment_id  TEXT,
  ADD COLUMN IF NOT EXISTS paid_paise          BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_paise      BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at             TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS order_gateway_order_uq ON "order" (gateway_order_id) WHERE gateway_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS order_gateway_payment_uq ON "order" (gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;

ALTER TABLE order_item
  ADD COLUMN IF NOT EXISTS hsn_code    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gst_rate_bp INT;

-- Webhook idempotency + a durable trail of everything the gateway told us (no card data).
CREATE TABLE IF NOT EXISTS payment_event (
  id          BIGSERIAL PRIMARY KEY,
  event_id    TEXT NOT NULL UNIQUE,
  event       TEXT NOT NULL,
  order_id    TEXT,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- numbering
-- One counter row per (series, financial year). Incremented with a single UPSERT, so the
-- row lock serialises concurrent issuers, and a rolled-back transaction rolls the number
-- back with it: the series has no gaps and a number is never handed out twice.
CREATE TABLE IF NOT EXISTS invoice_sequence (
  series  TEXT NOT NULL,                     -- 'INV' | 'CN' | 'DN'
  fy      TEXT NOT NULL,                     -- '26-27'
  last_no INT  NOT NULL DEFAULT 0 CHECK (last_no >= 0),
  PRIMARY KEY (series, fy)
);

-- ---------------------------------------------------------------- invoices
CREATE TABLE IF NOT EXISTS invoice (
  id                 BIGSERIAL PRIMARY KEY,
  invoice_no         TEXT NOT NULL UNIQUE,
  fy                 TEXT NOT NULL,
  seq                INT  NOT NULL,
  order_id           TEXT NOT NULL REFERENCES "order"(id) ON DELETE RESTRICT,
  status             TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
  issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  place_of_supply    TEXT NOT NULL,            -- state code
  tax_type           TEXT NOT NULL CHECK (tax_type IN ('intra','inter')),
  reverse_charge     BOOLEAN NOT NULL DEFAULT FALSE,
  price_mode         TEXT NOT NULL,
  -- immutable snapshots
  supplier           JSONB NOT NULL,
  customer           JSONB NOT NULL,
  lines              JSONB NOT NULL,
  totals             JSONB NOT NULL,
  -- denormalised for listing / reporting
  taxable_paise      BIGINT NOT NULL,
  cgst_paise         BIGINT NOT NULL,
  sgst_paise         BIGINT NOT NULL,
  igst_paise         BIGINT NOT NULL,
  tax_paise          BIGINT NOT NULL,
  round_off_paise    BIGINT NOT NULL DEFAULT 0,
  grand_total_paise  BIGINT NOT NULL,
  received_paise     BIGINT NOT NULL DEFAULT 0,
  legacy             BOOLEAN NOT NULL DEFAULT FALSE,   -- issued manually for a pre-GST order
  cancelled_at       TIMESTAMPTZ,
  cancel_reason      TEXT NOT NULL DEFAULT '',
  created_by         TEXT NOT NULL DEFAULT '',
  UNIQUE (fy, seq)
);
-- Only one live invoice per order; a cancelled one stays on file and its number is never reused.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_one_live_per_order ON invoice (order_id) WHERE status = 'issued';
CREATE INDEX IF NOT EXISTS invoice_issued_at_idx ON invoice (issued_at DESC);
CREATE INDEX IF NOT EXISTS invoice_order_idx ON invoice (order_id);

CREATE TABLE IF NOT EXISTS credit_note (
  id                 BIGSERIAL PRIMARY KEY,
  note_no            TEXT NOT NULL UNIQUE,
  fy                 TEXT NOT NULL,
  seq                INT  NOT NULL,
  invoice_id         BIGINT NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,
  kind               TEXT NOT NULL CHECK (kind IN ('cancellation','refund','correction')),
  reason             TEXT NOT NULL DEFAULT '',
  issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  lines              JSONB NOT NULL,
  taxable_paise      BIGINT NOT NULL,
  cgst_paise         BIGINT NOT NULL,
  sgst_paise         BIGINT NOT NULL,
  igst_paise         BIGINT NOT NULL,
  grand_total_paise  BIGINT NOT NULL CHECK (grand_total_paise > 0),
  return_id          TEXT,
  created_by         TEXT NOT NULL DEFAULT '',
  UNIQUE (fy, seq)
);
CREATE INDEX IF NOT EXISTS credit_note_invoice_idx ON credit_note (invoice_id);

-- Append-only audit trail: issued, downloaded-by-admin, cancelled, credit note issued...
CREATE TABLE IF NOT EXISTS invoice_event (
  id         BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,
  event      TEXT NOT NULL,
  actor      TEXT NOT NULL DEFAULT '',
  detail     JSONB NOT NULL DEFAULT '{}',
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_event_invoice_idx ON invoice_event (invoice_id, at);

-- ---------------------------------------------------------------- immutability
-- An issued tax invoice cannot be edited or deleted, only cancelled (status, cancelled_at,
-- cancel_reason, received_paise). Credit notes and events are append-only.
CREATE OR REPLACE FUNCTION invoice_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'issued invoices cannot be deleted; cancel and issue a credit note';
  END IF;
  IF NEW.invoice_no IS DISTINCT FROM OLD.invoice_no OR NEW.fy IS DISTINCT FROM OLD.fy
     OR NEW.seq IS DISTINCT FROM OLD.seq OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at OR NEW.place_of_supply IS DISTINCT FROM OLD.place_of_supply
     OR NEW.tax_type IS DISTINCT FROM OLD.tax_type OR NEW.supplier IS DISTINCT FROM OLD.supplier
     OR NEW.customer IS DISTINCT FROM OLD.customer OR NEW.lines IS DISTINCT FROM OLD.lines
     OR NEW.totals IS DISTINCT FROM OLD.totals OR NEW.taxable_paise IS DISTINCT FROM OLD.taxable_paise
     OR NEW.cgst_paise IS DISTINCT FROM OLD.cgst_paise OR NEW.sgst_paise IS DISTINCT FROM OLD.sgst_paise
     OR NEW.igst_paise IS DISTINCT FROM OLD.igst_paise OR NEW.grand_total_paise IS DISTINCT FROM OLD.grand_total_paise
     OR NEW.round_off_paise IS DISTINCT FROM OLD.round_off_paise OR NEW.price_mode IS DISTINCT FROM OLD.price_mode THEN
    RAISE EXCEPTION 'an issued tax invoice cannot be edited; cancel it and issue a credit note';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'a cancelled invoice cannot be reinstated';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS invoice_guard_trg ON invoice;
CREATE TRIGGER invoice_guard_trg BEFORE UPDATE OR DELETE ON invoice
  FOR EACH ROW EXECUTE FUNCTION invoice_guard();

CREATE OR REPLACE FUNCTION append_only_guard() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS credit_note_guard_trg ON credit_note;
CREATE TRIGGER credit_note_guard_trg BEFORE UPDATE OR DELETE ON credit_note
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
DROP TRIGGER IF EXISTS invoice_event_guard_trg ON invoice_event;
CREATE TRIGGER invoice_event_guard_trg BEFORE UPDATE OR DELETE ON invoice_event
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();

-- ---------------------------------------------------------------- default GST settings
-- Candidate values come from the two sample invoices and are NOT verified. verified=false
-- keeps invoicing switched off until an admin confirms the registration on the GST portal.
INSERT INTO setting (key, value) VALUES ('gst', jsonb_build_object(
  'registered', false, 'verified', false, 'verifiedAt', null, 'verifiedBy', '',
  'gstin', '32BTBPG5961M1ZK', 'legalName', '', 'tradeName', '',
  'address', jsonb_build_object('line1','','line2','','city','','pin',''),
  'stateCode', '32', 'phone', '9747738193', 'email', '',
  'invoicePrefix', 'AJ', 'priceMode', 'inclusive', 'rounding', 'line', 'roundOffToRupee', false,
  'reverseCharge', false, 'issueOn', 'dispatch',
  'template', jsonb_build_object('terms','','footerNote','','signatureText','Authorized Signatory','showSignature', true)
)) ON CONFLICT (key) DO NOTHING;

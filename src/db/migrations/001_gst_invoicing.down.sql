-- Reverses 001. Refuses to run once any invoice or credit note exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM invoice) OR EXISTS (SELECT 1 FROM credit_note) THEN
    RAISE EXCEPTION 'invoices exist; export them before rolling back';
  END IF;
END $$;
DROP TABLE IF EXISTS invoice_event, credit_note, invoice, invoice_sequence, payment_event CASCADE;
DROP FUNCTION IF EXISTS invoice_guard(), append_only_guard();
ALTER TABLE order_item DROP COLUMN IF EXISTS hsn_code, DROP COLUMN IF EXISTS gst_rate_bp;
ALTER TABLE "order"
  DROP COLUMN IF EXISTS gst_applied, DROP COLUMN IF EXISTS tax_type, DROP COLUMN IF EXISTS price_mode,
  DROP COLUMN IF EXISTS place_of_supply, DROP COLUMN IF EXISTS taxable_paise, DROP COLUMN IF EXISTS cgst_paise,
  DROP COLUMN IF EXISTS sgst_paise, DROP COLUMN IF EXISTS igst_paise, DROP COLUMN IF EXISTS round_off_paise,
  DROP COLUMN IF EXISTS grand_total_paise, DROP COLUMN IF EXISTS tax_breakup, DROP COLUMN IF EXISTS tax_issues,
  DROP COLUMN IF EXISTS bill_name, DROP COLUMN IF EXISTS bill_address, DROP COLUMN IF EXISTS bill_city,
  DROP COLUMN IF EXISTS bill_state, DROP COLUMN IF EXISTS bill_pin, DROP COLUMN IF EXISTS bill_gstin,
  DROP COLUMN IF EXISTS third_party_direction, DROP COLUMN IF EXISTS gateway_order_id,
  DROP COLUMN IF EXISTS gateway_payment_id, DROP COLUMN IF EXISTS paid_paise,
  DROP COLUMN IF EXISTS refunded_paise, DROP COLUMN IF EXISTS paid_at;
ALTER TABLE product
  DROP COLUMN IF EXISTS hsn_code, DROP COLUMN IF EXISTS gst_rate_bp, DROP COLUMN IF EXISTS hsn_status,
  DROP COLUMN IF EXISTS hsn_verified_at, DROP COLUMN IF EXISTS hsn_verified_by, DROP COLUMN IF EXISTS tax_note;
DELETE FROM setting WHERE key = 'gst';
DELETE FROM schema_migration WHERE name = '001_gst_invoicing';

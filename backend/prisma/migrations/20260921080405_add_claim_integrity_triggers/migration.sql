-- ============================================================================
-- Claim total integrity
--
-- claims.total_amount is never trusted from application code. Every write to
-- `claims` recomputes it from `line_items` and overwrites whatever value the
-- caller supplied — including a raw SQL UPDATE that bypasses the app entirely.
-- Every write to `line_items` (insert/update/delete) pushes that recompute by
-- touching the parent claim row, which re-enters the same trigger.
-- ============================================================================

CREATE OR REPLACE FUNCTION claims_before_write() RETURNS TRIGGER AS $$
DECLARE
  computed_total NUMERIC(12, 2);
BEGIN
  -- Approved claims are terminal: no further writes to the claim row at all.
  IF TG_OP = 'UPDATE' AND OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Claim % is approved and is read-only', OLD.id
      USING ERRCODE = '22000';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO computed_total
  FROM line_items
  WHERE claim_id = NEW.id;

  NEW.total_amount := computed_total;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_claims_before_write
  BEFORE INSERT OR UPDATE ON claims
  FOR EACH ROW
  EXECUTE FUNCTION claims_before_write();

-- Any change to a claim's line items forces the parent claim row to be
-- rewritten, which re-enters claims_before_write() and recomputes the total.
CREATE OR REPLACE FUNCTION sync_claim_total_on_line_item_change() RETURNS TRIGGER AS $$
DECLARE
  affected_claim_id TEXT;
BEGIN
  affected_claim_id := COALESCE(NEW.claim_id, OLD.claim_id);

  UPDATE claims SET total_amount = total_amount WHERE id = affected_claim_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_claim_total_on_line_item_change
  AFTER INSERT OR UPDATE OR DELETE ON line_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_claim_total_on_line_item_change();

-- ============================================================================
-- Approved-claim lock
--
-- Once a claim's status is APPROVED, line_items and attachments beneath it
-- become immutable at the DB layer, not just hidden by the UI or checked in
-- a service function. Enforced here so a direct API/SQL write can't bypass it.
-- ============================================================================

CREATE OR REPLACE FUNCTION assert_line_item_claim_editable() RETURNS TRIGGER AS $$
DECLARE
  target_claim_id TEXT;
  target_status "claim_status";
BEGIN
  target_claim_id := COALESCE(NEW.claim_id, OLD.claim_id);

  SELECT status INTO target_status FROM claims WHERE id = target_claim_id;

  IF target_status = 'APPROVED' THEN
    RAISE EXCEPTION 'Claim % is approved and is read-only', target_claim_id
      USING ERRCODE = '22000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_line_items_lock
  BEFORE INSERT OR UPDATE OR DELETE ON line_items
  FOR EACH ROW
  EXECUTE FUNCTION assert_line_item_claim_editable();

CREATE OR REPLACE FUNCTION assert_attachment_claim_editable() RETURNS TRIGGER AS $$
DECLARE
  target_line_item_id TEXT;
  target_status "claim_status";
BEGIN
  target_line_item_id := COALESCE(NEW.line_item_id, OLD.line_item_id);

  SELECT c.status INTO target_status
  FROM claims c
  JOIN line_items li ON li.claim_id = c.id
  WHERE li.id = target_line_item_id;

  IF target_status = 'APPROVED' THEN
    RAISE EXCEPTION 'Parent claim for line item % is approved and is read-only', target_line_item_id
      USING ERRCODE = '22000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_attachments_lock
  BEFORE INSERT OR UPDATE OR DELETE ON attachments
  FOR EACH ROW
  EXECUTE FUNCTION assert_attachment_claim_editable();

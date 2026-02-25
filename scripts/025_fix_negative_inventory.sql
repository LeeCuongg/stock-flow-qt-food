-- =============================================
-- StockFlowQTfood - Phase 25: Fix Negative Inventory
-- 1) Data fix: merge duplicate batches + reset negative remaining to 0
-- 2) Logic fix: harden cancel_stock_in to prevent negative inventory
-- =============================================

-- =============================================
-- 1) DATA FIX: Merge duplicate batches & fix negatives
-- =============================================

-- 1a) Merge duplicate batches (same warehouse, product, batch_code, expiry_date)
-- Keep the one with the highest quantity, sum up quantity_remaining
DO $fix$
DECLARE
  v_dup RECORD;
  v_keep_id UUID;
  v_total_qty NUMERIC;
  v_total_remaining NUMERIC;
  v_delete_ids UUID[];
BEGIN
  FOR v_dup IN
    SELECT warehouse_id, product_id, batch_code, expiry_date, COUNT(*) AS cnt
    FROM public.inventory_batches
    GROUP BY warehouse_id, product_id, batch_code, expiry_date
    HAVING COUNT(*) > 1
  LOOP
    -- Pick the batch with highest quantity as the keeper
    SELECT id INTO v_keep_id
    FROM public.inventory_batches
    WHERE warehouse_id = v_dup.warehouse_id
      AND product_id = v_dup.product_id
      AND batch_code = v_dup.batch_code
      AND expiry_date IS NOT DISTINCT FROM v_dup.expiry_date
    ORDER BY quantity DESC, created_at ASC
    LIMIT 1;

    -- Sum totals across all duplicates
    SELECT SUM(quantity), SUM(quantity_remaining)
    INTO v_total_qty, v_total_remaining
    FROM public.inventory_batches
    WHERE warehouse_id = v_dup.warehouse_id
      AND product_id = v_dup.product_id
      AND batch_code = v_dup.batch_code
      AND expiry_date IS NOT DISTINCT FROM v_dup.expiry_date;

    -- Collect IDs to delete (all except keeper)
    SELECT array_agg(id) INTO v_delete_ids
    FROM public.inventory_batches
    WHERE warehouse_id = v_dup.warehouse_id
      AND product_id = v_dup.product_id
      AND batch_code = v_dup.batch_code
      AND expiry_date IS NOT DISTINCT FROM v_dup.expiry_date
      AND id != v_keep_id;

    -- Reassign any sales_items / loss_records pointing to deleted batches
    UPDATE public.sales_items SET batch_id = v_keep_id WHERE batch_id = ANY(v_delete_ids);
    UPDATE public.loss_records SET batch_id = v_keep_id WHERE batch_id = ANY(v_delete_ids);

    -- Update keeper with merged totals
    UPDATE public.inventory_batches
    SET quantity = v_total_qty,
        quantity_remaining = v_total_remaining,
        updated_at = now()
    WHERE id = v_keep_id;

    -- Delete duplicates
    DELETE FROM public.inventory_batches WHERE id = ANY(v_delete_ids);

    RAISE NOTICE 'Merged % duplicates for batch_code=%, kept id=%', array_length(v_delete_ids, 1), v_dup.batch_code, v_keep_id;
  END LOOP;
END $fix$;

-- 1b) Fix any remaining negative quantity_remaining → set to 0
UPDATE public.inventory_batches
SET quantity_remaining = 0, updated_at = now()
WHERE quantity_remaining < 0;

-- 1c) Fix quantity < quantity_remaining (shouldn't happen but safety net)
UPDATE public.inventory_batches
SET quantity = quantity_remaining, updated_at = now()
WHERE quantity < quantity_remaining;


-- =============================================
-- 2) LOGIC FIX: Harden cancel_stock_in
-- Prevent cancellation when stock has already been consumed
-- Uses actual consumed = quantity - quantity_remaining check
-- =============================================
CREATE OR REPLACE FUNCTION public.cancel_stock_in(
  p_stock_in_id UUID,
  p_reason TEXT DEFAULT 'Huỷ phiếu nhập'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_si RECORD;
  v_item RECORD;
  v_batch RECORD;
  v_old_items JSONB;
  v_revision_number INT;
BEGIN
  SELECT * INTO v_si FROM public.stock_in WHERE id = p_stock_in_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock-in % not found', p_stock_in_id;
  END IF;
  IF v_si.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Stock-in already cancelled';
  END IF;
  IF v_si.amount_paid > 0 THEN
    RAISE EXCEPTION 'Cannot cancel stock-in with existing payments (amount_paid = %)', v_si.amount_paid;
  END IF;

  -- Snapshot old items
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', sii.product_id, 'batch_code', sii.batch_code,
    'expired_date', sii.expired_date, 'quantity', sii.quantity, 'cost_price', sii.cost_price
  )), '[]'::JSONB) INTO v_old_items
  FROM public.stock_in_items sii WHERE sii.stock_in_id = p_stock_in_id;

  -- PRE-VALIDATION: Check ALL items first before making any changes
  FOR v_item IN
    SELECT product_id, batch_code, expired_date, quantity
    FROM public.stock_in_items WHERE stock_in_id = p_stock_in_id
  LOOP
    SELECT * INTO v_batch
    FROM public.inventory_batches
    WHERE warehouse_id = v_si.warehouse_id
      AND product_id = v_item.product_id
      AND batch_code = v_item.batch_code
      AND expiry_date IS NOT DISTINCT FROM v_item.expired_date;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch not found: product %, batch_code %', v_item.product_id, v_item.batch_code;
    END IF;

    -- Check if enough remaining to reverse the full stock-in quantity
    IF v_batch.quantity_remaining < v_item.quantity THEN
      RAISE EXCEPTION 'Không thể huỷ: lô % đã xuất/hao hụt % đơn vị (còn lại %/%). Hãy huỷ các phiếu xuất/hao hụt liên quan trước.',
        v_item.batch_code,
        v_item.quantity - v_batch.quantity_remaining,
        v_batch.quantity_remaining,
        v_item.quantity;
    END IF;
  END LOOP;

  -- All checks passed → apply inventory reversal
  FOR v_item IN
    SELECT product_id, batch_code, expired_date, quantity
    FROM public.stock_in_items WHERE stock_in_id = p_stock_in_id
  LOOP
    UPDATE public.inventory_batches
    SET quantity = quantity - v_item.quantity,
        quantity_remaining = quantity_remaining - v_item.quantity,
        updated_at = now()
    WHERE warehouse_id = v_si.warehouse_id
      AND product_id = v_item.product_id
      AND batch_code = v_item.batch_code
      AND expiry_date IS NOT DISTINCT FROM v_item.expired_date;
  END LOOP;

  -- Set status to CANCELLED
  UPDATE public.stock_in SET status = 'CANCELLED' WHERE id = p_stock_in_id;

  -- Log revision
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_revision_number
  FROM public.document_revisions
  WHERE document_type = 'STOCK_IN' AND document_id = p_stock_in_id;

  INSERT INTO public.document_revisions (document_type, document_id, revision_number, reason, old_data, new_data, changed_by)
  VALUES (
    'STOCK_IN', p_stock_in_id, v_revision_number, p_reason,
    jsonb_build_object('status', v_si.status, 'items', v_old_items),
    jsonb_build_object('status', 'CANCELLED'),
    auth.uid()
  );

  RETURN p_stock_in_id;
END;
$fn$;

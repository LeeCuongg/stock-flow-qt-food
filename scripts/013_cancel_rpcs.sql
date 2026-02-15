-- =============================================
-- StockFlowQTfood - Phase 13: Cancel Stock-In & Sale RPCs
-- Huỷ phiếu nhập/xuất: đổi status CANCELLED + hoàn trả tồn kho
-- =============================================

-- =============================================
-- 1) RPC: cancel_stock_in
-- Hoàn trả tồn kho (trừ quantity_remaining theo số đã nhập)
-- =============================================
CREATE OR REPLACE FUNCTION public.cancel_stock_in(
  p_stock_in_id UUID,
  p_reason TEXT DEFAULT 'Huỷ phiếu nhập'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_si RECORD;
  v_item RECORD;
  v_current_remaining NUMERIC(12,2);
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

  -- Reverse inventory for each item
  FOR v_item IN
    SELECT product_id, batch_code, expired_date, quantity
    FROM public.stock_in_items WHERE stock_in_id = p_stock_in_id
  LOOP
    SELECT quantity_remaining INTO v_current_remaining
    FROM public.inventory_batches
    WHERE warehouse_id = v_si.warehouse_id
      AND product_id = v_item.product_id
      AND batch_code = v_item.batch_code
      AND expiry_date IS NOT DISTINCT FROM v_item.expired_date;

    IF FOUND AND v_current_remaining < v_item.quantity THEN
      RAISE EXCEPTION 'Cannot cancel: batch (%, %) has only % remaining but needs to reverse %',
        v_item.batch_code, v_item.product_id, v_current_remaining, v_item.quantity;
    END IF;

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
$$;

-- =============================================
-- 2) RPC: cancel_sale
-- Hoàn trả tồn kho (cộng lại quantity_remaining theo số đã xuất)
-- =============================================
CREATE OR REPLACE FUNCTION public.cancel_sale(
  p_sale_id UUID,
  p_reason TEXT DEFAULT 'Huỷ đơn xuất'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale RECORD;
  v_item RECORD;
  v_old_items JSONB;
  v_revision_number INT;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found', p_sale_id;
  END IF;
  IF v_sale.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Sale already cancelled';
  END IF;
  IF v_sale.amount_paid > 0 THEN
    RAISE EXCEPTION 'Cannot cancel sale with existing payments (amount_paid = %)', v_sale.amount_paid;
  END IF;

  -- Snapshot old items
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', si.product_id, 'batch_id', si.batch_id,
    'quantity', si.quantity, 'sale_price', si.sale_price, 'cost_price', si.cost_price
  )), '[]'::JSONB) INTO v_old_items
  FROM public.sales_items si WHERE si.sale_id = p_sale_id;

  -- Return inventory for each item
  FOR v_item IN
    SELECT batch_id, quantity FROM public.sales_items WHERE sale_id = p_sale_id
  LOOP
    UPDATE public.inventory_batches
    SET quantity_remaining = quantity_remaining + v_item.quantity,
        updated_at = now()
    WHERE id = v_item.batch_id;
  END LOOP;

  -- Set status to CANCELLED
  UPDATE public.sales SET status = 'CANCELLED' WHERE id = p_sale_id;

  -- Log revision
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_revision_number
  FROM public.document_revisions
  WHERE document_type = 'SALE' AND document_id = p_sale_id;

  INSERT INTO public.document_revisions (document_type, document_id, revision_number, reason, old_data, new_data, changed_by)
  VALUES (
    'SALE', p_sale_id, v_revision_number, p_reason,
    jsonb_build_object('status', v_sale.status, 'items', v_old_items),
    jsonb_build_object('status', 'CANCELLED'),
    auth.uid()
  );

  RETURN p_sale_id;
END;
$$;

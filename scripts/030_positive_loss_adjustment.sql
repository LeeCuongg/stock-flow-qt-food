-- =============================================
-- Phase 30: Positive loss adjustment (bù sai số dương)
-- Allows adding stock back to a batch via a loss record.
-- Used to fix negative-inventory batches caused by tolerance drift.
-- =============================================

CREATE OR REPLACE FUNCTION public.create_positive_loss_record(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_batch_id UUID,
  p_quantity NUMERIC,
  p_reason TEXT,
  p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loss_id UUID;
  v_batch_remaining NUMERIC(12,2);
  v_batch_warehouse UUID;
  v_batch_cost_price NUMERIC(12,2);
  v_total_loss_cost NUMERIC(14,2);
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  IF p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'Reason cannot be empty';
  END IF;

  SELECT quantity_remaining, cost_price, warehouse_id
  INTO v_batch_remaining, v_batch_cost_price, v_batch_warehouse
  FROM public.inventory_batches
  WHERE id = p_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id;
  END IF;

  IF v_batch_warehouse != p_warehouse_id THEN
    RAISE EXCEPTION 'Batch % does not belong to warehouse %', p_batch_id, p_warehouse_id;
  END IF;

  -- Only allow positive adjustment when batch is negative
  IF v_batch_remaining >= 0 THEN
    RAISE EXCEPTION 'Batch % is not negative (remaining = %). Use normal loss record instead.', p_batch_id, v_batch_remaining;
  END IF;

  -- Cannot add more than |remaining| (would make batch positive from a compensation)
  IF p_quantity > ABS(v_batch_remaining) THEN
    RAISE EXCEPTION 'Adjustment % exceeds deficit %. Maximum: %', p_quantity, v_batch_remaining, ABS(v_batch_remaining);
  END IF;

  v_total_loss_cost := p_quantity * v_batch_cost_price;

  INSERT INTO public.loss_records (
    warehouse_id, product_id, batch_id,
    quantity, reason, note,
    cost_price, total_loss_cost, created_by
  )
  VALUES (
    p_warehouse_id, p_product_id, p_batch_id,
    p_quantity, p_reason,
    COALESCE(p_note, '') || format(' [Bù sai số: +%s, tồn trước: %s → sau: %s]',
      p_quantity, v_batch_remaining, v_batch_remaining + p_quantity),
    v_batch_cost_price, v_total_loss_cost, auth.uid()
  )
  RETURNING id INTO v_loss_id;

  -- ADD to inventory (positive adjustment)
  UPDATE public.inventory_batches
  SET quantity_remaining = quantity_remaining + p_quantity,
      updated_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('loss_id', v_loss_id, 'loss_cost', v_total_loss_cost);
END;
$$;

-- =============================================
-- StockFlowQTfood - Phase 4 Migration
-- RPC: create_loss_record + schema updates
-- =============================================

-- Add columns to loss_records
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loss_records' AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE public.loss_records ADD COLUMN cost_price NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loss_records' AND column_name = 'total_loss_cost'
  ) THEN
    ALTER TABLE public.loss_records ADD COLUMN total_loss_cost NUMERIC(14,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loss_records' AND column_name = 'note'
  ) THEN
    ALTER TABLE public.loss_records ADD COLUMN note TEXT;
  END IF;
END $$;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_loss_records_warehouse ON public.loss_records(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_loss_records_product ON public.loss_records(product_id);
CREATE INDEX IF NOT EXISTS idx_loss_records_batch ON public.loss_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_loss_records_created_at ON public.loss_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loss_records_reason ON public.loss_records(reason);

-- =============================================
-- RPC: create_loss_record
-- =============================================
CREATE OR REPLACE FUNCTION public.create_loss_record(
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
  -- Validate quantity
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  -- Validate reason
  IF p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'Reason cannot be empty';
  END IF;

  -- Validate batch exists and belongs to warehouse
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

  -- Check sufficient stock
  IF v_batch_remaining < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for batch %. Remaining: %, Requested: %', p_batch_id, v_batch_remaining, p_quantity;
  END IF;

  v_total_loss_cost := p_quantity * v_batch_cost_price;

  -- Insert loss record
  INSERT INTO public.loss_records (warehouse_id, product_id, batch_id, quantity, reason, note, cost_price, total_loss_cost, created_by)
  VALUES (p_warehouse_id, p_product_id, p_batch_id, p_quantity, p_reason, p_note, v_batch_cost_price, v_total_loss_cost, auth.uid())
  RETURNING id INTO v_loss_id;

  -- Deduct inventory
  UPDATE public.inventory_batches
  SET quantity_remaining = quantity_remaining - p_quantity,
      updated_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('loss_id', v_loss_id, 'loss_cost', v_total_loss_cost);
END;
$$;

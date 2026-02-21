-- =============================================
-- StockFlowQTfood - Phase 9.5: Landed Cost with Payment Block
-- 1) stock_in_landed_costs table
-- 2) RPC: add_landed_cost
-- =============================================

-- =============================================
-- 1) STOCK_IN_LANDED_COSTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.stock_in_landed_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_in_id UUID NOT NULL REFERENCES public.stock_in(id) ON DELETE CASCADE,
  cost_type TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  allocation_method TEXT NOT NULL DEFAULT 'BY_VALUE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_in_landed_costs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_landed_cost_amount_positive') THEN
    ALTER TABLE public.stock_in_landed_costs ADD CONSTRAINT chk_landed_cost_amount_positive
      CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_landed_cost_allocation_method') THEN
    ALTER TABLE public.stock_in_landed_costs ADD CONSTRAINT chk_landed_cost_allocation_method
      CHECK (allocation_method IN ('BY_VALUE', 'BY_QUANTITY'));
  END IF;
END $$;

DROP POLICY IF EXISTS "landed_cost_select_all" ON public.stock_in_landed_costs;
CREATE POLICY "landed_cost_select_all" ON public.stock_in_landed_costs FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "landed_cost_insert_staff" ON public.stock_in_landed_costs;
CREATE POLICY "landed_cost_insert_staff" ON public.stock_in_landed_costs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "landed_cost_delete_admin" ON public.stock_in_landed_costs;
CREATE POLICY "landed_cost_delete_admin" ON public.stock_in_landed_costs FOR DELETE USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_landed_costs_stock_in ON public.stock_in_landed_costs(stock_in_id);

-- =============================================
-- 2) RPC: add_landed_cost
-- Validates, allocates proportionally, updates batch cost_price & stock_in.total_amount
-- =============================================
CREATE OR REPLACE FUNCTION public.add_landed_cost(
  p_stock_in_id UUID,
  p_cost_type TEXT,
  p_amount NUMERIC,
  p_allocation_method TEXT DEFAULT 'BY_VALUE'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_si RECORD;
  v_landed_cost_id UUID;
  v_total_value NUMERIC(14,2) := 0;
  v_total_quantity NUMERIC(12,2) := 0;
  v_item RECORD;
  v_batch RECORD;
  v_allocation_share NUMERIC(14,6);
  v_allocated_amount NUMERIC(14,2);
  v_batch_quantity NUMERIC(12,2);
  v_new_cost_price NUMERIC(12,2);
  v_has_sales BOOLEAN;
BEGIN
  -- Validate inputs
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be > 0';
  END IF;
  IF p_allocation_method NOT IN ('BY_VALUE', 'BY_QUANTITY') THEN
    RAISE EXCEPTION 'Invalid allocation method: %. Must be BY_VALUE or BY_QUANTITY', p_allocation_method;
  END IF;
  IF p_cost_type IS NULL OR p_cost_type = '' THEN
    RAISE EXCEPTION 'Cost type cannot be empty';
  END IF;

  -- Lock stock_in row
  SELECT * INTO v_si
  FROM public.stock_in
  WHERE id = p_stock_in_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock-in % not found', p_stock_in_id;
  END IF;

  -- Block if CANCELLED
  IF v_si.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Cannot add landed cost to cancelled stock-in';
  END IF;

  -- Block if any payment exists
  IF v_si.amount_paid > 0 THEN
    RAISE EXCEPTION 'Cannot add landed cost: stock-in already has payments (amount_paid = %)', v_si.amount_paid;
  END IF;

  -- Block if any sales exist for batches of this stock_in
  SELECT EXISTS (
    SELECT 1
    FROM public.stock_in_items sii
    JOIN public.inventory_batches ib
      ON ib.warehouse_id = v_si.warehouse_id
      AND ib.product_id = sii.product_id
      AND ib.batch_code = sii.batch_code
      AND ib.expiry_date IS NOT DISTINCT FROM sii.expired_date
    JOIN public.sales_items si ON si.batch_id = ib.id
    JOIN public.sales s ON s.id = si.sale_id AND s.status != 'CANCELLED'
    WHERE sii.stock_in_id = p_stock_in_id
  ) INTO v_has_sales;

  IF v_has_sales THEN
    RAISE EXCEPTION 'Cannot add landed cost: batches from this stock-in have been sold';
  END IF;

  -- Compute totals for allocation
  SELECT COALESCE(SUM(sii.total_price), 0),
         COALESCE(SUM(sii.quantity), 0)
  INTO v_total_value, v_total_quantity
  FROM public.stock_in_items sii
  WHERE sii.stock_in_id = p_stock_in_id;

  IF v_total_quantity = 0 THEN
    RAISE EXCEPTION 'Stock-in has no items to allocate cost to';
  END IF;

  -- Insert landed cost record
  INSERT INTO public.stock_in_landed_costs (stock_in_id, cost_type, amount, allocation_method)
  VALUES (p_stock_in_id, p_cost_type, p_amount, p_allocation_method)
  RETURNING id INTO v_landed_cost_id;

  -- Allocate to each batch proportionally
  FOR v_item IN
    SELECT sii.product_id, sii.batch_code, sii.expired_date, sii.quantity, sii.total_price
    FROM public.stock_in_items sii
    WHERE sii.stock_in_id = p_stock_in_id
  LOOP
    -- Compute allocation share
    IF p_allocation_method = 'BY_VALUE' THEN
      IF v_total_value > 0 THEN
        v_allocation_share := v_item.total_price / v_total_value;
      ELSE
        -- Fallback to equal split if all items have 0 value
        v_allocation_share := 1.0 / v_total_quantity;
      END IF;
    ELSE -- BY_QUANTITY
      v_allocation_share := v_item.quantity / v_total_quantity;
    END IF;

    v_allocated_amount := ROUND(p_amount * v_allocation_share, 2);

    -- Get the matching batch
    SELECT ib.id, ib.cost_price, ib.quantity
    INTO v_batch
    FROM public.inventory_batches ib
    WHERE ib.warehouse_id = v_si.warehouse_id
      AND ib.product_id = v_item.product_id
      AND ib.batch_code = v_item.batch_code
      AND ib.expiry_date IS NOT DISTINCT FROM v_item.expired_date;

    IF FOUND THEN
      -- New cost_price = old cost_price + (allocated_amount / batch original quantity from stock_in_items)
      v_new_cost_price := v_batch.cost_price + ROUND(v_allocated_amount / v_item.quantity, 2);

      UPDATE public.inventory_batches
      SET cost_price = v_new_cost_price,
          updated_at = now()
      WHERE id = v_batch.id;
    END IF;
  END LOOP;

  -- Update stock_in.total_amount
  UPDATE public.stock_in
  SET total_amount = total_amount + p_amount
  WHERE id = p_stock_in_id;

  RETURN v_landed_cost_id;
END;
$$;

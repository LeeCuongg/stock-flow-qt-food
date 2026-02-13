-- =============================================
-- StockFlowQTfood - Phase 2 Migration
-- RPC: create_stock_in + indexes
-- =============================================

-- Add default_cost_price and default_sale_price to products if not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'default_cost_price'
  ) THEN
    ALTER TABLE public.products ADD COLUMN default_cost_price NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'default_sale_price'
  ) THEN
    ALTER TABLE public.products ADD COLUMN default_sale_price NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Backfill: copy existing price to default_sale_price
UPDATE public.products SET default_sale_price = price WHERE default_sale_price = 0 AND price > 0;

-- Add cost_price column to stock_in_items if not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_in_items' AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE public.stock_in_items ADD COLUMN cost_price NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_in_items' AND column_name = 'batch_code'
  ) THEN
    ALTER TABLE public.stock_in_items ADD COLUMN batch_code TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_in_items' AND column_name = 'expired_date'
  ) THEN
    ALTER TABLE public.stock_in_items ADD COLUMN expired_date DATE;
  END IF;
END $$;

-- Add quantity_remaining to inventory_batches if not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_batches' AND column_name = 'quantity_remaining'
  ) THEN
    ALTER TABLE public.inventory_batches ADD COLUMN quantity_remaining NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Backfill quantity_remaining from quantity
UPDATE public.inventory_batches SET quantity_remaining = quantity WHERE quantity_remaining = 0 AND quantity > 0;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_products_warehouse ON public.products(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product ON public.inventory_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_warehouse ON public.inventory_batches(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry ON public.inventory_batches(expiry_date ASC);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_lookup ON public.inventory_batches(warehouse_id, product_id, batch_code, expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_in_warehouse ON public.stock_in(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_in_items_stock_in ON public.stock_in_items(stock_in_id);

-- Unique constraint for upsert in create_stock_in
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_inventory_batch_lookup'
  ) THEN
    ALTER TABLE public.inventory_batches
      ADD CONSTRAINT uq_inventory_batch_lookup
      UNIQUE (warehouse_id, product_id, batch_code, expiry_date);
  END IF;
END $$;

-- =============================================
-- RPC: create_stock_in
-- =============================================
CREATE OR REPLACE FUNCTION public.create_stock_in(
  p_warehouse_id UUID,
  p_supplier_name TEXT,
  p_note TEXT,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_in_id UUID;
  v_total_cost NUMERIC(14,2) := 0;
  v_item JSONB;
  v_product_id UUID;
  v_batch_code TEXT;
  v_expired_date DATE;
  v_quantity NUMERIC(12,2);
  v_cost_price NUMERIC(12,2);
  v_item_total NUMERIC(14,2);
BEGIN
  -- Validate items array
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  -- Create stock_in record
  INSERT INTO public.stock_in (warehouse_id, supplier_name, note, total_amount, created_by)
  VALUES (p_warehouse_id, p_supplier_name, p_note, 0, auth.uid())
  RETURNING id INTO v_stock_in_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_batch_code := v_item ->> 'batch_code';
    v_expired_date := (v_item ->> 'expired_date')::DATE;
    v_quantity := (v_item ->> 'quantity')::NUMERIC;
    v_cost_price := (v_item ->> 'cost_price')::NUMERIC;

    -- Validate
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than 0 for product %', v_product_id;
    END IF;

    IF v_cost_price IS NULL OR v_cost_price < 0 THEN
      RAISE EXCEPTION 'Cost price must be >= 0 for product %', v_product_id;
    END IF;

    IF v_batch_code IS NULL OR v_batch_code = '' THEN
      RAISE EXCEPTION 'Batch code cannot be empty for product %', v_product_id;
    END IF;

    v_item_total := v_quantity * v_cost_price;
    v_total_cost := v_total_cost + v_item_total;

    -- Insert stock_in_item
    INSERT INTO public.stock_in_items (stock_in_id, product_id, batch_code, expired_date, quantity, cost_price, unit_price, total_price)
    VALUES (v_stock_in_id, v_product_id, v_batch_code, v_expired_date, v_quantity, v_cost_price, v_cost_price, v_item_total);

    -- Upsert inventory_batches
    INSERT INTO public.inventory_batches (product_id, warehouse_id, batch_code, expiry_date, quantity, quantity_remaining)
    VALUES (v_product_id, p_warehouse_id, v_batch_code, v_expired_date, v_quantity, v_quantity)
    ON CONFLICT ON CONSTRAINT uq_inventory_batch_lookup
    DO UPDATE SET
      quantity = inventory_batches.quantity + EXCLUDED.quantity,
      quantity_remaining = inventory_batches.quantity_remaining + EXCLUDED.quantity_remaining,
      updated_at = now();
  END LOOP;

  -- Update total_cost on stock_in
  UPDATE public.stock_in SET total_amount = v_total_cost WHERE id = v_stock_in_id;

  RETURN v_stock_in_id;
END;
$$;

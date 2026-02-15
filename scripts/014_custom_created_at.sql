-- =============================================
-- StockFlowQTfood - Phase 14: Custom created_at
-- Cho phép chọn ngày tạo phiếu nhập/xuất
-- =============================================

-- =============================================
-- 1) Update create_stock_in: thêm p_created_at
-- =============================================
CREATE OR REPLACE FUNCTION public.create_stock_in(
  p_warehouse_id UUID,
  p_supplier_name TEXT,
  p_note TEXT,
  p_items JSONB,
  p_supplier_id UUID DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL
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
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  INSERT INTO public.stock_in (warehouse_id, supplier_name, supplier_id, note, total_amount, created_by, created_at)
  VALUES (p_warehouse_id, p_supplier_name, p_supplier_id, p_note, 0, auth.uid(), COALESCE(p_created_at, now()))
  RETURNING id INTO v_stock_in_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_batch_code := v_item ->> 'batch_code';
    v_expired_date := (v_item ->> 'expired_date')::DATE;
    v_quantity := (v_item ->> 'quantity')::NUMERIC;
    v_cost_price := (v_item ->> 'cost_price')::NUMERIC;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be > 0 for product %', v_product_id; END IF;
    IF v_cost_price IS NULL OR v_cost_price < 0 THEN RAISE EXCEPTION 'Cost price must be >= 0 for product %', v_product_id; END IF;
    IF v_batch_code IS NULL OR v_batch_code = '' THEN RAISE EXCEPTION 'Batch code cannot be empty for product %', v_product_id; END IF;

    v_item_total := v_quantity * v_cost_price;
    v_total_cost := v_total_cost + v_item_total;

    INSERT INTO public.stock_in_items (stock_in_id, product_id, batch_code, expired_date, quantity, cost_price, unit_price, total_price)
    VALUES (v_stock_in_id, v_product_id, v_batch_code, v_expired_date, v_quantity, v_cost_price, v_cost_price, v_item_total);

    INSERT INTO public.inventory_batches (product_id, warehouse_id, batch_code, expiry_date, quantity, quantity_remaining, cost_price)
    VALUES (v_product_id, p_warehouse_id, v_batch_code, v_expired_date, v_quantity, v_quantity, v_cost_price)
    ON CONFLICT ON CONSTRAINT uq_inventory_batch_lookup
    DO UPDATE SET
      quantity = inventory_batches.quantity + EXCLUDED.quantity,
      quantity_remaining = inventory_batches.quantity_remaining + EXCLUDED.quantity_remaining,
      cost_price = EXCLUDED.cost_price,
      updated_at = now();
  END LOOP;

  UPDATE public.stock_in SET total_amount = v_total_cost WHERE id = v_stock_in_id;
  RETURN v_stock_in_id;
END;
$$;

-- =============================================
-- 2) Update create_sale: thêm p_created_at
-- =============================================
CREATE OR REPLACE FUNCTION public.create_sale(
  p_warehouse_id UUID,
  p_customer_name TEXT,
  p_note TEXT,
  p_items JSONB,
  p_customer_id UUID DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_total_revenue NUMERIC(14,2) := 0;
  v_total_cost NUMERIC(14,2) := 0;
  v_item JSONB;
  v_product_id UUID;
  v_batch_id UUID;
  v_quantity NUMERIC(12,2);
  v_sale_price NUMERIC(12,2);
  v_batch_cost_price NUMERIC(12,2);
  v_batch_remaining NUMERIC(12,2);
  v_batch_warehouse UUID;
  v_item_revenue NUMERIC(14,2);
  v_item_cost NUMERIC(14,2);
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  INSERT INTO public.sales (warehouse_id, customer_name, customer_id, note, transaction_type, total_amount, total_revenue, total_cost_estimated, profit, created_by, created_at)
  VALUES (p_warehouse_id, p_customer_name, p_customer_id, p_note, 'SALE', 0, 0, 0, 0, auth.uid(), COALESCE(p_created_at, now()))
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_batch_id := (v_item ->> 'batch_id')::UUID;
    v_quantity := (v_item ->> 'quantity')::NUMERIC;
    v_sale_price := (v_item ->> 'sale_price')::NUMERIC;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be > 0 for product %', v_product_id; END IF;
    IF v_sale_price IS NULL OR v_sale_price < 0 THEN RAISE EXCEPTION 'Sale price must be >= 0 for product %', v_product_id; END IF;

    SELECT quantity_remaining, cost_price, warehouse_id
    INTO v_batch_remaining, v_batch_cost_price, v_batch_warehouse
    FROM public.inventory_batches WHERE id = v_batch_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', v_batch_id; END IF;
    IF v_batch_warehouse != p_warehouse_id THEN RAISE EXCEPTION 'Batch % does not belong to warehouse', v_batch_id; END IF;
    IF v_batch_remaining < v_quantity THEN RAISE EXCEPTION 'Insufficient stock for batch %', v_batch_id; END IF;

    v_item_revenue := v_quantity * v_sale_price;
    v_item_cost := v_quantity * v_batch_cost_price;
    v_total_revenue := v_total_revenue + v_item_revenue;
    v_total_cost := v_total_cost + v_item_cost;

    INSERT INTO public.sales_items (sale_id, product_id, batch_id, quantity, unit_price, total_price, sale_price, cost_price)
    VALUES (v_sale_id, v_product_id, v_batch_id, v_quantity, v_sale_price, v_item_revenue, v_sale_price, v_batch_cost_price);

    UPDATE public.inventory_batches SET quantity_remaining = quantity_remaining - v_quantity, updated_at = now() WHERE id = v_batch_id;
  END LOOP;

  UPDATE public.sales
  SET total_amount = v_total_revenue, total_revenue = v_total_revenue, total_cost_estimated = v_total_cost, profit = v_total_revenue - v_total_cost
  WHERE id = v_sale_id;

  RETURN v_sale_id;
END;
$$;

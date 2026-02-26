-- =============================================
-- StockFlowQTfood - Phase 10: Inventory Tolerance System
-- 1) Add tolerance config to products
-- 2) Update create_sale with tolerance logic
-- 3) Update update_sale with tolerance for negative delta
-- 4) Add AUTO_TOLERANCE to loss reasons
-- =============================================

-- =============================================
-- 1) ADD TOLERANCE COLUMNS TO PRODUCTS
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'tolerance_type'
  ) THEN
    ALTER TABLE public.products ADD COLUMN tolerance_type TEXT DEFAULT 'FIXED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'tolerance_value'
  ) THEN
    ALTER TABLE public.products ADD COLUMN tolerance_value NUMERIC(12,4) DEFAULT 0;
  END IF;
END $$;

-- Add check constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_tolerance_type') THEN
    ALTER TABLE public.products ADD CONSTRAINT chk_products_tolerance_type
      CHECK (tolerance_type IN ('FIXED', 'PERCENT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_tolerance_value') THEN
    ALTER TABLE public.products ADD CONSTRAINT chk_products_tolerance_value
      CHECK (tolerance_value >= 0);
  END IF;
END $$;

-- =============================================
-- 2) UPDATE create_sale WITH TOLERANCE LOGIC
-- Returns JSONB instead of UUID to include tolerance info
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
AS $fn$
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
  v_item_note TEXT;
  -- Tolerance variables
  v_tolerance_type TEXT;
  v_tolerance_value NUMERIC(12,4);
  v_allowed NUMERIC(12,4);
  v_delta NUMERIC(12,4);
  v_product_name TEXT;
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
    v_item_note := v_item ->> 'note';

    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be > 0 for product %', v_product_id; END IF;
    IF v_sale_price IS NULL OR v_sale_price < 0 THEN RAISE EXCEPTION 'Sale price must be >= 0 for product %', v_product_id; END IF;

    SELECT quantity_remaining, cost_price, warehouse_id
    INTO v_batch_remaining, v_batch_cost_price, v_batch_warehouse
    FROM public.inventory_batches WHERE id = v_batch_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', v_batch_id; END IF;
    IF v_batch_warehouse != p_warehouse_id THEN RAISE EXCEPTION 'Batch % does not belong to warehouse', v_batch_id; END IF;

    -- TOLERANCE CHECK
    IF v_quantity > v_batch_remaining THEN
      -- Get product tolerance config
      SELECT p.tolerance_type, p.tolerance_value, p.name
      INTO v_tolerance_type, v_tolerance_value, v_product_name
      FROM public.products p WHERE p.id = v_product_id;

      -- Calculate allowed tolerance
      IF v_tolerance_type = 'PERCENT' THEN
        v_allowed := v_batch_remaining * COALESCE(v_tolerance_value, 0) / 100;
      ELSE
        v_allowed := COALESCE(v_tolerance_value, 0);
      END IF;

      v_delta := v_quantity - v_batch_remaining;

      IF v_delta > v_allowed THEN
        -- Exceeds tolerance → block
        RAISE EXCEPTION 'Insufficient stock for batch %. Remaining: %, Requested: %, Tolerance: % (% %)',
          v_batch_id, v_batch_remaining, v_quantity, v_allowed,
          v_tolerance_value, v_tolerance_type;
      END IF;

      -- Within tolerance → auto create loss record
      INSERT INTO public.loss_records (
        warehouse_id, product_id, batch_id, quantity, reason, note,
        cost_price, total_loss_cost, created_by
      ) VALUES (
        p_warehouse_id, v_product_id, v_batch_id, v_delta, 'AUTO_TOLERANCE',
        format('Tự động điều chỉnh sai số %s %s cho %s (tồn: %s, xuất: %s)',
          v_delta,
          (SELECT unit FROM public.products WHERE id = v_product_id),
          v_product_name, v_batch_remaining, v_quantity),
        v_batch_cost_price, v_delta * v_batch_cost_price, auth.uid()
      );

      -- Deduct the tolerance delta from inventory first
      UPDATE public.inventory_batches
      SET quantity_remaining = quantity_remaining - v_delta, updated_at = now()
      WHERE id = v_batch_id;

      -- Refresh remaining after tolerance deduction
      v_batch_remaining := v_batch_remaining - v_delta;
    END IF;

    v_item_revenue := v_quantity * v_sale_price;
    v_item_cost := v_quantity * v_batch_cost_price;
    v_total_revenue := v_total_revenue + v_item_revenue;
    v_total_cost := v_total_cost + v_item_cost;

    INSERT INTO public.sales_items (sale_id, product_id, batch_id, quantity, unit_price, total_price, sale_price, cost_price, note)
    VALUES (v_sale_id, v_product_id, v_batch_id, v_quantity, v_sale_price, v_item_revenue, v_sale_price, v_batch_cost_price, v_item_note);

    -- Deduct the sale quantity from inventory
    UPDATE public.inventory_batches SET quantity_remaining = quantity_remaining - v_quantity, updated_at = now() WHERE id = v_batch_id;

    -- Upsert giá bán theo khách hàng
    IF p_customer_id IS NOT NULL THEN
      INSERT INTO public.customer_product_prices (customer_id, product_id, sale_price, updated_at)
      VALUES (p_customer_id, v_product_id, v_sale_price, now())
      ON CONFLICT (customer_id, product_id)
      DO UPDATE SET sale_price = EXCLUDED.sale_price, updated_at = now();
    END IF;
  END LOOP;

  UPDATE public.sales
  SET total_amount = v_total_revenue, total_revenue = v_total_revenue, total_cost_estimated = v_total_cost, profit = v_total_revenue - v_total_cost
  WHERE id = v_sale_id;

  RETURN v_sale_id;
END;
$fn$;


-- =============================================
-- 3) UPDATE update_sale WITH TOLERANCE FOR NEGATIVE DELTA
-- Only apply tolerance when delta is negative (deducting more stock)
-- =============================================
CREATE OR REPLACE FUNCTION public.update_sale(
  p_sale_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_items JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sale RECORD;
  v_old_items JSONB;
  v_new_total_revenue NUMERIC(14,2) := 0;
  v_new_total_cost NUMERIC(14,2) := 0;
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
  v_revision_number INT;
  v_delta_rec RECORD;
  v_current_remaining NUMERIC(12,2);
  v_effective_customer_id UUID;
  v_item_note TEXT;
  -- Tolerance variables
  v_tolerance_type TEXT;
  v_tolerance_value NUMERIC(12,4);
  v_allowed NUMERIC(12,4);
  v_tol_delta NUMERIC(12,4);
  v_tol_product_id UUID;
  v_product_name TEXT;
  v_tol_cost_price NUMERIC(12,2);
BEGIN
  -- 1. Load and validate
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;
  IF v_sale.status = 'CANCELLED' THEN RAISE EXCEPTION 'Cannot edit a cancelled sale'; END IF;
  IF v_sale.amount_paid > 0 THEN RAISE EXCEPTION 'Cannot edit sale with existing payments (amount_paid = %)', v_sale.amount_paid; END IF;

  v_effective_customer_id := COALESCE(p_customer_id, v_sale.customer_id);

  -- 2. Snapshot old items
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', si.product_id, 'batch_id', si.batch_id,
    'quantity', si.quantity, 'sale_price', si.sale_price, 'cost_price', si.cost_price, 'note', si.note
  )), '[]'::JSONB) INTO v_old_items
  FROM public.sales_items si WHERE si.sale_id = p_sale_id;

  -- Header-only update
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    UPDATE public.sales SET customer_id = COALESCE(p_customer_id, customer_id), note = COALESCE(p_note, note) WHERE id = p_sale_id;
    RETURN p_sale_id;
  END IF;

  -- 3. Create temp tables
  CREATE TEMP TABLE _old_sale ON COMMIT DROP AS
    SELECT si.batch_id, SUM(si.quantity) AS qty
    FROM public.sales_items si WHERE si.sale_id = p_sale_id
    GROUP BY si.batch_id;

  CREATE TEMP TABLE _new_sale ON COMMIT DROP AS SELECT NULL::UUID AS batch_id, NULL::NUMERIC AS qty WHERE false;

  -- 4. Parse + validate new items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_batch_id := (v_item ->> 'batch_id')::UUID;
    v_quantity := (v_item ->> 'quantity')::NUMERIC;
    v_sale_price := (v_item ->> 'sale_price')::NUMERIC;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be > 0 for product %', v_product_id; END IF;
    IF v_sale_price IS NULL OR v_sale_price < 0 THEN RAISE EXCEPTION 'Sale price must be >= 0 for product %', v_product_id; END IF;

    SELECT quantity_remaining, cost_price, warehouse_id INTO v_batch_remaining, v_batch_cost_price, v_batch_warehouse
    FROM public.inventory_batches WHERE id = v_batch_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', v_batch_id; END IF;
    IF v_batch_warehouse != v_sale.warehouse_id THEN RAISE EXCEPTION 'Batch % does not belong to warehouse', v_batch_id; END IF;

    INSERT INTO _new_sale VALUES (v_batch_id, v_quantity);

    v_item_revenue := v_quantity * v_sale_price;
    v_item_cost := v_quantity * v_batch_cost_price;
    v_new_total_revenue := v_new_total_revenue + v_item_revenue;
    v_new_total_cost := v_new_total_cost + v_item_cost;
  END LOOP;

  -- 5. Compute and apply deltas with tolerance
  FOR v_delta_rec IN
    SELECT
      COALESCE(o.batch_id, n.batch_id) AS batch_id,
      COALESCE(o.qty, 0) - COALESCE(n.total_qty, 0) AS delta
    FROM _old_sale o
    FULL OUTER JOIN (SELECT batch_id, SUM(qty) AS total_qty FROM _new_sale GROUP BY batch_id) n ON o.batch_id = n.batch_id
    WHERE COALESCE(o.qty, 0) - COALESCE(n.total_qty, 0) != 0
  LOOP
    SELECT quantity_remaining, cost_price, product_id
    INTO v_current_remaining, v_tol_cost_price, v_tol_product_id
    FROM public.inventory_batches WHERE id = v_delta_rec.batch_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory batch % not found', v_delta_rec.batch_id; END IF;

    IF v_current_remaining + v_delta_rec.delta < 0 THEN
      -- delta is negative (deducting more), check tolerance
      -- Only apply tolerance for negative delta (xuất thêm)
      IF v_delta_rec.delta < 0 THEN
        v_tol_delta := ABS(v_current_remaining + v_delta_rec.delta); -- how much we're short

        SELECT p.tolerance_type, p.tolerance_value, p.name
        INTO v_tolerance_type, v_tolerance_value, v_product_name
        FROM public.products p WHERE p.id = v_tol_product_id;

        IF v_tolerance_type = 'PERCENT' THEN
          v_allowed := v_current_remaining * COALESCE(v_tolerance_value, 0) / 100;
        ELSE
          v_allowed := COALESCE(v_tolerance_value, 0);
        END IF;

        IF v_tol_delta > v_allowed THEN
          RAISE EXCEPTION 'Negative inventory: batch % has % remaining, cannot deduct %. Tolerance: % (% %)',
            v_delta_rec.batch_id, v_current_remaining, ABS(v_delta_rec.delta),
            v_allowed, v_tolerance_value, v_tolerance_type;
        END IF;

        -- Within tolerance → auto create loss record
        INSERT INTO public.loss_records (
          warehouse_id, product_id, batch_id, quantity, reason, note,
          cost_price, total_loss_cost, created_by
        ) VALUES (
          v_sale.warehouse_id, v_tol_product_id, v_delta_rec.batch_id, v_tol_delta, 'AUTO_TOLERANCE',
          format('Tự động điều chỉnh sai số %s khi sửa đơn %s (tồn: %s, cần thêm: %s)',
            v_tol_delta, p_sale_id, v_current_remaining, ABS(v_delta_rec.delta)),
          v_tol_cost_price, v_tol_delta * v_tol_cost_price, auth.uid()
        );

        -- Deduct tolerance delta first
        UPDATE public.inventory_batches
        SET quantity_remaining = quantity_remaining - v_tol_delta, updated_at = now()
        WHERE id = v_delta_rec.batch_id;

        -- Refresh remaining
        v_current_remaining := v_current_remaining - v_tol_delta;
      ELSE
        RAISE EXCEPTION 'Negative inventory: batch % has % remaining, cannot deduct %',
          v_delta_rec.batch_id, v_current_remaining, ABS(v_delta_rec.delta);
      END IF;
    END IF;

    UPDATE public.inventory_batches SET quantity_remaining = quantity_remaining + v_delta_rec.delta, updated_at = now()
    WHERE id = v_delta_rec.batch_id;
  END LOOP;

  -- 6. Replace items
  DELETE FROM public.sales_items WHERE sale_id = p_sale_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_batch_id := (v_item ->> 'batch_id')::UUID;
    v_quantity := (v_item ->> 'quantity')::NUMERIC;
    v_sale_price := (v_item ->> 'sale_price')::NUMERIC;
    v_item_note := v_item ->> 'note';

    SELECT cost_price INTO v_batch_cost_price FROM public.inventory_batches WHERE id = v_batch_id;
    v_item_revenue := v_quantity * v_sale_price;
    v_item_cost := v_quantity * v_batch_cost_price;

    INSERT INTO public.sales_items (sale_id, product_id, batch_id, quantity, unit_price, total_price, sale_price, cost_price, note)
    VALUES (p_sale_id, v_product_id, v_batch_id, v_quantity, v_sale_price, v_item_revenue, v_sale_price, v_batch_cost_price, v_item_note);

    -- Upsert giá bán theo khách hàng
    IF v_effective_customer_id IS NOT NULL THEN
      INSERT INTO public.customer_product_prices (customer_id, product_id, sale_price, updated_at)
      VALUES (v_effective_customer_id, v_product_id, v_sale_price, now())
      ON CONFLICT (customer_id, product_id)
      DO UPDATE SET sale_price = EXCLUDED.sale_price, updated_at = now();
    END IF;
  END LOOP;

  -- 7. Update header
  UPDATE public.sales
  SET customer_id = COALESCE(p_customer_id, customer_id), note = COALESCE(p_note, note),
      total_amount = v_new_total_revenue, total_revenue = v_new_total_revenue,
      total_cost_estimated = v_new_total_cost, profit = v_new_total_revenue - v_new_total_cost
  WHERE id = p_sale_id;

  -- 8. Revision log
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_revision_number FROM public.document_revisions WHERE document_type = 'SALE' AND document_id = p_sale_id;
  INSERT INTO public.document_revisions (document_type, document_id, revision_number, reason, old_data, new_data, changed_by)
  VALUES ('SALE', p_sale_id, v_revision_number, COALESCE(p_note, 'Edit sale'),
    jsonb_build_object('customer_id', v_sale.customer_id, 'note', v_sale.note, 'total_revenue', v_sale.total_revenue, 'total_cost_estimated', v_sale.total_cost_estimated, 'profit', v_sale.profit, 'items', v_old_items),
    jsonb_build_object('customer_id', COALESCE(p_customer_id, v_sale.customer_id), 'note', COALESCE(p_note, v_sale.note), 'total_revenue', v_new_total_revenue, 'total_cost_estimated', v_new_total_cost, 'profit', v_new_total_revenue - v_new_total_cost, 'items', p_items),
    auth.uid());

  DROP TABLE IF EXISTS _old_sale;
  DROP TABLE IF EXISTS _new_sale;
  RETURN p_sale_id;
END;
$fn$;

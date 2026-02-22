-- =============================================
-- Thêm ghi chú cho từng sản phẩm trong đơn bán (sales_items.note)
-- =============================================

-- 1) Thêm cột note vào sales_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_items' AND column_name = 'note'
  ) THEN
    ALTER TABLE public.sales_items ADD COLUMN note TEXT;
  END IF;
END $$;

-- 2) Cập nhật create_sale: đọc note từ item JSON
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
    IF v_batch_remaining < v_quantity THEN RAISE EXCEPTION 'Insufficient stock for batch %', v_batch_id; END IF;

    v_item_revenue := v_quantity * v_sale_price;
    v_item_cost := v_quantity * v_batch_cost_price;
    v_total_revenue := v_total_revenue + v_item_revenue;
    v_total_cost := v_total_cost + v_item_cost;

    INSERT INTO public.sales_items (sale_id, product_id, batch_id, quantity, unit_price, total_price, sale_price, cost_price, note)
    VALUES (v_sale_id, v_product_id, v_batch_id, v_quantity, v_sale_price, v_item_revenue, v_sale_price, v_batch_cost_price, v_item_note);

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

-- 3) Cập nhật update_sale: đọc note từ item JSON
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

  -- 5. Compute and apply deltas
  FOR v_delta_rec IN
    SELECT
      COALESCE(o.batch_id, n.batch_id) AS batch_id,
      COALESCE(o.qty, 0) - COALESCE(n.total_qty, 0) AS delta
    FROM _old_sale o
    FULL OUTER JOIN (SELECT batch_id, SUM(qty) AS total_qty FROM _new_sale GROUP BY batch_id) n ON o.batch_id = n.batch_id
    WHERE COALESCE(o.qty, 0) - COALESCE(n.total_qty, 0) != 0
  LOOP
    SELECT quantity_remaining INTO v_current_remaining FROM public.inventory_batches WHERE id = v_delta_rec.batch_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory batch % not found', v_delta_rec.batch_id; END IF;

    IF v_current_remaining + v_delta_rec.delta < 0 THEN
      RAISE EXCEPTION 'Negative inventory: batch % has % remaining, cannot deduct %',
        v_delta_rec.batch_id, v_current_remaining, ABS(v_delta_rec.delta);
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

-- =============================================
-- Phần nhập kho: Thêm ghi chú cho từng sản phẩm trong phiếu nhập (stock_in_items.note)
-- =============================================

-- 4) Thêm cột note vào stock_in_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_in_items' AND column_name = 'note'
  ) THEN
    ALTER TABLE public.stock_in_items ADD COLUMN note TEXT;
  END IF;
END $$;

-- 5) Cập nhật create_stock_in: đọc note từ item JSON + khôi phục upsert supplier_product_prices
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
AS $fn$
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
  v_item_note TEXT;
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
    v_item_note := v_item ->> 'note';

    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be > 0 for product %', v_product_id; END IF;
    IF v_cost_price IS NULL OR v_cost_price < 0 THEN RAISE EXCEPTION 'Cost price must be >= 0 for product %', v_product_id; END IF;
    IF v_batch_code IS NULL OR v_batch_code = '' THEN RAISE EXCEPTION 'Batch code cannot be empty for product %', v_product_id; END IF;

    v_item_total := v_quantity * v_cost_price;
    v_total_cost := v_total_cost + v_item_total;

    INSERT INTO public.stock_in_items (stock_in_id, product_id, batch_code, expired_date, quantity, cost_price, unit_price, total_price, note)
    VALUES (v_stock_in_id, v_product_id, v_batch_code, v_expired_date, v_quantity, v_cost_price, v_cost_price, v_item_total, v_item_note);

    INSERT INTO public.inventory_batches (product_id, warehouse_id, batch_code, expiry_date, quantity, quantity_remaining, cost_price)
    VALUES (v_product_id, p_warehouse_id, v_batch_code, v_expired_date, v_quantity, v_quantity, v_cost_price)
    ON CONFLICT ON CONSTRAINT uq_inventory_batch_lookup
    DO UPDATE SET
      quantity = inventory_batches.quantity + EXCLUDED.quantity,
      quantity_remaining = inventory_batches.quantity_remaining + EXCLUDED.quantity_remaining,
      cost_price = EXCLUDED.cost_price,
      updated_at = now();

    -- Upsert giá nhập theo NCC
    IF p_supplier_id IS NOT NULL THEN
      INSERT INTO public.supplier_product_prices (supplier_id, product_id, cost_price, updated_at)
      VALUES (p_supplier_id, v_product_id, v_cost_price, now())
      ON CONFLICT (supplier_id, product_id)
      DO UPDATE SET cost_price = EXCLUDED.cost_price, updated_at = now();
    END IF;
  END LOOP;

  UPDATE public.stock_in SET total_amount = v_total_cost WHERE id = v_stock_in_id;
  RETURN v_stock_in_id;
END;
$fn$;

-- 6) Cập nhật update_stock_in: đọc note từ item JSON
CREATE OR REPLACE FUNCTION public.update_stock_in(
  p_stock_in_id UUID,
  p_supplier_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_items JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_si RECORD;
  v_old_items JSONB;
  v_new_total_cost NUMERIC(14,2) := 0;
  v_item JSONB;
  v_product_id UUID;
  v_batch_code TEXT;
  v_expired_date DATE;
  v_quantity NUMERIC(12,2);
  v_cost_price NUMERIC(12,2);
  v_item_total NUMERIC(14,2);
  v_revision_number INT;
  v_delta_rec RECORD;
  v_current_remaining NUMERIC(12,2);
  v_item_note TEXT;
BEGIN
  -- 1. Load and validate
  SELECT * INTO v_si FROM public.stock_in WHERE id = p_stock_in_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock-in % not found', p_stock_in_id; END IF;
  IF v_si.status = 'CANCELLED' THEN RAISE EXCEPTION 'Cannot edit a cancelled stock-in'; END IF;
  IF v_si.amount_paid > 0 THEN RAISE EXCEPTION 'Cannot edit stock-in with existing payments (amount_paid = %)', v_si.amount_paid; END IF;

  -- 2. Snapshot old items
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', sii.product_id, 'batch_code', sii.batch_code,
    'expired_date', sii.expired_date, 'quantity', sii.quantity, 'cost_price', sii.cost_price, 'note', sii.note
  )), '[]'::JSONB) INTO v_old_items
  FROM public.stock_in_items sii WHERE sii.stock_in_id = p_stock_in_id;

  -- Header-only update
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    UPDATE public.stock_in SET supplier_id = COALESCE(p_supplier_id, supplier_id), note = COALESCE(p_note, note) WHERE id = p_stock_in_id;
    RETURN p_stock_in_id;
  END IF;

  -- 3. Create temp tables for old and new
  CREATE TEMP TABLE _old_si ON COMMIT DROP AS
    SELECT sii.product_id, sii.batch_code, sii.expired_date, SUM(sii.quantity) AS qty
    FROM public.stock_in_items sii WHERE sii.stock_in_id = p_stock_in_id
    GROUP BY sii.product_id, sii.batch_code, sii.expired_date;

  CREATE TEMP TABLE _new_si ON COMMIT DROP AS SELECT NULL::UUID AS product_id, NULL::TEXT AS batch_code, NULL::DATE AS expired_date, NULL::NUMERIC AS qty, NULL::NUMERIC AS cost WHERE false;

  -- 4. Parse + validate new items, insert into temp
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

    INSERT INTO _new_si VALUES (v_product_id, v_batch_code, v_expired_date, v_quantity, v_cost_price);
    v_new_total_cost := v_new_total_cost + (v_quantity * v_cost_price);
  END LOOP;

  -- 5. Compute and apply deltas using FULL OUTER JOIN
  FOR v_delta_rec IN
    SELECT
      COALESCE(n.product_id, o.product_id) AS product_id,
      COALESCE(n.batch_code, o.batch_code) AS batch_code,
      COALESCE(n.expired_date, o.expired_date) AS expired_date,
      COALESCE(n.total_qty, 0) - COALESCE(o.qty, 0) AS delta
    FROM (SELECT product_id, batch_code, expired_date, SUM(qty) AS total_qty FROM _new_si GROUP BY product_id, batch_code, expired_date) n
    FULL OUTER JOIN _old_si o ON n.product_id = o.product_id
      AND n.batch_code IS NOT DISTINCT FROM o.batch_code
      AND n.expired_date IS NOT DISTINCT FROM o.expired_date
    WHERE COALESCE(n.total_qty, 0) - COALESCE(o.qty, 0) != 0
  LOOP
    IF v_delta_rec.delta > 0 THEN
      INSERT INTO public.inventory_batches (product_id, warehouse_id, batch_code, expiry_date, quantity, quantity_remaining, cost_price)
      VALUES (v_delta_rec.product_id, v_si.warehouse_id, v_delta_rec.batch_code, v_delta_rec.expired_date, v_delta_rec.delta, v_delta_rec.delta, 0)
      ON CONFLICT ON CONSTRAINT uq_inventory_batch_lookup
      DO UPDATE SET
        quantity = inventory_batches.quantity + v_delta_rec.delta,
        quantity_remaining = inventory_batches.quantity_remaining + v_delta_rec.delta,
        updated_at = now();
    ELSE
      SELECT quantity_remaining INTO v_current_remaining FROM public.inventory_batches
      WHERE warehouse_id = v_si.warehouse_id AND product_id = v_delta_rec.product_id
        AND batch_code = v_delta_rec.batch_code AND expiry_date IS NOT DISTINCT FROM v_delta_rec.expired_date;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found: product %, batch %', v_delta_rec.product_id, v_delta_rec.batch_code;
      END IF;
      IF v_current_remaining + v_delta_rec.delta < 0 THEN
        RAISE EXCEPTION 'Negative inventory: batch % has % remaining, cannot reduce by %',
          v_delta_rec.batch_code, v_current_remaining, ABS(v_delta_rec.delta);
      END IF;

      UPDATE public.inventory_batches
      SET quantity = quantity + v_delta_rec.delta, quantity_remaining = quantity_remaining + v_delta_rec.delta, updated_at = now()
      WHERE warehouse_id = v_si.warehouse_id AND product_id = v_delta_rec.product_id
        AND batch_code = v_delta_rec.batch_code AND expiry_date IS NOT DISTINCT FROM v_delta_rec.expired_date;
    END IF;
  END LOOP;

  -- 6. Replace items
  DELETE FROM public.stock_in_items WHERE stock_in_id = p_stock_in_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_batch_code := v_item ->> 'batch_code';
    v_expired_date := (v_item ->> 'expired_date')::DATE;
    v_quantity := (v_item ->> 'quantity')::NUMERIC;
    v_cost_price := (v_item ->> 'cost_price')::NUMERIC;
    v_item_note := v_item ->> 'note';
    v_item_total := v_quantity * v_cost_price;

    INSERT INTO public.stock_in_items (stock_in_id, product_id, batch_code, expired_date, quantity, cost_price, unit_price, total_price, note)
    VALUES (p_stock_in_id, v_product_id, v_batch_code, v_expired_date, v_quantity, v_cost_price, v_cost_price, v_item_total, v_item_note);

    UPDATE public.inventory_batches SET cost_price = v_cost_price, updated_at = now()
    WHERE warehouse_id = v_si.warehouse_id AND product_id = v_product_id
      AND batch_code = v_batch_code AND expiry_date IS NOT DISTINCT FROM v_expired_date;
  END LOOP;

  -- 7. Update header
  UPDATE public.stock_in SET supplier_id = COALESCE(p_supplier_id, supplier_id), note = COALESCE(p_note, note), total_amount = v_new_total_cost WHERE id = p_stock_in_id;

  -- 8. Revision log
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_revision_number FROM public.document_revisions WHERE document_type = 'STOCK_IN' AND document_id = p_stock_in_id;
  INSERT INTO public.document_revisions (document_type, document_id, revision_number, reason, old_data, new_data, changed_by)
  VALUES ('STOCK_IN', p_stock_in_id, v_revision_number, COALESCE(p_note, 'Edit stock-in'),
    jsonb_build_object('supplier_id', v_si.supplier_id, 'note', v_si.note, 'total_amount', v_si.total_amount, 'items', v_old_items),
    jsonb_build_object('supplier_id', COALESCE(p_supplier_id, v_si.supplier_id), 'note', COALESCE(p_note, v_si.note), 'total_amount', v_new_total_cost, 'items', p_items),
    auth.uid());

  DROP TABLE IF EXISTS _old_si;
  DROP TABLE IF EXISTS _new_si;
  RETURN p_stock_in_id;
END;
$fn$;

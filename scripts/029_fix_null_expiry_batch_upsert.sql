-- =============================================
-- StockFlowQTfood - Phase 29: Fix NULL expiry_date batch duplication
-- =============================================
-- BUG: UNIQUE constraint uq_inventory_batch_lookup (warehouse_id, product_id, batch_code, expiry_date)
--      treats NULL != NULL in PostgreSQL.  So ON CONFLICT never fires for batches
--      without an expiry date, creating duplicate rows on every upsert.
--
-- FIX:
--   1) Merge existing duplicate inventory_batches (same key but expiry_date IS NULL)
--   2) Replace the constraint with a UNIQUE INDEX using COALESCE so NULLs match
--   3) Recreate create_stock_in  → explicit check + INSERT/UPDATE
--   4) Recreate update_stock_in → explicit check + INSERT/UPDATE
-- =============================================

-- =============================================
-- 1) MERGE EXISTING DUPLICATE BATCHES (expiry_date IS NULL)
-- =============================================
DO $$
DECLARE
  v_dup RECORD;
  v_keep_id UUID;
  v_dead_id UUID;
BEGIN
  -- Find groups with duplicates where expiry_date IS NULL
  FOR v_dup IN
    SELECT warehouse_id, product_id, batch_code,
           SUM(quantity) AS total_qty,
           SUM(quantity_remaining) AS total_remaining,
           MAX(cost_price) AS max_cost_price,
           COUNT(*) AS cnt
    FROM public.inventory_batches
    WHERE expiry_date IS NULL
    GROUP BY warehouse_id, product_id, batch_code
    HAVING COUNT(*) > 1
  LOOP
    -- Keep the oldest row (smallest id / first created)
    SELECT id INTO v_keep_id
    FROM public.inventory_batches
    WHERE warehouse_id = v_dup.warehouse_id
      AND product_id = v_dup.product_id
      AND batch_code = v_dup.batch_code
      AND expiry_date IS NULL
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    -- Re-point all FK references from duplicate rows to the kept row
    FOR v_dead_id IN
      SELECT id FROM public.inventory_batches
      WHERE warehouse_id = v_dup.warehouse_id
        AND product_id = v_dup.product_id
        AND batch_code = v_dup.batch_code
        AND expiry_date IS NULL
        AND id != v_keep_id
    LOOP
      UPDATE public.sales_items    SET batch_id = v_keep_id WHERE batch_id = v_dead_id;
      UPDATE public.loss_records   SET batch_id = v_keep_id WHERE batch_id = v_dead_id;
      UPDATE public.stock_in_items SET batch_id = v_keep_id WHERE batch_id = v_dead_id;
    END LOOP;

    -- Merge totals into the kept row
    UPDATE public.inventory_batches
    SET quantity = v_dup.total_qty,
        quantity_remaining = v_dup.total_remaining,
        cost_price = v_dup.max_cost_price,
        updated_at = now()
    WHERE id = v_keep_id;

    -- Delete the duplicate rows (now safe – no FK references remain)
    DELETE FROM public.inventory_batches
    WHERE warehouse_id = v_dup.warehouse_id
      AND product_id = v_dup.product_id
      AND batch_code = v_dup.batch_code
      AND expiry_date IS NULL
      AND id != v_keep_id;

    RAISE NOTICE 'Merged % duplicate batch rows for batch_code=% product=%',
      v_dup.cnt, v_dup.batch_code, v_dup.product_id;
  END LOOP;
END $$;

-- =============================================
-- 2) REPLACE CONSTRAINT WITH NULL-SAFE UNIQUE INDEX
-- =============================================
-- Drop old constraint (allows NULL duplicates)
ALTER TABLE public.inventory_batches DROP CONSTRAINT IF EXISTS uq_inventory_batch_lookup;

-- Create new unique index with COALESCE so NULL expiry_dates are treated as equal
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_batch_lookup
  ON public.inventory_batches (warehouse_id, product_id, batch_code, COALESCE(expiry_date, '1900-01-01'::date));


-- =============================================
-- 3) RECREATE create_stock_in  (explicit upsert, no ON CONFLICT)
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
  v_existing_id UUID;
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

    -- NULL-safe upsert for inventory_batches
    SELECT id INTO v_existing_id FROM public.inventory_batches
    WHERE warehouse_id = p_warehouse_id
      AND product_id = v_product_id
      AND batch_code = v_batch_code
      AND expiry_date IS NOT DISTINCT FROM v_expired_date;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.inventory_batches
      SET quantity = quantity + v_quantity,
          quantity_remaining = quantity_remaining + v_quantity,
          cost_price = v_cost_price,
          updated_at = now()
      WHERE id = v_existing_id;
    ELSE
      INSERT INTO public.inventory_batches (product_id, warehouse_id, batch_code, expiry_date, quantity, quantity_remaining, cost_price)
      VALUES (v_product_id, p_warehouse_id, v_batch_code, v_expired_date, v_quantity, v_quantity, v_cost_price);
    END IF;

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


-- =============================================
-- 4) RECREATE update_stock_in (explicit upsert, no ON CONFLICT)
-- =============================================
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
  v_existing_id UUID;
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
      -- NULL-safe upsert: check existence first
      SELECT id INTO v_existing_id FROM public.inventory_batches
      WHERE warehouse_id = v_si.warehouse_id
        AND product_id = v_delta_rec.product_id
        AND batch_code = v_delta_rec.batch_code
        AND expiry_date IS NOT DISTINCT FROM v_delta_rec.expired_date;

      IF v_existing_id IS NOT NULL THEN
        UPDATE public.inventory_batches
        SET quantity = quantity + v_delta_rec.delta,
            quantity_remaining = quantity_remaining + v_delta_rec.delta,
            updated_at = now()
        WHERE id = v_existing_id;
      ELSE
        INSERT INTO public.inventory_batches (product_id, warehouse_id, batch_code, expiry_date, quantity, quantity_remaining, cost_price)
        VALUES (v_delta_rec.product_id, v_si.warehouse_id, v_delta_rec.batch_code, v_delta_rec.expired_date, v_delta_rec.delta, v_delta_rec.delta, 0);
      END IF;
    ELSE
      -- Less stock in: validate no negative
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

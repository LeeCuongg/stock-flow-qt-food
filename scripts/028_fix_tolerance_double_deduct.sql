-- =============================================
-- StockFlowQTfood - Phase 28: Fix Tolerance Double Deduct
-- 1) Link AUTO_TOLERANCE losses to sale documents
-- 2) Prevent negative inventory / double deduct in create_sale
-- 3) Rework update_sale to restore and reapply actual consumed stock
-- 4) Cancel linked AUTO_TOLERANCE losses safely on cancel_sale / cancel_loss_record
-- =============================================

-- 1) Link tolerance losses to the originating sale
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'loss_records'
      AND column_name = 'source_sale_id'
  ) THEN
    ALTER TABLE public.loss_records
      ADD COLUMN source_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_loss_records_source_sale ON public.loss_records(source_sale_id);
CREATE INDEX IF NOT EXISTS idx_loss_records_source_sale_reason_status
  ON public.loss_records(source_sale_id, reason, status);


-- 2) Fix create_sale: AUTO_TOLERANCE compensates by ADDING delta to inventory, sale deducts full amount
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
  v_tolerance_type TEXT;
  v_tolerance_value NUMERIC(12,4);
  v_allowed NUMERIC(12,4);
  v_delta NUMERIC(12,4);
  v_product_name TEXT;
  v_inventory_deduct NUMERIC(12,2);
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  INSERT INTO public.sales (
    warehouse_id,
    customer_name,
    customer_id,
    note,
    transaction_type,
    total_amount,
    total_revenue,
    total_cost_estimated,
    profit,
    created_by,
    created_at
  )
  VALUES (
    p_warehouse_id,
    p_customer_name,
    p_customer_id,
    p_note,
    'SALE',
    0,
    0,
    0,
    0,
    auth.uid(),
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_batch_id := (v_item ->> 'batch_id')::UUID;
    v_quantity := (v_item ->> 'quantity')::NUMERIC;
    v_sale_price := (v_item ->> 'sale_price')::NUMERIC;
    v_item_note := v_item ->> 'note';
    v_delta := 0;
    v_inventory_deduct := v_quantity;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be > 0 for product %', v_product_id;
    END IF;
    IF v_sale_price IS NULL OR v_sale_price < 0 THEN
      RAISE EXCEPTION 'Sale price must be >= 0 for product %', v_product_id;
    END IF;

    SELECT quantity_remaining, cost_price, warehouse_id
    INTO v_batch_remaining, v_batch_cost_price, v_batch_warehouse
    FROM public.inventory_batches
    WHERE id = v_batch_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % not found', v_batch_id;
    END IF;
    IF v_batch_warehouse != p_warehouse_id THEN
      RAISE EXCEPTION 'Batch % does not belong to warehouse', v_batch_id;
    END IF;

    IF v_quantity > v_batch_remaining THEN
      SELECT p.tolerance_type, p.tolerance_value, p.name
      INTO v_tolerance_type, v_tolerance_value, v_product_name
      FROM public.products p
      WHERE p.id = v_product_id;

      IF v_tolerance_type = 'PERCENT' THEN
        v_allowed := v_batch_remaining * COALESCE(v_tolerance_value, 0) / 100;
      ELSE
        v_allowed := COALESCE(v_tolerance_value, 0);
      END IF;

      v_delta := v_quantity - v_batch_remaining;

      IF v_delta > v_allowed THEN
        RAISE EXCEPTION 'Insufficient stock for batch %. Remaining: %, Requested: %, Tolerance: % (% %)',
          v_batch_id, v_batch_remaining, v_quantity, v_allowed,
          v_tolerance_value, v_tolerance_type;
      END IF;

      INSERT INTO public.loss_records (
        warehouse_id,
        product_id,
        batch_id,
        quantity,
        reason,
        note,
        cost_price,
        total_loss_cost,
        created_by,
        source_sale_id
      )
      VALUES (
        p_warehouse_id,
        v_product_id,
        v_batch_id,
        v_delta,
        'AUTO_TOLERANCE',
        format('Bù sai số tự động: +%s %s cho %s (tồn: %s, xuất: %s, sale_id: %s)',
          v_delta,
          (SELECT unit FROM public.products WHERE id = v_product_id),
          v_product_name,
          v_batch_remaining,
          v_quantity,
          v_sale_id),
        v_batch_cost_price,
        v_delta * v_batch_cost_price,
        auth.uid(),
        v_sale_id
      );

      -- AUTO_TOLERANCE compensates: add v_delta to inventory so sale can deduct full v_quantity
      -- Net: -(v_quantity) + v_delta = -(v_quantity - v_delta) = -v_batch_remaining → 0
      UPDATE public.inventory_batches
      SET quantity_remaining = quantity_remaining + v_delta,
          updated_at = now()
      WHERE id = v_batch_id;
      -- v_inventory_deduct stays as v_quantity (full sale amount)
    END IF;

    v_item_revenue := v_quantity * v_sale_price;
    v_item_cost := v_quantity * v_batch_cost_price;
    v_total_revenue := v_total_revenue + v_item_revenue;
    v_total_cost := v_total_cost + v_item_cost;

    INSERT INTO public.sales_items (
      sale_id,
      product_id,
      batch_id,
      quantity,
      unit_price,
      total_price,
      sale_price,
      cost_price,
      note
    )
    VALUES (
      v_sale_id,
      v_product_id,
      v_batch_id,
      v_quantity,
      v_sale_price,
      v_item_revenue,
      v_sale_price,
      v_batch_cost_price,
      v_item_note
    );

    UPDATE public.inventory_batches
    SET quantity_remaining = quantity_remaining - v_inventory_deduct,
        updated_at = now()
    WHERE id = v_batch_id;

    IF p_customer_id IS NOT NULL THEN
      INSERT INTO public.customer_product_prices (customer_id, product_id, sale_price, updated_at)
      VALUES (p_customer_id, v_product_id, v_sale_price, now())
      ON CONFLICT (customer_id, product_id)
      DO UPDATE SET sale_price = EXCLUDED.sale_price, updated_at = now();
    END IF;
  END LOOP;

  UPDATE public.sales
  SET total_amount = v_total_revenue,
      total_revenue = v_total_revenue,
      total_cost_estimated = v_total_cost,
      profit = v_total_revenue - v_total_cost
  WHERE id = v_sale_id;

  RETURN v_sale_id;
END;
$fn$;


-- 3) Fix update_sale: restore full sale + undo tolerance compensation, then reapply items
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
  v_effective_customer_id UUID;
  v_item_note TEXT;
  v_tolerance_type TEXT;
  v_tolerance_value NUMERIC(12,4);
  v_allowed NUMERIC(12,4);
  v_delta NUMERIC(12,4);
  v_product_name TEXT;
  v_inventory_deduct NUMERIC(12,2);
  v_restore RECORD;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found', p_sale_id;
  END IF;
  IF v_sale.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Cannot edit a cancelled sale';
  END IF;
  IF v_sale.amount_paid > 0 THEN
    RAISE EXCEPTION 'Cannot edit sale with existing payments (amount_paid = %)', v_sale.amount_paid;
  END IF;

  v_effective_customer_id := COALESCE(p_customer_id, v_sale.customer_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', si.product_id,
    'batch_id', si.batch_id,
    'quantity', si.quantity,
    'sale_price', si.sale_price,
    'cost_price', si.cost_price,
    'note', si.note
  )), '[]'::JSONB)
  INTO v_old_items
  FROM public.sales_items si
  WHERE si.sale_id = p_sale_id;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    UPDATE public.sales
    SET customer_id = COALESCE(p_customer_id, customer_id),
        note = COALESCE(p_note, note)
    WHERE id = p_sale_id;
    RETURN p_sale_id;
  END IF;

  FOR v_restore IN
    SELECT
      si.batch_id,
      SUM(si.quantity) AS sale_qty,
      COALESCE((
        SELECT SUM(lr.quantity)
        FROM public.loss_records lr
        WHERE lr.source_sale_id = p_sale_id
          AND lr.batch_id = si.batch_id
          AND lr.reason = 'AUTO_TOLERANCE'
          AND COALESCE(lr.status, 'ACTIVE') != 'CANCELLED'
      ), 0) AS tolerance_qty
    FROM public.sales_items si
    WHERE si.sale_id = p_sale_id
    GROUP BY si.batch_id
  LOOP
    UPDATE public.inventory_batches
    SET quantity_remaining = quantity_remaining + GREATEST(v_restore.sale_qty - v_restore.tolerance_qty, 0),
        updated_at = now()
    WHERE id = v_restore.batch_id;
  END LOOP;

  UPDATE public.loss_records
  SET status = 'CANCELLED'
  WHERE source_sale_id = p_sale_id
    AND reason = 'AUTO_TOLERANCE'
    AND COALESCE(status, 'ACTIVE') != 'CANCELLED';

  DELETE FROM public.sales_items WHERE sale_id = p_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_batch_id := (v_item ->> 'batch_id')::UUID;
    v_quantity := (v_item ->> 'quantity')::NUMERIC;
    v_sale_price := (v_item ->> 'sale_price')::NUMERIC;
    v_item_note := v_item ->> 'note';
    v_delta := 0;
    v_inventory_deduct := v_quantity;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be > 0 for product %', v_product_id;
    END IF;
    IF v_sale_price IS NULL OR v_sale_price < 0 THEN
      RAISE EXCEPTION 'Sale price must be >= 0 for product %', v_product_id;
    END IF;

    SELECT quantity_remaining, cost_price, warehouse_id
    INTO v_batch_remaining, v_batch_cost_price, v_batch_warehouse
    FROM public.inventory_batches
    WHERE id = v_batch_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % not found', v_batch_id;
    END IF;
    IF v_batch_warehouse != v_sale.warehouse_id THEN
      RAISE EXCEPTION 'Batch % does not belong to warehouse', v_batch_id;
    END IF;

    IF v_quantity > v_batch_remaining THEN
      SELECT p.tolerance_type, p.tolerance_value, p.name
      INTO v_tolerance_type, v_tolerance_value, v_product_name
      FROM public.products p
      WHERE p.id = v_product_id;

      IF v_tolerance_type = 'PERCENT' THEN
        v_allowed := v_batch_remaining * COALESCE(v_tolerance_value, 0) / 100;
      ELSE
        v_allowed := COALESCE(v_tolerance_value, 0);
      END IF;

      v_delta := v_quantity - v_batch_remaining;

      IF v_delta > v_allowed THEN
        RAISE EXCEPTION 'Negative inventory: batch % has % remaining, cannot deduct %. Tolerance: % (% %)',
          v_batch_id, v_batch_remaining, v_quantity, v_allowed,
          v_tolerance_value, v_tolerance_type;
      END IF;

      INSERT INTO public.loss_records (
        warehouse_id,
        product_id,
        batch_id,
        quantity,
        reason,
        note,
        cost_price,
        total_loss_cost,
        created_by,
        source_sale_id
      )
      VALUES (
        v_sale.warehouse_id,
        v_product_id,
        v_batch_id,
        v_delta,
        'AUTO_TOLERANCE',
        format('Bù sai số tự động: +%s khi sửa đơn %s (tồn: %s, xuất: %s)',
          v_delta, p_sale_id, v_batch_remaining, v_quantity),
        v_batch_cost_price,
        v_delta * v_batch_cost_price,
        auth.uid(),
        p_sale_id
      );

      -- AUTO_TOLERANCE compensates: add v_delta to inventory so sale can deduct full v_quantity
      UPDATE public.inventory_batches
      SET quantity_remaining = quantity_remaining + v_delta,
          updated_at = now()
      WHERE id = v_batch_id;
      -- v_inventory_deduct stays as v_quantity (full sale amount)
    END IF;

    v_item_revenue := v_quantity * v_sale_price;
    v_item_cost := v_quantity * v_batch_cost_price;
    v_new_total_revenue := v_new_total_revenue + v_item_revenue;
    v_new_total_cost := v_new_total_cost + v_item_cost;

    INSERT INTO public.sales_items (
      sale_id,
      product_id,
      batch_id,
      quantity,
      unit_price,
      total_price,
      sale_price,
      cost_price,
      note
    )
    VALUES (
      p_sale_id,
      v_product_id,
      v_batch_id,
      v_quantity,
      v_sale_price,
      v_item_revenue,
      v_sale_price,
      v_batch_cost_price,
      v_item_note
    );

    UPDATE public.inventory_batches
    SET quantity_remaining = quantity_remaining - v_inventory_deduct,
        updated_at = now()
    WHERE id = v_batch_id;

    IF v_effective_customer_id IS NOT NULL THEN
      INSERT INTO public.customer_product_prices (customer_id, product_id, sale_price, updated_at)
      VALUES (v_effective_customer_id, v_product_id, v_sale_price, now())
      ON CONFLICT (customer_id, product_id)
      DO UPDATE SET sale_price = EXCLUDED.sale_price, updated_at = now();
    END IF;
  END LOOP;

  UPDATE public.sales
  SET customer_id = COALESCE(p_customer_id, customer_id),
      note = COALESCE(p_note, note),
      total_amount = v_new_total_revenue,
      total_revenue = v_new_total_revenue,
      total_cost_estimated = v_new_total_cost,
      profit = v_new_total_revenue - v_new_total_cost
  WHERE id = p_sale_id;

  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO v_revision_number
  FROM public.document_revisions
  WHERE document_type = 'SALE'
    AND document_id = p_sale_id;

  INSERT INTO public.document_revisions (
    document_type,
    document_id,
    revision_number,
    reason,
    old_data,
    new_data,
    changed_by
  )
  VALUES (
    'SALE',
    p_sale_id,
    v_revision_number,
    COALESCE(p_note, 'Edit sale'),
    jsonb_build_object(
      'customer_id', v_sale.customer_id,
      'note', v_sale.note,
      'total_revenue', v_sale.total_revenue,
      'total_cost_estimated', v_sale.total_cost_estimated,
      'profit', v_sale.profit,
      'items', v_old_items
    ),
    jsonb_build_object(
      'customer_id', COALESCE(p_customer_id, v_sale.customer_id),
      'note', COALESCE(p_note, v_sale.note),
      'total_revenue', v_new_total_revenue,
      'total_cost_estimated', v_new_total_cost,
      'profit', v_new_total_revenue - v_new_total_cost,
      'items', p_items
    ),
    auth.uid()
  );

  RETURN p_sale_id;
END;
$fn$;


-- 4) Fix cancel_sale: restore full sale amount, undo tolerance compensation, cancel linked tolerance rows
CREATE OR REPLACE FUNCTION public.cancel_sale(
  p_sale_id UUID,
  p_reason TEXT DEFAULT 'Huỷ đơn xuất'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', si.product_id,
    'batch_id', si.batch_id,
    'quantity', si.quantity,
    'sale_price', si.sale_price,
    'cost_price', si.cost_price
  )), '[]'::JSONB)
  INTO v_old_items
  FROM public.sales_items si
  WHERE si.sale_id = p_sale_id;

  FOR v_item IN
    SELECT
      si.batch_id,
      SUM(si.quantity) AS sale_qty,
      COALESCE((
        SELECT SUM(lr.quantity)
        FROM public.loss_records lr
        WHERE lr.source_sale_id = p_sale_id
          AND lr.batch_id = si.batch_id
          AND lr.reason = 'AUTO_TOLERANCE'
          AND COALESCE(lr.status, 'ACTIVE') != 'CANCELLED'
      ), 0) AS tolerance_qty
    FROM public.sales_items si
    WHERE si.sale_id = p_sale_id
    GROUP BY si.batch_id
  LOOP
    UPDATE public.inventory_batches
    SET quantity_remaining = quantity_remaining + GREATEST(v_item.sale_qty - v_item.tolerance_qty, 0),
        updated_at = now()
    WHERE id = v_item.batch_id;
  END LOOP;

  UPDATE public.loss_records
  SET status = 'CANCELLED'
  WHERE source_sale_id = p_sale_id
    AND reason = 'AUTO_TOLERANCE'
    AND COALESCE(status, 'ACTIVE') != 'CANCELLED';

  UPDATE public.sales
  SET status = 'CANCELLED'
  WHERE id = p_sale_id;

  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO v_revision_number
  FROM public.document_revisions
  WHERE document_type = 'SALE'
    AND document_id = p_sale_id;

  INSERT INTO public.document_revisions (document_type, document_id, revision_number, reason, old_data, new_data, changed_by)
  VALUES (
    'SALE',
    p_sale_id,
    v_revision_number,
    p_reason,
    jsonb_build_object('status', v_sale.status, 'items', v_old_items),
    jsonb_build_object('status', 'CANCELLED'),
    auth.uid()
  );

  RETURN p_sale_id;
END;
$fn$;


-- 5) Fix cancel_loss_record: block direct cancel of AUTO_TOLERANCE linked to sale (must cancel sale instead)
CREATE OR REPLACE FUNCTION public.cancel_loss_record(
  p_loss_id UUID,
  p_reason TEXT DEFAULT 'Huỷ ghi nhận hao hụt'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lr RECORD;
  v_revision_number INT;
BEGIN
  SELECT * INTO v_lr FROM public.loss_records WHERE id = p_loss_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loss record % not found', p_loss_id;
  END IF;
  IF v_lr.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Loss record already cancelled';
  END IF;

  -- AUTO_TOLERANCE linked to a sale can only be cancelled via cancel_sale
  IF v_lr.reason = 'AUTO_TOLERANCE' AND v_lr.source_sale_id IS NOT NULL THEN
    RAISE EXCEPTION 'Không thể huỷ sai số tự động từ đơn bán. Hãy huỷ đơn bán để hoàn tác.';
  END IF;

  -- Normal loss (including manual AUTO_TOLERANCE without sale): restore inventory
  UPDATE public.inventory_batches
  SET quantity_remaining = quantity_remaining + v_lr.quantity,
      updated_at = now()
  WHERE id = v_lr.batch_id;

  UPDATE public.loss_records
  SET status = 'CANCELLED'
  WHERE id = p_loss_id;

  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_revision_number
  FROM public.document_revisions
  WHERE document_type = 'LOSS' AND document_id = p_loss_id;

  INSERT INTO public.document_revisions (document_type, document_id, revision_number, reason, old_data, new_data, changed_by)
  VALUES (
    'LOSS',
    p_loss_id,
    v_revision_number,
    p_reason,
    jsonb_build_object(
      'status', 'ACTIVE',
      'product_id', v_lr.product_id,
      'batch_id', v_lr.batch_id,
      'quantity', v_lr.quantity,
      'reason', v_lr.reason,
      'cost_price', v_lr.cost_price,
      'total_loss_cost', v_lr.total_loss_cost,
      'source_sale_id', v_lr.source_sale_id
    ),
    jsonb_build_object('status', 'CANCELLED'),
    auth.uid()
  );

  RETURN p_loss_id;
END;
$fn$;
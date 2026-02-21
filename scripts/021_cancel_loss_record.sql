-- =============================================
-- StockFlowQTfood - Phase 21: Cancel Loss Record
-- Add status column + cancel RPC + fix all dashboard RPCs
-- =============================================

-- 1) Add status column to loss_records
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loss_records' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.loss_records ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_loss_records_status ON public.loss_records(status);

-- 2) Update document_revisions constraint to allow LOSS type
ALTER TABLE public.document_revisions DROP CONSTRAINT IF EXISTS chk_doc_revision_type;
ALTER TABLE public.document_revisions ADD CONSTRAINT chk_doc_revision_type
  CHECK (document_type IN ('STOCK_IN', 'SALE', 'LOSS'));

-- 3) RPC: cancel_loss_record
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
  -- Get loss record
  SELECT * INTO v_lr FROM public.loss_records WHERE id = p_loss_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loss record % not found', p_loss_id;
  END IF;
  IF v_lr.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Loss record already cancelled';
  END IF;

  -- Restore inventory
  UPDATE public.inventory_batches
  SET quantity_remaining = quantity_remaining + v_lr.quantity,
      updated_at = now()
  WHERE id = v_lr.batch_id;

  -- Set status to CANCELLED
  UPDATE public.loss_records SET status = 'CANCELLED' WHERE id = p_loss_id;

  -- Log revision
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_revision_number
  FROM public.document_revisions
  WHERE document_type = 'LOSS' AND document_id = p_loss_id;

  INSERT INTO public.document_revisions (document_type, document_id, revision_number, reason, old_data, new_data, changed_by)
  VALUES (
    'LOSS', p_loss_id, v_revision_number, p_reason,
    jsonb_build_object(
      'status', 'ACTIVE',
      'product_id', v_lr.product_id,
      'batch_id', v_lr.batch_id,
      'quantity', v_lr.quantity,
      'reason', v_lr.reason,
      'cost_price', v_lr.cost_price,
      'total_loss_cost', v_lr.total_loss_cost
    ),
    jsonb_build_object('status', 'CANCELLED'),
    auth.uid()
  );

  RETURN p_loss_id;
END;
$fn$;

-- =============================================
-- 4) Fix all dashboard RPCs to exclude CANCELLED loss_records
-- =============================================

-- 4a) get_dashboard_summary
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_revenue NUMERIC(14,2);
  v_cost NUMERIC(14,2);
  v_profit NUMERIC(14,2);
  v_loss NUMERIC(14,2);
BEGIN
  SELECT COALESCE(SUM(total_revenue), 0),
         COALESCE(SUM(total_cost_estimated), 0),
         COALESCE(SUM(profit), 0)
  INTO v_revenue, v_cost, v_profit
  FROM public.sales
  WHERE warehouse_id = p_warehouse_id
    AND status != 'CANCELLED'
    AND created_at::date >= p_start_date
    AND created_at::date <= p_end_date;

  SELECT COALESCE(SUM(total_loss_cost), 0)
  INTO v_loss
  FROM public.loss_records
  WHERE warehouse_id = p_warehouse_id
    AND status != 'CANCELLED'
    AND created_at::date >= p_start_date
    AND created_at::date <= p_end_date;

  RETURN jsonb_build_object(
    'revenue_total', v_revenue,
    'cost_total', v_cost,
    'profit_total', v_profit,
    'loss_total', v_loss
  );
END;
$fn$;

-- 4b) get_daily_loss_report
CREATE OR REPLACE FUNCTION public.get_daily_loss_report(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(date DATE, loss_cost NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT d.dt::date AS date,
         COALESCE(SUM(lr.total_loss_cost), 0) AS loss_cost
  FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d(dt)
  LEFT JOIN public.loss_records lr
    ON lr.warehouse_id = p_warehouse_id
    AND lr.status != 'CANCELLED'
    AND lr.created_at::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$fn$;

-- 4c) get_top_products_loss
CREATE OR REPLACE FUNCTION public.get_top_products_loss(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_limit_n INT DEFAULT 10
)
RETURNS TABLE(product_id UUID, product_name TEXT, quantity_lost NUMERIC, loss_cost NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT lr.product_id,
         p.name AS product_name,
         SUM(lr.quantity) AS quantity_lost,
         SUM(lr.total_loss_cost) AS loss_cost
  FROM public.loss_records lr
  JOIN public.products p ON p.id = lr.product_id
  WHERE lr.warehouse_id = p_warehouse_id
    AND lr.status != 'CANCELLED'
    AND lr.created_at::date >= p_start_date
    AND lr.created_at::date <= p_end_date
  GROUP BY lr.product_id, p.name
  ORDER BY loss_cost DESC
  LIMIT p_limit_n;
END;
$fn$;

-- 4d) get_product_inventory_report: exclude cancelled loss_records
CREATE OR REPLACE FUNCTION public.get_product_inventory_report(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(
  product_id UUID,
  product_name TEXT,
  category_name TEXT,
  unit TEXT,
  qty_in NUMERIC,
  qty_sold NUMERIC,
  qty_lost NUMERIC,
  loss_pct NUMERIC,
  current_cost_price NUMERIC,
  avg_cost_in NUMERIC,
  avg_sale_price NUMERIC,
  qty_remaining NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    COALESCE(pc.name, 'Chưa phân loại') AS category_name,
    p.unit,
    COALESCE(si_agg.total_qty_in, 0) AS qty_in,
    COALESCE(sa_agg.total_qty_sold, 0) AS qty_sold,
    COALESCE(lr_agg.total_qty_lost, 0) AS qty_lost,
    CASE
      WHEN (COALESCE(sa_agg.total_qty_sold, 0) + COALESCE(lr_agg.total_qty_lost, 0)) > 0
      THEN ROUND(COALESCE(lr_agg.total_qty_lost, 0) * 100.0 / (COALESCE(sa_agg.total_qty_sold, 0) + COALESCE(lr_agg.total_qty_lost, 0)), 2)
      ELSE 0
    END AS loss_pct,
    COALESCE(latest_batch.latest_cost_price, 0) AS current_cost_price,
    CASE
      WHEN COALESCE(si_agg.total_qty_in, 0) > 0
      THEN ROUND(COALESCE(si_agg.total_cost_in, 0) / si_agg.total_qty_in, 2)
      ELSE 0
    END AS avg_cost_in,
    CASE
      WHEN COALESCE(sa_agg.total_qty_sold, 0) > 0
      THEN ROUND(COALESCE(sa_agg.total_revenue, 0) / sa_agg.total_qty_sold, 2)
      ELSE 0
    END AS avg_sale_price,
    COALESCE(inv_agg.total_remaining, 0) AS qty_remaining
  FROM public.products p
  LEFT JOIN public.product_categories pc ON pc.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT SUM(sii.quantity) AS total_qty_in,
           SUM(sii.total_price) AS total_cost_in
    FROM public.stock_in_items sii
    JOIN public.stock_in si ON si.id = sii.stock_in_id
    WHERE sii.product_id = p.id
      AND si.warehouse_id = p_warehouse_id
      AND si.status != 'CANCELLED'
      AND si.created_at::date >= p_start_date
      AND si.created_at::date <= p_end_date
  ) si_agg ON true
  LEFT JOIN LATERAL (
    SELECT SUM(sai.quantity) AS total_qty_sold,
           SUM(sai.total_price) AS total_revenue
    FROM public.sales_items sai
    JOIN public.sales s ON s.id = sai.sale_id
    WHERE sai.product_id = p.id
      AND s.warehouse_id = p_warehouse_id
      AND s.status != 'CANCELLED'
      AND s.created_at::date >= p_start_date
      AND s.created_at::date <= p_end_date
  ) sa_agg ON true
  LEFT JOIN LATERAL (
    SELECT SUM(lr.quantity) AS total_qty_lost
    FROM public.loss_records lr
    WHERE lr.product_id = p.id
      AND lr.warehouse_id = p_warehouse_id
      AND lr.status != 'CANCELLED'
      AND lr.created_at::date >= p_start_date
      AND lr.created_at::date <= p_end_date
  ) lr_agg ON true
  LEFT JOIN LATERAL (
    SELECT ib.cost_price AS latest_cost_price
    FROM public.inventory_batches ib
    WHERE ib.product_id = p.id
      AND ib.warehouse_id = p_warehouse_id
      AND ib.quantity_remaining > 0
    ORDER BY ib.created_at DESC
    LIMIT 1
  ) latest_batch ON true
  LEFT JOIN LATERAL (
    SELECT SUM(ib.quantity_remaining) AS total_remaining
    FROM public.inventory_batches ib
    WHERE ib.product_id = p.id
      AND ib.warehouse_id = p_warehouse_id
  ) inv_agg ON true
  WHERE p.warehouse_id = p_warehouse_id
    AND (
      COALESCE(si_agg.total_qty_in, 0) > 0
      OR COALESCE(sa_agg.total_qty_sold, 0) > 0
      OR COALESCE(lr_agg.total_qty_lost, 0) > 0
      OR COALESCE(inv_agg.total_remaining, 0) > 0
    )
  ORDER BY COALESCE(sa_agg.total_revenue, 0) DESC;
END;
$fn$;

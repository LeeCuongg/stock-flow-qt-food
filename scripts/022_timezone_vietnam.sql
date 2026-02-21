-- =============================================
-- StockFlowQTfood - Phase 22: Vietnam Timezone Fix
-- All date comparisons use Asia/Ho_Chi_Minh timezone
-- =============================================

-- 1) get_dashboard_summary
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
    AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
    AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date;

  SELECT COALESCE(SUM(total_loss_cost), 0)
  INTO v_loss
  FROM public.loss_records
  WHERE warehouse_id = p_warehouse_id
    AND status != 'CANCELLED'
    AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
    AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date;

  RETURN jsonb_build_object(
    'revenue_total', v_revenue,
    'cost_total', v_cost,
    'profit_total', v_profit,
    'loss_total', v_loss
  );
END;
$fn$;

-- 2) get_daily_sales_report
CREATE OR REPLACE FUNCTION public.get_daily_sales_report(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(date DATE, revenue NUMERIC, cost NUMERIC, profit NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT d.dt::date AS date,
         COALESCE(SUM(s.total_revenue), 0) AS revenue,
         COALESCE(SUM(s.total_cost_estimated), 0) AS cost,
         COALESCE(SUM(s.profit), 0) AS profit
  FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d(dt)
  LEFT JOIN public.sales s
    ON s.warehouse_id = p_warehouse_id
    AND s.status != 'CANCELLED'
    AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$fn$;

-- 3) get_daily_loss_report
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
    AND (lr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$fn$;

-- 4) get_top_products_sales
CREATE OR REPLACE FUNCTION public.get_top_products_sales(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_limit_n INT DEFAULT 10
)
RETURNS TABLE(product_id UUID, product_name TEXT, quantity_sold NUMERIC, revenue NUMERIC, profit NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT si.product_id,
         p.name AS product_name,
         SUM(si.quantity) AS quantity_sold,
         SUM(si.total_price) AS revenue,
         SUM(si.total_price - si.quantity * si.cost_price) AS profit
  FROM public.sales_items si
  JOIN public.sales s ON s.id = si.sale_id
  JOIN public.products p ON p.id = si.product_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status != 'CANCELLED'
    AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
    AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
  GROUP BY si.product_id, p.name
  ORDER BY revenue DESC
  LIMIT p_limit_n;
END;
$fn$;

-- 5) get_top_products_loss
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
    AND (lr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
    AND (lr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
  GROUP BY lr.product_id, p.name
  ORDER BY loss_cost DESC
  LIMIT p_limit_n;
END;
$fn$;

-- 6) get_financial_summary
CREATE OR REPLACE FUNCTION public.get_financial_summary(
  p_warehouse_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_revenue NUMERIC(14,2);
  v_cogs NUMERIC(14,2);
  v_extra_charge NUMERIC(14,2);
  v_discount NUMERIC(14,2);
  v_operating_expense NUMERIC(14,2);
  v_gross_profit NUMERIC(14,2);
  v_net_profit NUMERIC(14,2);
BEGIN
  SELECT COALESCE(SUM(s.total_revenue), 0),
         COALESCE(SUM(s.total_cost_estimated), 0)
  INTO v_revenue, v_cogs
  FROM public.sales s
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status = 'POSTED'
    AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_date_from
    AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_date_to;

  SELECT COALESCE(SUM(sa.amount), 0)
  INTO v_extra_charge
  FROM public.sale_adjustments sa
  JOIN public.sales s ON s.id = sa.sale_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status = 'POSTED'
    AND sa.adjustment_type = 'EXTRA_CHARGE'
    AND (sa.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_date_from
    AND (sa.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_date_to;

  SELECT COALESCE(SUM(sa.amount), 0)
  INTO v_discount
  FROM public.sale_adjustments sa
  JOIN public.sales s ON s.id = sa.sale_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status = 'POSTED'
    AND sa.adjustment_type = 'DISCOUNT'
    AND (sa.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_date_from
    AND (sa.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_date_to;

  SELECT COALESCE(SUM(er.amount), 0)
  INTO v_operating_expense
  FROM public.expense_records er
  WHERE er.warehouse_id = p_warehouse_id
    AND (er.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_date_from
    AND (er.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_date_to;

  v_gross_profit := v_revenue + v_extra_charge - v_discount - v_cogs;
  v_net_profit := v_gross_profit - v_operating_expense;

  RETURN jsonb_build_object(
    'revenue', v_revenue,
    'extra_charge', v_extra_charge,
    'discount', v_discount,
    'cogs', v_cogs,
    'gross_profit', v_gross_profit,
    'operating_expense', v_operating_expense,
    'net_profit', v_net_profit
  );
END;
$fn$;

-- 7) get_sales_by_category
CREATE OR REPLACE FUNCTION public.get_sales_by_category(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(category_name TEXT, revenue NUMERIC, profit NUMERIC, quantity_sold NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT COALESCE(pc.name, 'Chưa phân loại') AS category_name,
         SUM(si.total_price) AS revenue,
         SUM(si.total_price - si.quantity * si.cost_price) AS profit,
         SUM(si.quantity) AS quantity_sold
  FROM public.sales_items si
  JOIN public.sales s ON s.id = si.sale_id
  JOIN public.products p ON p.id = si.product_id
  LEFT JOIN public.product_categories pc ON pc.id = p.category_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status != 'CANCELLED'
    AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
    AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
  GROUP BY COALESCE(pc.name, 'Chưa phân loại')
  ORDER BY revenue DESC;
END;
$fn$;

-- 8) get_top_customers
CREATE OR REPLACE FUNCTION public.get_top_customers(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_limit_n INT DEFAULT 10
)
RETURNS TABLE(customer_id UUID, customer_name TEXT, total_revenue NUMERIC, total_orders BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT s.customer_id,
         COALESCE(c.name, s.customer_name, 'Khách lẻ') AS customer_name,
         SUM(s.total_revenue) AS total_revenue,
         COUNT(s.id) AS total_orders
  FROM public.sales s
  LEFT JOIN public.customers c ON c.id = s.customer_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status != 'CANCELLED'
    AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
    AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
  GROUP BY s.customer_id, COALESCE(c.name, s.customer_name, 'Khách lẻ')
  ORDER BY total_revenue DESC
  LIMIT p_limit_n;
END;
$fn$;

-- 9) get_daily_stock_in_report
CREATE OR REPLACE FUNCTION public.get_daily_stock_in_report(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(date DATE, total_cost NUMERIC, item_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT d.dt::date AS date,
         COALESCE(SUM(si.total_amount), 0) AS total_cost,
         COUNT(si.id) AS item_count
  FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d(dt)
  LEFT JOIN public.stock_in si
    ON si.warehouse_id = p_warehouse_id
    AND si.status != 'CANCELLED'
    AND (si.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$fn$;

-- 10) get_expense_by_category
CREATE OR REPLACE FUNCTION public.get_expense_by_category(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(category_name TEXT, total_amount NUMERIC, record_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT COALESCE(ec.name, 'Chưa phân loại') AS category_name,
         SUM(er.amount) AS total_amount,
         COUNT(er.id) AS record_count
  FROM public.expense_records er
  LEFT JOIN public.expense_categories ec ON ec.id = er.category_id
  WHERE er.warehouse_id = p_warehouse_id
    AND (er.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
    AND (er.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
  GROUP BY COALESCE(ec.name, 'Chưa phân loại')
  ORDER BY total_amount DESC;
END;
$fn$;

-- 11) get_daily_expense_report
CREATE OR REPLACE FUNCTION public.get_daily_expense_report(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(date DATE, total_amount NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT d.dt::date AS date,
         COALESCE(SUM(er.amount), 0) AS total_amount
  FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d(dt)
  LEFT JOIN public.expense_records er
    ON er.warehouse_id = p_warehouse_id
    AND (er.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$fn$;

-- 12) get_daily_payments_report
CREATE OR REPLACE FUNCTION public.get_daily_payments_report(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(date DATE, cash_in NUMERIC, cash_out NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT d.dt::date AS date,
         COALESCE(SUM(CASE WHEN pm.payment_type = 'IN' AND pm.status = 'ACTIVE' THEN pm.amount ELSE 0 END), 0) AS cash_in,
         COALESCE(SUM(CASE WHEN pm.payment_type = 'OUT' AND pm.status = 'ACTIVE' THEN pm.amount ELSE 0 END), 0) AS cash_out
  FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d(dt)
  LEFT JOIN public.payments pm
    ON pm.warehouse_id = p_warehouse_id
    AND (pm.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$fn$;

-- 13) get_product_inventory_report
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
    SELECT SUM(sii.quantity) AS total_qty_in, SUM(sii.total_price) AS total_cost_in
    FROM public.stock_in_items sii
    JOIN public.stock_in si ON si.id = sii.stock_in_id
    WHERE sii.product_id = p.id
      AND si.warehouse_id = p_warehouse_id
      AND si.status != 'CANCELLED'
      AND (si.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      AND (si.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
  ) si_agg ON true
  LEFT JOIN LATERAL (
    SELECT SUM(sai.quantity) AS total_qty_sold, SUM(sai.total_price) AS total_revenue
    FROM public.sales_items sai
    JOIN public.sales s ON s.id = sai.sale_id
    WHERE sai.product_id = p.id
      AND s.warehouse_id = p_warehouse_id
      AND s.status != 'CANCELLED'
      AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
  ) sa_agg ON true
  LEFT JOIN LATERAL (
    SELECT SUM(lr.quantity) AS total_qty_lost
    FROM public.loss_records lr
    WHERE lr.product_id = p.id
      AND lr.warehouse_id = p_warehouse_id
      AND lr.status != 'CANCELLED'
      AND (lr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      AND (lr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
  ) lr_agg ON true
  LEFT JOIN LATERAL (
    SELECT ib.cost_price AS latest_cost_price
    FROM public.inventory_batches ib
    WHERE ib.product_id = p.id AND ib.warehouse_id = p_warehouse_id AND ib.quantity_remaining > 0
    ORDER BY ib.created_at DESC LIMIT 1
  ) latest_batch ON true
  LEFT JOIN LATERAL (
    SELECT SUM(ib.quantity_remaining) AS total_remaining
    FROM public.inventory_batches ib
    WHERE ib.product_id = p.id AND ib.warehouse_id = p_warehouse_id
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

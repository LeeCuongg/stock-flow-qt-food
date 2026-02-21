-- =============================================
-- StockFlowQTfood - Phase 20: Enhanced Dashboard RPCs
-- New RPCs for tabbed dashboard charts
-- =============================================

-- 1) get_sales_by_category: Revenue & profit grouped by product category
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
    AND s.created_at::date >= p_start_date
    AND s.created_at::date <= p_end_date
  GROUP BY COALESCE(pc.name, 'Chưa phân loại')
  ORDER BY revenue DESC;
END;
$fn$;

-- 2) get_top_customers: Top customers by revenue
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
    AND s.created_at::date >= p_start_date
    AND s.created_at::date <= p_end_date
  GROUP BY s.customer_id, COALESCE(c.name, s.customer_name, 'Khách lẻ')
  ORDER BY total_revenue DESC
  LIMIT p_limit_n;
END;
$fn$;

-- 3) get_inventory_by_category: Stock remaining grouped by category
CREATE OR REPLACE FUNCTION public.get_inventory_by_category(
  p_warehouse_id UUID
)
RETURNS TABLE(category_name TEXT, total_quantity NUMERIC, total_value NUMERIC, product_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT COALESCE(pc.name, 'Chưa phân loại') AS category_name,
         SUM(ib.quantity_remaining) AS total_quantity,
         SUM(ib.quantity_remaining * ib.cost_price) AS total_value,
         COUNT(DISTINCT ib.product_id) AS product_count
  FROM public.inventory_batches ib
  JOIN public.products p ON p.id = ib.product_id
  LEFT JOIN public.product_categories pc ON pc.id = p.category_id
  WHERE ib.warehouse_id = p_warehouse_id
    AND ib.quantity_remaining > 0
  GROUP BY COALESCE(pc.name, 'Chưa phân loại')
  ORDER BY total_value DESC;
END;
$fn$;

-- 4) get_daily_stock_in_report: Daily stock-in totals
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
    AND si.created_at::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$fn$;

-- 5) get_expense_by_category: Expenses grouped by category
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
    AND er.created_at::date >= p_start_date
    AND er.created_at::date <= p_end_date
  GROUP BY COALESCE(ec.name, 'Chưa phân loại')
  ORDER BY total_amount DESC;
END;
$fn$;

-- 6) get_daily_expense_report: Daily expense totals
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
    AND er.created_at::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$fn$;

-- 7) get_product_inventory_report: Full inventory report per product
-- Columns: product, category, unit, qty_in, qty_sold, qty_lost, loss_pct, current_cost, avg_cost_in, avg_sale_price, qty_remaining
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
    -- Tổng nhập trong kỳ
    COALESCE(si_agg.total_qty_in, 0) AS qty_in,
    -- Tổng xuất thực tế trong kỳ
    COALESCE(sa_agg.total_qty_sold, 0) AS qty_sold,
    -- Tổng hao hụt trong kỳ
    COALESCE(lr_agg.total_qty_lost, 0) AS qty_lost,
    -- % Hao hụt = hao hụt / (xuất + hao hụt) * 100
    CASE
      WHEN (COALESCE(sa_agg.total_qty_sold, 0) + COALESCE(lr_agg.total_qty_lost, 0)) > 0
      THEN ROUND(COALESCE(lr_agg.total_qty_lost, 0) * 100.0 / (COALESCE(sa_agg.total_qty_sold, 0) + COALESCE(lr_agg.total_qty_lost, 0)), 2)
      ELSE 0
    END AS loss_pct,
    -- Giá nhập hiện tại (giá cost_price mới nhất của batch còn tồn)
    COALESCE(latest_batch.latest_cost_price, 0) AS current_cost_price,
    -- Giá nhập TB = tổng giá trị nhập / tổng SL nhập
    CASE
      WHEN COALESCE(si_agg.total_qty_in, 0) > 0
      THEN ROUND(COALESCE(si_agg.total_cost_in, 0) / si_agg.total_qty_in, 2)
      ELSE 0
    END AS avg_cost_in,
    -- Giá xuất TB = tổng doanh thu / tổng SL xuất
    CASE
      WHEN COALESCE(sa_agg.total_qty_sold, 0) > 0
      THEN ROUND(COALESCE(sa_agg.total_revenue, 0) / sa_agg.total_qty_sold, 2)
      ELSE 0
    END AS avg_sale_price,
    -- Tồn kho hiện tại
    COALESCE(inv_agg.total_remaining, 0) AS qty_remaining
  FROM public.products p
  LEFT JOIN public.product_categories pc ON pc.id = p.category_id
  -- Nhập trong kỳ
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
  -- Xuất trong kỳ
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
  -- Hao hụt trong kỳ
  LEFT JOIN LATERAL (
    SELECT SUM(lr.quantity) AS total_qty_lost
    FROM public.loss_records lr
    WHERE lr.product_id = p.id
      AND lr.warehouse_id = p_warehouse_id
      AND lr.created_at::date >= p_start_date
      AND lr.created_at::date <= p_end_date
  ) lr_agg ON true
  -- Giá nhập hiện tại (batch mới nhất còn tồn)
  LEFT JOIN LATERAL (
    SELECT ib.cost_price AS latest_cost_price
    FROM public.inventory_batches ib
    WHERE ib.product_id = p.id
      AND ib.warehouse_id = p_warehouse_id
      AND ib.quantity_remaining > 0
    ORDER BY ib.created_at DESC
    LIMIT 1
  ) latest_batch ON true
  -- Tồn kho hiện tại
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

-- 8) get_daily_payments_report: Daily cash in/out
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
    AND pm.created_at::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$fn$;

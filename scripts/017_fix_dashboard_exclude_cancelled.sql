-- =============================================
-- StockFlowQTfood - Phase 17: Fix Dashboard RPCs
-- Exclude CANCELLED records from all dashboard/report RPCs
-- =============================================

-- 1) get_dashboard_summary: exclude cancelled sales & loss_records
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

-- 2) get_daily_sales_report: exclude cancelled sales
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
    AND s.created_at::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$fn$;

-- 3) get_daily_loss_report: exclude cancelled loss_records
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
    AND lr.created_at::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$fn$;

-- 4) get_top_products_sales: exclude cancelled sales
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
    AND s.created_at::date >= p_start_date
    AND s.created_at::date <= p_end_date
  GROUP BY si.product_id, p.name
  ORDER BY revenue DESC
  LIMIT p_limit_n;
END;
$fn$;

-- 5) get_top_products_loss: exclude cancelled loss_records
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
    AND lr.created_at::date >= p_start_date
    AND lr.created_at::date <= p_end_date
  GROUP BY lr.product_id, p.name
  ORDER BY loss_cost DESC
  LIMIT p_limit_n;
END;
$fn$;

-- 6) get_receivable_report: exclude cancelled sales
CREATE OR REPLACE FUNCTION public.get_receivable_report(p_warehouse_id UUID)
RETURNS TABLE(customer_id UUID, customer_name TEXT, total_receivable NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT s.customer_id, COALESCE(c.name, s.customer_name) AS customer_name,
         SUM(s.total_revenue - s.amount_paid) AS total_receivable
  FROM public.sales s
  LEFT JOIN public.customers c ON c.id = s.customer_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status != 'CANCELLED'
    AND s.payment_status != 'PAID'
    AND (s.total_revenue - s.amount_paid) > 0
  GROUP BY s.customer_id, COALESCE(c.name, s.customer_name)
  ORDER BY total_receivable DESC;
END;
$fn$;

-- 7) get_payable_report: exclude cancelled stock_in
CREATE OR REPLACE FUNCTION public.get_payable_report(p_warehouse_id UUID)
RETURNS TABLE(supplier_id UUID, supplier_name TEXT, total_payable NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT si.supplier_id, COALESCE(sp.name, si.supplier_name) AS supplier_name,
         SUM(si.total_amount - si.amount_paid) AS total_payable
  FROM public.stock_in si
  LEFT JOIN public.suppliers sp ON sp.id = si.supplier_id
  WHERE si.warehouse_id = p_warehouse_id
    AND si.status != 'CANCELLED'
    AND si.payment_status != 'PAID'
    AND (si.total_amount - si.amount_paid) > 0
  GROUP BY si.supplier_id, COALESCE(sp.name, si.supplier_name)
  ORDER BY total_payable DESC;
END;
$fn$;

-- =============================================
-- StockFlowQTfood - Phase 5 Migration
-- Dashboard / Analytics RPC functions
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
AS $$
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
$$;

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
AS $$
BEGIN
  RETURN QUERY
  SELECT d.dt::date AS date,
         COALESCE(SUM(s.total_revenue), 0) AS revenue,
         COALESCE(SUM(s.total_cost_estimated), 0) AS cost,
         COALESCE(SUM(s.profit), 0) AS profit
  FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d(dt)
  LEFT JOIN public.sales s
    ON s.warehouse_id = p_warehouse_id
    AND s.created_at::date = d.dt::date
  GROUP BY d.dt
  ORDER BY d.dt;
END;
$$;

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
AS $$
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
$$;

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
AS $$
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
    AND s.created_at::date >= p_start_date
    AND s.created_at::date <= p_end_date
  GROUP BY si.product_id, p.name
  ORDER BY revenue DESC
  LIMIT p_limit_n;
END;
$$;

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
AS $$
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
$$;

-- 6) get_expiring_batches
CREATE OR REPLACE FUNCTION public.get_expiring_batches(
  p_warehouse_id UUID,
  p_days_threshold INT DEFAULT 30
)
RETURNS TABLE(product_id UUID, product_name TEXT, batch_code TEXT, expired_date DATE, quantity_remaining NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ib.product_id,
         p.name AS product_name,
         ib.batch_code,
         ib.expiry_date AS expired_date,
         ib.quantity_remaining
  FROM public.inventory_batches ib
  JOIN public.products p ON p.id = ib.product_id
  WHERE ib.warehouse_id = p_warehouse_id
    AND ib.quantity_remaining > 0
    AND ib.expiry_date IS NOT NULL
    AND ib.expiry_date <= (CURRENT_DATE + p_days_threshold)
  ORDER BY ib.expiry_date ASC;
END;
$$;

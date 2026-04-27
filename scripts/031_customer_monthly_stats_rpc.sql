-- =============================================
-- StockFlowQTfood - Phase 31: Customer Monthly Stats RPC
-- Provides aggregated customer analytics data by day/month/year
-- p_granularity: 'day', 'month' (default), or 'year'
-- =============================================

CREATE OR REPLACE FUNCTION public.get_customer_monthly_stats(
  p_warehouse_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_customer_ids UUID[] DEFAULT NULL,
  p_granularity TEXT DEFAULT 'month'
)
RETURNS TABLE(
  customer_id UUID,
  customer_name TEXT,
  month DATE,
  monthly_revenue NUMERIC,
  monthly_orders BIGINT,
  monthly_avg_order_value NUMERIC,
  monthly_outstanding_debt NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    s.customer_id,
    COALESCE(c.name, s.customer_name, 'Khách lẻ') AS customer_name,
    CASE p_granularity
      WHEN 'day' THEN (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      WHEN 'year' THEN date_trunc('year', s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      ELSE date_trunc('month', s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    END AS month,
    SUM(s.total_revenue) AS monthly_revenue,
    COUNT(s.id) AS monthly_orders,
    CASE
      WHEN COUNT(s.id) > 0
      THEN ROUND(SUM(s.total_revenue) / COUNT(s.id), 0)
      ELSE 0
    END AS monthly_avg_order_value,
    SUM(s.total_revenue - s.amount_paid) AS monthly_outstanding_debt
  FROM public.sales s
  LEFT JOIN public.customers c ON c.id = s.customer_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status != 'CANCELLED'
    AND s.created_at::date >= p_start_date
    AND s.created_at::date <= p_end_date
    AND (
      p_customer_ids IS NULL
      OR array_length(p_customer_ids, 1) IS NULL
      OR s.customer_id = ANY(p_customer_ids)
    )
  GROUP BY s.customer_id, COALESCE(c.name, s.customer_name, 'Khách lẻ'),
           CASE p_granularity
             WHEN 'day' THEN (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
             WHEN 'year' THEN date_trunc('year', s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
             ELSE date_trunc('month', s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
           END
  ORDER BY customer_name ASC, month ASC;
END;
$fn$;

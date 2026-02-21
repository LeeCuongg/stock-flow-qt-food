-- =============================================
-- StockFlowQTfood - Phase 9: Adjustments & Operating Expenses
-- 1) sale_adjustments table
-- 2) expense_categories table
-- 3) expense_records table
-- 4) RPC get_financial_summary
-- =============================================

-- =============================================
-- 1) SALE ADJUSTMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS public.sale_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  adjustment_type TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_adj_type') THEN
    ALTER TABLE public.sale_adjustments ADD CONSTRAINT chk_sale_adj_type
      CHECK (adjustment_type IN ('EXTRA_CHARGE', 'DISCOUNT'));
  END IF;
END $$;

DROP POLICY IF EXISTS "sale_adj_select_all" ON public.sale_adjustments;
CREATE POLICY "sale_adj_select_all" ON public.sale_adjustments FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "sale_adj_insert_staff" ON public.sale_adjustments;
CREATE POLICY "sale_adj_insert_staff" ON public.sale_adjustments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "sale_adj_delete_staff" ON public.sale_adjustments;
CREATE POLICY "sale_adj_delete_staff" ON public.sale_adjustments FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_sale_adjustments_sale ON public.sale_adjustments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_adjustments_type ON public.sale_adjustments(adjustment_type);

-- =============================================
-- 2) EXPENSE CATEGORIES
-- =============================================
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exp_cat_select_all" ON public.expense_categories;
CREATE POLICY "exp_cat_select_all" ON public.expense_categories FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "exp_cat_insert_staff" ON public.expense_categories;
CREATE POLICY "exp_cat_insert_staff" ON public.expense_categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "exp_cat_update_staff" ON public.expense_categories;
CREATE POLICY "exp_cat_update_staff" ON public.expense_categories FOR UPDATE USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "exp_cat_delete_admin" ON public.expense_categories;
CREATE POLICY "exp_cat_delete_admin" ON public.expense_categories FOR DELETE USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_expense_categories_warehouse ON public.expense_categories(warehouse_id);

-- =============================================
-- 3) EXPENSE RECORDS
-- =============================================
CREATE TABLE IF NOT EXISTS public.expense_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  reference_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'CASH',
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exp_rec_select_all" ON public.expense_records;
CREATE POLICY "exp_rec_select_all" ON public.expense_records FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "exp_rec_insert_staff" ON public.expense_records;
CREATE POLICY "exp_rec_insert_staff" ON public.expense_records FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "exp_rec_delete_admin" ON public.expense_records;
CREATE POLICY "exp_rec_delete_admin" ON public.expense_records FOR DELETE USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_expense_records_warehouse ON public.expense_records(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_expense_records_category ON public.expense_records(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_records_created_at ON public.expense_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_records_ref_sale ON public.expense_records(reference_sale_id);

-- =============================================
-- 4) RPC: get_financial_summary
-- Revenue = SUM(sales.total_revenue) for POSTED sales
-- Extra charge = SUM(sale_adjustments.amount) WHERE type = 'EXTRA_CHARGE'
-- Discount = SUM(sale_adjustments.amount) WHERE type = 'DISCOUNT'
-- COGS = SUM(sales.total_cost_estimated) for POSTED sales
-- Gross profit = revenue + extra_charge - discount - cogs
-- Operating expense = SUM(expense_records.amount)
-- Net profit = gross_profit - operating_expense
-- =============================================
CREATE OR REPLACE FUNCTION public.get_financial_summary(
  p_warehouse_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revenue NUMERIC(14,2);
  v_cogs NUMERIC(14,2);
  v_extra_charge NUMERIC(14,2);
  v_discount NUMERIC(14,2);
  v_operating_expense NUMERIC(14,2);
  v_gross_profit NUMERIC(14,2);
  v_net_profit NUMERIC(14,2);
BEGIN
  -- Revenue & COGS from POSTED sales
  SELECT COALESCE(SUM(s.total_revenue), 0),
         COALESCE(SUM(s.total_cost_estimated), 0)
  INTO v_revenue, v_cogs
  FROM public.sales s
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status = 'POSTED'
    AND s.created_at::date >= p_date_from
    AND s.created_at::date <= p_date_to;

  -- Extra charges from sale_adjustments
  SELECT COALESCE(SUM(sa.amount), 0)
  INTO v_extra_charge
  FROM public.sale_adjustments sa
  JOIN public.sales s ON s.id = sa.sale_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status = 'POSTED'
    AND sa.adjustment_type = 'EXTRA_CHARGE'
    AND sa.created_at::date >= p_date_from
    AND sa.created_at::date <= p_date_to;

  -- Discounts from sale_adjustments
  SELECT COALESCE(SUM(sa.amount), 0)
  INTO v_discount
  FROM public.sale_adjustments sa
  JOIN public.sales s ON s.id = sa.sale_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status = 'POSTED'
    AND sa.adjustment_type = 'DISCOUNT'
    AND sa.created_at::date >= p_date_from
    AND sa.created_at::date <= p_date_to;

  -- Operating expenses
  SELECT COALESCE(SUM(er.amount), 0)
  INTO v_operating_expense
  FROM public.expense_records er
  WHERE er.warehouse_id = p_warehouse_id
    AND er.created_at::date >= p_date_from
    AND er.created_at::date <= p_date_to;

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
$$;

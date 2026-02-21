-- =============================================
-- StockFlowQTfood - Phase 19: Exclude CANCELLED from debt reports & payment allocation
-- =============================================

-- 1) Fix get_receivable_report: exclude cancelled sales
CREATE OR REPLACE FUNCTION public.get_receivable_report(p_warehouse_id UUID)
RETURNS TABLE(customer_id UUID, customer_name TEXT, total_receivable NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.customer_id, COALESCE(c.name, s.customer_name) AS customer_name,
         SUM(s.total_revenue - s.amount_paid) AS total_receivable
  FROM public.sales s
  LEFT JOIN public.customers c ON c.id = s.customer_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.payment_status != 'PAID'
    AND s.status != 'CANCELLED'
    AND (s.total_revenue - s.amount_paid) > 0
  GROUP BY s.customer_id, COALESCE(c.name, s.customer_name)
  ORDER BY total_receivable DESC;
END;
$$;

-- 2) Fix get_payable_report: exclude cancelled stock_in
CREATE OR REPLACE FUNCTION public.get_payable_report(p_warehouse_id UUID)
RETURNS TABLE(supplier_id UUID, supplier_name TEXT, total_payable NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT si.supplier_id, COALESCE(sp.name, si.supplier_name) AS supplier_name,
         SUM(si.total_amount - si.amount_paid) AS total_payable
  FROM public.stock_in si
  LEFT JOIN public.suppliers sp ON sp.id = si.supplier_id
  WHERE si.warehouse_id = p_warehouse_id
    AND si.payment_status != 'PAID'
    AND si.status != 'CANCELLED'
    AND (si.total_amount - si.amount_paid) > 0
  GROUP BY si.supplier_id, COALESCE(sp.name, si.supplier_name)
  ORDER BY total_payable DESC;
END;
$$;

-- 3) Fix allocate_customer_payment: skip cancelled sales
CREATE OR REPLACE FUNCTION public.allocate_customer_payment(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining NUMERIC(14,2);
  v_sale RECORD;
  v_debt NUMERIC(14,2);
  v_pay NUMERIC(14,2);
  v_warehouse_id UUID;
  v_total_allocated NUMERIC(14,2) := 0;
  v_count INT := 0;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be > 0';
  END IF;

  SELECT warehouse_id INTO v_warehouse_id FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;

  v_remaining := p_amount;

  FOR v_sale IN
    SELECT id, total_revenue, amount_paid
    FROM public.sales
    WHERE customer_id = p_customer_id
      AND payment_status != 'PAID'
      AND status != 'CANCELLED'
      AND (total_revenue - amount_paid) > 0
    ORDER BY created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_debt := v_sale.total_revenue - v_sale.amount_paid;
    v_pay := LEAST(v_remaining, v_debt);

    INSERT INTO public.payments (warehouse_id, payment_type, source_type, source_id, customer_id, amount, payment_method, note, created_by)
    VALUES (v_warehouse_id, 'IN', 'SALE', v_sale.id, p_customer_id, v_pay, p_payment_method, p_note, auth.uid());

    UPDATE public.sales
    SET amount_paid = amount_paid + v_pay,
        payment_status = CASE WHEN (amount_paid + v_pay) >= total_revenue THEN 'PAID' ELSE 'PARTIAL' END
    WHERE id = v_sale.id;

    v_remaining := v_remaining - v_pay;
    v_total_allocated := v_total_allocated + v_pay;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'total_allocated', v_total_allocated,
    'invoices_paid', v_count,
    'remaining', v_remaining
  );
END;
$$;

-- 4) Fix allocate_supplier_payment: skip cancelled stock_in
CREATE OR REPLACE FUNCTION public.allocate_supplier_payment(
  p_supplier_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining NUMERIC(14,2);
  v_si RECORD;
  v_debt NUMERIC(14,2);
  v_pay NUMERIC(14,2);
  v_warehouse_id UUID;
  v_total_allocated NUMERIC(14,2) := 0;
  v_count INT := 0;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be > 0';
  END IF;

  SELECT warehouse_id INTO v_warehouse_id FROM public.suppliers WHERE id = p_supplier_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found'; END IF;

  v_remaining := p_amount;

  FOR v_si IN
    SELECT id, total_amount, amount_paid
    FROM public.stock_in
    WHERE supplier_id = p_supplier_id
      AND payment_status != 'PAID'
      AND status != 'CANCELLED'
      AND (total_amount - amount_paid) > 0
    ORDER BY created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_debt := v_si.total_amount - v_si.amount_paid;
    v_pay := LEAST(v_remaining, v_debt);

    INSERT INTO public.payments (warehouse_id, payment_type, source_type, source_id, supplier_id, amount, payment_method, note, created_by)
    VALUES (v_warehouse_id, 'OUT', 'STOCK_IN', v_si.id, p_supplier_id, v_pay, p_payment_method, p_note, auth.uid());

    UPDATE public.stock_in
    SET amount_paid = amount_paid + v_pay,
        payment_status = CASE WHEN (amount_paid + v_pay) >= total_amount THEN 'PAID' ELSE 'PARTIAL' END
    WHERE id = v_si.id;

    v_remaining := v_remaining - v_pay;
    v_total_allocated := v_total_allocated + v_pay;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'total_allocated', v_total_allocated,
    'invoices_paid', v_count,
    'remaining', v_remaining
  );
END;
$$;

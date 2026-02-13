-- =============================================
-- StockFlowQTfood - Bulk Payment Allocation
-- Allocate a lump-sum payment across multiple invoices
-- =============================================

-- 1) Allocate customer payment across unpaid sales (oldest first)
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

  -- Get warehouse from customer
  SELECT warehouse_id INTO v_warehouse_id FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;

  v_remaining := p_amount;

  FOR v_sale IN
    SELECT id, total_revenue, amount_paid
    FROM public.sales
    WHERE customer_id = p_customer_id
      AND payment_status != 'PAID'
      AND (total_revenue - amount_paid) > 0
    ORDER BY created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_debt := v_sale.total_revenue - v_sale.amount_paid;
    v_pay := LEAST(v_remaining, v_debt);

    -- Insert payment record
    INSERT INTO public.payments (warehouse_id, payment_type, source_type, source_id, customer_id, amount, payment_method, note, created_by)
    VALUES (v_warehouse_id, 'IN', 'SALE', v_sale.id, p_customer_id, v_pay, p_payment_method, p_note, auth.uid());

    -- Update sale
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

-- 2) Allocate supplier payment across unpaid stock_in (oldest first)
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

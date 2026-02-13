-- =============================================
-- StockFlowQTfood - Phase 6 Migration
-- Customers, Suppliers, Payments, Debt
-- =============================================

-- 1) CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_select_all" ON public.customers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "customers_insert_staff" ON public.customers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "customers_update_staff" ON public.customers FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "customers_delete_admin" ON public.customers FOR DELETE USING (public.is_admin());

-- 2) SUPPLIERS
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_select_all" ON public.suppliers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "suppliers_insert_staff" ON public.suppliers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "suppliers_update_staff" ON public.suppliers FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "suppliers_delete_admin" ON public.suppliers FOR DELETE USING (public.is_admin());

-- 3) Update sales: add customer_id, amount_paid, payment_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='customer_id') THEN
    ALTER TABLE public.sales ADD COLUMN customer_id UUID REFERENCES public.customers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='amount_paid') THEN
    ALTER TABLE public.sales ADD COLUMN amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='payment_status') THEN
    ALTER TABLE public.sales ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID';
  END IF;
END $$;

-- 4) Update stock_in: add supplier_id, amount_paid, payment_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_in' AND column_name='supplier_id') THEN
    ALTER TABLE public.stock_in ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_in' AND column_name='amount_paid') THEN
    ALTER TABLE public.stock_in ADD COLUMN amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_in' AND column_name='payment_status') THEN
    ALTER TABLE public.stock_in ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID';
  END IF;
END $$;

-- 5) PAYMENTS table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  supplier_id UUID REFERENCES public.suppliers(id),
  amount NUMERIC(14,2) NOT NULL,
  payment_method TEXT NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select_all" ON public.payments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "payments_insert_staff" ON public.payments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "payments_update_staff" ON public.payments FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "payments_delete_admin" ON public.payments FOR DELETE USING (public.is_admin());

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_customers_warehouse ON public.customers(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_warehouse ON public.suppliers(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);
CREATE INDEX IF NOT EXISTS idx_payments_warehouse ON public.payments(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_payments_source ON public.payments(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_type ON public.payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON public.sales(payment_status);
CREATE INDEX IF NOT EXISTS idx_stock_in_supplier ON public.stock_in(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_in_payment_status ON public.stock_in(payment_status);

-- =============================================
-- Update create_sale to accept customer_id
-- =============================================
CREATE OR REPLACE FUNCTION public.create_sale(
  p_warehouse_id UUID,
  p_customer_name TEXT,
  p_note TEXT,
  p_items JSONB,
  p_customer_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  INSERT INTO public.sales (warehouse_id, customer_name, customer_id, note, transaction_type, total_amount, total_revenue, total_cost_estimated, profit, created_by)
  VALUES (p_warehouse_id, p_customer_name, p_customer_id, p_note, 'SALE', 0, 0, 0, 0, auth.uid())
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_batch_id := (v_item ->> 'batch_id')::UUID;
    v_quantity := (v_item ->> 'quantity')::NUMERIC;
    v_sale_price := (v_item ->> 'sale_price')::NUMERIC;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be > 0 for product %', v_product_id;
    END IF;
    IF v_sale_price IS NULL OR v_sale_price < 0 THEN
      RAISE EXCEPTION 'Sale price must be >= 0 for product %', v_product_id;
    END IF;

    SELECT quantity_remaining, cost_price, warehouse_id
    INTO v_batch_remaining, v_batch_cost_price, v_batch_warehouse
    FROM public.inventory_batches WHERE id = v_batch_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', v_batch_id; END IF;
    IF v_batch_warehouse != p_warehouse_id THEN RAISE EXCEPTION 'Batch % does not belong to warehouse', v_batch_id; END IF;
    IF v_batch_remaining < v_quantity THEN RAISE EXCEPTION 'Insufficient stock for batch %', v_batch_id; END IF;

    v_item_revenue := v_quantity * v_sale_price;
    v_item_cost := v_quantity * v_batch_cost_price;
    v_total_revenue := v_total_revenue + v_item_revenue;
    v_total_cost := v_total_cost + v_item_cost;

    INSERT INTO public.sales_items (sale_id, product_id, batch_id, quantity, unit_price, total_price, sale_price, cost_price)
    VALUES (v_sale_id, v_product_id, v_batch_id, v_quantity, v_sale_price, v_item_revenue, v_sale_price, v_batch_cost_price);

    UPDATE public.inventory_batches SET quantity_remaining = quantity_remaining - v_quantity, updated_at = now() WHERE id = v_batch_id;
  END LOOP;

  UPDATE public.sales
  SET total_amount = v_total_revenue, total_revenue = v_total_revenue, total_cost_estimated = v_total_cost, profit = v_total_revenue - v_total_cost
  WHERE id = v_sale_id;

  RETURN v_sale_id;
END;
$$;

-- =============================================
-- Update create_stock_in to accept supplier_id
-- =============================================
CREATE OR REPLACE FUNCTION public.create_stock_in(
  p_warehouse_id UUID,
  p_supplier_name TEXT,
  p_note TEXT,
  p_items JSONB,
  p_supplier_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_in_id UUID;
  v_total_cost NUMERIC(14,2) := 0;
  v_item JSONB;
  v_product_id UUID;
  v_batch_code TEXT;
  v_expired_date DATE;
  v_quantity NUMERIC(12,2);
  v_cost_price NUMERIC(12,2);
  v_item_total NUMERIC(14,2);
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  INSERT INTO public.stock_in (warehouse_id, supplier_name, supplier_id, note, total_amount, created_by)
  VALUES (p_warehouse_id, p_supplier_name, p_supplier_id, p_note, 0, auth.uid())
  RETURNING id INTO v_stock_in_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_batch_code := v_item ->> 'batch_code';
    v_expired_date := (v_item ->> 'expired_date')::DATE;
    v_quantity := (v_item ->> 'quantity')::NUMERIC;
    v_cost_price := (v_item ->> 'cost_price')::NUMERIC;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be > 0 for product %', v_product_id; END IF;
    IF v_cost_price IS NULL OR v_cost_price < 0 THEN RAISE EXCEPTION 'Cost price must be >= 0 for product %', v_product_id; END IF;
    IF v_batch_code IS NULL OR v_batch_code = '' THEN RAISE EXCEPTION 'Batch code cannot be empty for product %', v_product_id; END IF;

    v_item_total := v_quantity * v_cost_price;
    v_total_cost := v_total_cost + v_item_total;

    INSERT INTO public.stock_in_items (stock_in_id, product_id, batch_code, expired_date, quantity, cost_price, unit_price, total_price)
    VALUES (v_stock_in_id, v_product_id, v_batch_code, v_expired_date, v_quantity, v_cost_price, v_cost_price, v_item_total);

    INSERT INTO public.inventory_batches (product_id, warehouse_id, batch_code, expiry_date, quantity, quantity_remaining, cost_price)
    VALUES (v_product_id, p_warehouse_id, v_batch_code, v_expired_date, v_quantity, v_quantity, v_cost_price)
    ON CONFLICT ON CONSTRAINT uq_inventory_batch_lookup
    DO UPDATE SET
      quantity = inventory_batches.quantity + EXCLUDED.quantity,
      quantity_remaining = inventory_batches.quantity_remaining + EXCLUDED.quantity_remaining,
      cost_price = EXCLUDED.cost_price,
      updated_at = now();
  END LOOP;

  UPDATE public.stock_in SET total_amount = v_total_cost WHERE id = v_stock_in_id;
  RETURN v_stock_in_id;
END;
$$;

-- =============================================
-- 6) RPC: add_sale_payment
-- =============================================
CREATE OR REPLACE FUNCTION public.add_sale_payment(
  p_sale_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_sale RECORD;
  v_new_paid NUMERIC(14,2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be > 0';
  END IF;

  SELECT id, warehouse_id, customer_id, total_revenue, amount_paid
  INTO v_sale FROM public.sales WHERE id = p_sale_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;

  v_new_paid := v_sale.amount_paid + p_amount;
  IF v_new_paid > v_sale.total_revenue THEN
    RAISE EXCEPTION 'Payment exceeds total revenue. Remaining: %', (v_sale.total_revenue - v_sale.amount_paid);
  END IF;

  INSERT INTO public.payments (warehouse_id, payment_type, source_type, source_id, customer_id, amount, payment_method, note, created_by)
  VALUES (v_sale.warehouse_id, 'IN', 'SALE', p_sale_id, v_sale.customer_id, p_amount, p_payment_method, p_note, auth.uid())
  RETURNING id INTO v_payment_id;

  UPDATE public.sales
  SET amount_paid = v_new_paid,
      payment_status = CASE WHEN v_new_paid >= total_revenue THEN 'PAID' ELSE 'PARTIAL' END
  WHERE id = p_sale_id;

  RETURN v_payment_id;
END;
$$;

-- =============================================
-- 7) RPC: add_stock_in_payment
-- =============================================
CREATE OR REPLACE FUNCTION public.add_stock_in_payment(
  p_stock_in_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_si RECORD;
  v_new_paid NUMERIC(14,2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be > 0';
  END IF;

  SELECT id, warehouse_id, supplier_id, total_amount, amount_paid
  INTO v_si FROM public.stock_in WHERE id = p_stock_in_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Stock-in % not found', p_stock_in_id; END IF;

  v_new_paid := v_si.amount_paid + p_amount;
  IF v_new_paid > v_si.total_amount THEN
    RAISE EXCEPTION 'Payment exceeds total cost. Remaining: %', (v_si.total_amount - v_si.amount_paid);
  END IF;

  INSERT INTO public.payments (warehouse_id, payment_type, source_type, source_id, supplier_id, amount, payment_method, note, created_by)
  VALUES (v_si.warehouse_id, 'OUT', 'STOCK_IN', p_stock_in_id, v_si.supplier_id, p_amount, p_payment_method, p_note, auth.uid())
  RETURNING id INTO v_payment_id;

  UPDATE public.stock_in
  SET amount_paid = v_new_paid,
      payment_status = CASE WHEN v_new_paid >= total_amount THEN 'PAID' ELSE 'PARTIAL' END
  WHERE id = p_stock_in_id;

  RETURN v_payment_id;
END;
$$;

-- =============================================
-- 8) RPC: get_receivable_report
-- =============================================
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
    AND (s.total_revenue - s.amount_paid) > 0
  GROUP BY s.customer_id, COALESCE(c.name, s.customer_name)
  ORDER BY total_receivable DESC;
END;
$$;

-- =============================================
-- 9) RPC: get_payable_report
-- =============================================
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
    AND (si.total_amount - si.amount_paid) > 0
  GROUP BY si.supplier_id, COALESCE(sp.name, si.supplier_name)
  ORDER BY total_payable DESC;
END;
$$;

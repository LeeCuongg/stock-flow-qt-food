-- =============================================
-- StockFlowQTfood - Phase 1 Database Migration
-- =============================================

-- 1. WAREHOUSES
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  unit TEXT NOT NULL DEFAULT 'kg',
  category TEXT,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. INVENTORY BATCHES
CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  batch_code TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  expiry_date DATE,
  manufactured_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. STOCK IN (phieu nhap kho)
CREATE TABLE IF NOT EXISTS public.stock_in (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  supplier_name TEXT,
  note TEXT,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_in_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_in_id UUID NOT NULL REFERENCES public.stock_in(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.inventory_batches(id),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- 5. SALES (phieu ban hang)
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  customer_name TEXT,
  note TEXT,
  transaction_type TEXT NOT NULL DEFAULT 'SALE',
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.inventory_batches(id),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- 6. LOSS RECORDS (ghi nhan hao hut / mat mat)
CREATE TABLE IF NOT EXISTS public.loss_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.inventory_batches(id),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. USER PROFILES
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff',
  warehouse_id UUID REFERENCES public.warehouses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loss_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- WAREHOUSES policies
CREATE POLICY "warehouses_select_all" ON public.warehouses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "warehouses_insert_admin" ON public.warehouses FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "warehouses_update_admin" ON public.warehouses FOR UPDATE USING (public.is_admin());
CREATE POLICY "warehouses_delete_admin" ON public.warehouses FOR DELETE USING (public.is_admin());

-- PRODUCTS policies
CREATE POLICY "products_select_all" ON public.products FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "products_insert_staff" ON public.products FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "products_update_staff" ON public.products FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "products_delete_admin" ON public.products FOR DELETE USING (public.is_admin());

-- INVENTORY_BATCHES policies
CREATE POLICY "batches_select_all" ON public.inventory_batches FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "batches_insert_staff" ON public.inventory_batches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "batches_update_staff" ON public.inventory_batches FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "batches_delete_admin" ON public.inventory_batches FOR DELETE USING (public.is_admin());

-- STOCK_IN policies
CREATE POLICY "stock_in_select_all" ON public.stock_in FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "stock_in_insert_staff" ON public.stock_in FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "stock_in_update_staff" ON public.stock_in FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "stock_in_delete_admin" ON public.stock_in FOR DELETE USING (public.is_admin());

-- STOCK_IN_ITEMS policies
CREATE POLICY "stock_in_items_select_all" ON public.stock_in_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "stock_in_items_insert_staff" ON public.stock_in_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "stock_in_items_update_staff" ON public.stock_in_items FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "stock_in_items_delete_admin" ON public.stock_in_items FOR DELETE USING (public.is_admin());

-- SALES policies
CREATE POLICY "sales_select_all" ON public.sales FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sales_insert_staff" ON public.sales FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sales_update_staff" ON public.sales FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "sales_delete_admin" ON public.sales FOR DELETE USING (public.is_admin());

-- SALES_ITEMS policies
CREATE POLICY "sales_items_select_all" ON public.sales_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sales_items_insert_staff" ON public.sales_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sales_items_update_staff" ON public.sales_items FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "sales_items_delete_admin" ON public.sales_items FOR DELETE USING (public.is_admin());

-- LOSS_RECORDS policies
CREATE POLICY "loss_records_select_all" ON public.loss_records FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "loss_records_insert_staff" ON public.loss_records FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "loss_records_update_staff" ON public.loss_records FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "loss_records_delete_admin" ON public.loss_records FOR DELETE USING (public.is_admin());

-- USER_PROFILES policies
CREATE POLICY "profiles_select_own" ON public.user_profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "profiles_insert_own" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.user_profiles FOR UPDATE USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles_delete_admin" ON public.user_profiles FOR DELETE USING (public.is_admin());

-- =============================================
-- AUTO-CREATE PROFILE TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'staff')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- SEED DATA
-- =============================================

-- Seed default warehouse
INSERT INTO public.warehouses (id, name, address) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Kho chinh', 'Ho Chi Minh City')
ON CONFLICT (id) DO NOTHING;

-- Seed 5 sample food products
INSERT INTO public.products (id, warehouse_id, name, sku, unit, category, price) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Thit heo tuoi', 'SP001', 'kg', 'Thit', 120000),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Ca hoi phi le', 'SP002', 'kg', 'Hai san', 350000),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Rau cai thia', 'SP003', 'bo', 'Rau cu', 15000),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Trung ga', 'SP004', 'vi', 'Trung/Sua', 35000),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Bot mi da dung', 'SP005', 'kg', 'Bot/Gia vi', 25000)
ON CONFLICT (id) DO NOTHING;

-- Seed 2 sample batches
INSERT INTO public.inventory_batches (id, product_id, warehouse_id, batch_code, quantity, expiry_date, manufactured_date) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'BATCH-2025-001', 50, '2025-03-15', '2025-02-01'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'BATCH-2025-002', 30, '2025-03-20', '2025-02-05')
ON CONFLICT (id) DO NOTHING;

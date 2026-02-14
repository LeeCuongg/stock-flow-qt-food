-- =============================================
-- StockFlowQTfood - Phase 6.5: Product Categories
-- =============================================

-- 1. CREATE product_categories TABLE
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. UNIQUE CONSTRAINT (warehouse_id, name)
ALTER TABLE public.product_categories
  ADD CONSTRAINT uq_product_categories_warehouse_name UNIQUE (warehouse_id, name);

-- 3. ADD category_id TO products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL;

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_product_categories_warehouse_id
  ON public.product_categories(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON public.products(category_id);

-- 5. RLS POLICIES for product_categories
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product_categories"
  ON public.product_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert product_categories"
  ON public.product_categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product_categories"
  ON public.product_categories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete product_categories"
  ON public.product_categories FOR DELETE
  TO authenticated
  USING (true);

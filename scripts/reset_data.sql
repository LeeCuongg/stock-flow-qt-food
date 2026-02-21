-- =============================================
-- StockFlowQTfood - RESET ALL DATA
-- Xoá toàn bộ dữ liệu giao dịch, giữ lại:
--   - warehouses
--   - user_profiles
--   - products (tuỳ chọn, mặc định GIỮ)
-- =============================================

-- 1) Xoá dữ liệu phụ thuộc trước (con trước, cha sau)
TRUNCATE TABLE public.sale_adjustments CASCADE;
TRUNCATE TABLE public.expense_records CASCADE;
TRUNCATE TABLE public.expense_categories CASCADE;
TRUNCATE TABLE public.document_revisions CASCADE;
TRUNCATE TABLE public.payments CASCADE;
TRUNCATE TABLE public.stock_in_landed_costs CASCADE;
TRUNCATE TABLE public.loss_records CASCADE;
TRUNCATE TABLE public.sales_items CASCADE;
TRUNCATE TABLE public.sales CASCADE;
TRUNCATE TABLE public.stock_in_items CASCADE;
TRUNCATE TABLE public.stock_in CASCADE;
TRUNCATE TABLE public.inventory_batches CASCADE;
TRUNCATE TABLE public.customer_product_prices CASCADE;
TRUNCATE TABLE public.supplier_product_prices CASCADE;
TRUNCATE TABLE public.customers CASCADE;
TRUNCATE TABLE public.suppliers CASCADE;

-- 2) Nếu muốn xoá luôn sản phẩm + danh mục, bỏ comment dòng dưới:
-- TRUNCATE TABLE public.product_categories CASCADE;
-- TRUNCATE TABLE public.products CASCADE;

-- 3) Nếu muốn xoá luôn kho (cẩn thận!), bỏ comment:
-- TRUNCATE TABLE public.warehouses CASCADE;

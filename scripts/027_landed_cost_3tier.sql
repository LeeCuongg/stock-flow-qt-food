-- =============================================
-- StockFlowQTfood - Phase 11: Landed Cost 3-Tier Model
-- Cho phép thêm Landed Cost bất kể đã xuất hay chưa
-- Tier 1: Chưa có sale → update batch cost_price bình thường
-- Tier 2: Có sale chưa payment → recalculate COGS trên sale
-- Tier 3: Có sale đã payment → ghi COGS_ADJUSTMENT kỳ hiện tại
-- =============================================

-- =============================================
-- 1) Mở rộng sale_adjustments cho COGS_ADJUSTMENT
-- =============================================
ALTER TABLE public.sale_adjustments DROP CONSTRAINT IF EXISTS chk_sale_adj_type;
ALTER TABLE public.sale_adjustments ADD CONSTRAINT chk_sale_adj_type
  CHECK (adjustment_type IN ('EXTRA_CHARGE', 'DISCOUNT', 'COGS_ADJUSTMENT'));

-- =============================================
-- 2) RPC: add_landed_cost (3-tier)
-- =============================================
CREATE OR REPLACE FUNCTION public.add_landed_cost(
  p_stock_in_id UUID,
  p_cost_type TEXT,
  p_amount NUMERIC,
  p_allocation_method TEXT DEFAULT 'BY_VALUE'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_si RECORD;
  v_landed_cost_id UUID;
  v_total_value NUMERIC(14,2) := 0;
  v_total_quantity NUMERIC(12,2) := 0;
  v_item RECORD;
  v_batch RECORD;
  v_allocation_share NUMERIC(14,6);
  v_allocated_amount NUMERIC(14,2);
  v_new_cost_price NUMERIC(12,2);
  v_old_cost_price NUMERIC(12,2);
  v_cost_diff_per_unit NUMERIC(12,2);
  v_sale_item RECORD;
  v_sale RECORD;
  v_cogs_delta NUMERIC(14,2);
BEGIN
  -- Validate inputs
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Số tiền phải > 0';
  END IF;
  IF p_allocation_method NOT IN ('BY_VALUE', 'BY_QUANTITY') THEN
    RAISE EXCEPTION 'Phương pháp phân bổ không hợp lệ: %. Phải là BY_VALUE hoặc BY_QUANTITY', p_allocation_method;
  END IF;
  IF p_cost_type IS NULL OR p_cost_type = '' THEN
    RAISE EXCEPTION 'Loại chi phí không được để trống';
  END IF;

  -- Lock stock_in row
  SELECT * INTO v_si
  FROM public.stock_in
  WHERE id = p_stock_in_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu nhập %', p_stock_in_id;
  END IF;

  IF v_si.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Không thể thêm chi phí cho phiếu đã hủy';
  END IF;

  -- Block if stock_in itself has payments (supplier payment)
  IF v_si.amount_paid > 0 THEN
    RAISE EXCEPTION 'Không thể thêm chi phí: phiếu nhập đã có thanh toán (amount_paid = %)', v_si.amount_paid;
  END IF;

  -- Compute totals for allocation
  SELECT COALESCE(SUM(sii.total_price), 0),
         COALESCE(SUM(sii.quantity), 0)
  INTO v_total_value, v_total_quantity
  FROM public.stock_in_items sii
  WHERE sii.stock_in_id = p_stock_in_id;

  IF v_total_quantity = 0 THEN
    RAISE EXCEPTION 'Phiếu nhập không có sản phẩm để phân bổ';
  END IF;

  -- Insert landed cost record
  INSERT INTO public.stock_in_landed_costs (stock_in_id, cost_type, amount, allocation_method)
  VALUES (p_stock_in_id, p_cost_type, p_amount, p_allocation_method)
  RETURNING id INTO v_landed_cost_id;

  -- Allocate to each item/batch
  FOR v_item IN
    SELECT sii.product_id, sii.batch_code, sii.expired_date, sii.quantity, sii.total_price
    FROM public.stock_in_items sii
    WHERE sii.stock_in_id = p_stock_in_id
  LOOP
    -- Compute allocation share
    IF p_allocation_method = 'BY_VALUE' THEN
      IF v_total_value > 0 THEN
        v_allocation_share := v_item.total_price / v_total_value;
      ELSE
        v_allocation_share := 1.0 / v_total_quantity;
      END IF;
    ELSE -- BY_QUANTITY
      v_allocation_share := v_item.quantity / v_total_quantity;
    END IF;

    v_allocated_amount := ROUND(p_amount * v_allocation_share, 2);
    v_cost_diff_per_unit := ROUND(v_allocated_amount / v_item.quantity, 2);

    -- Get the matching batch
    SELECT ib.id, ib.cost_price, ib.quantity
    INTO v_batch
    FROM public.inventory_batches ib
    WHERE ib.warehouse_id = v_si.warehouse_id
      AND ib.product_id = v_item.product_id
      AND ib.batch_code = v_item.batch_code
      AND ib.expiry_date IS NOT DISTINCT FROM v_item.expired_date;

    IF FOUND THEN
      v_old_cost_price := v_batch.cost_price;
      v_new_cost_price := v_old_cost_price + v_cost_diff_per_unit;

      -- Always update batch cost_price (for future sales)
      UPDATE public.inventory_batches
      SET cost_price = v_new_cost_price,
          updated_at = now()
      WHERE id = v_batch.id;

      -- Now handle existing sales that used this batch
      FOR v_sale_item IN
        SELECT si.id AS sale_item_id, si.sale_id, si.quantity AS sold_qty, si.cost_price AS old_si_cost
        FROM public.sales_items si
        JOIN public.sales s ON s.id = si.sale_id AND s.status != 'CANCELLED'
        WHERE si.batch_id = v_batch.id
      LOOP
        v_cogs_delta := v_sale_item.sold_qty * v_cost_diff_per_unit;

        -- Check if this sale has payments
        SELECT s.id, s.amount_paid, s.total_cost_estimated, s.total_revenue, s.profit
        INTO v_sale
        FROM public.sales s
        WHERE s.id = v_sale_item.sale_id;

        IF v_sale.amount_paid > 0 THEN
          -- TIER 3: Sale đã có payment → ghi COGS_ADJUSTMENT, không sửa sale
          INSERT INTO public.sale_adjustments (sale_id, adjustment_type, amount, note)
          VALUES (
            v_sale_item.sale_id,
            'COGS_ADJUSTMENT',
            v_cogs_delta,
            'Landed cost: ' || p_cost_type || ' (phiếu nhập ' || p_stock_in_id || ')'
          );
        ELSE
          -- TIER 2: Sale chưa payment → recalculate COGS trực tiếp
          UPDATE public.sales_items
          SET cost_price = v_sale_item.old_si_cost + v_cost_diff_per_unit
          WHERE id = v_sale_item.sale_item_id;

          UPDATE public.sales
          SET total_cost_estimated = total_cost_estimated + v_cogs_delta,
              profit = total_revenue - (total_cost_estimated + v_cogs_delta)
          WHERE id = v_sale_item.sale_id;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Update stock_in.total_amount
  UPDATE public.stock_in
  SET total_amount = total_amount + p_amount
  WHERE id = p_stock_in_id;

  RETURN v_landed_cost_id;
END;
$$;

-- =============================================
-- 3) Cập nhật get_financial_summary để tính COGS_ADJUSTMENT
-- COGS thực tế = total_cost_estimated + COGS_ADJUSTMENT
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
  v_cogs_adjustment NUMERIC(14,2);
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
    AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_date_from
    AND (s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_date_to;

  -- Extra charges
  SELECT COALESCE(SUM(sa.amount), 0)
  INTO v_extra_charge
  FROM public.sale_adjustments sa
  JOIN public.sales s ON s.id = sa.sale_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status = 'POSTED'
    AND sa.adjustment_type = 'EXTRA_CHARGE'
    AND (sa.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_date_from
    AND (sa.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_date_to;

  -- Discounts
  SELECT COALESCE(SUM(sa.amount), 0)
  INTO v_discount
  FROM public.sale_adjustments sa
  JOIN public.sales s ON s.id = sa.sale_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status = 'POSTED'
    AND sa.adjustment_type = 'DISCOUNT'
    AND (sa.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_date_from
    AND (sa.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_date_to;

  -- COGS Adjustments (from landed cost applied to paid sales)
  SELECT COALESCE(SUM(sa.amount), 0)
  INTO v_cogs_adjustment
  FROM public.sale_adjustments sa
  JOIN public.sales s ON s.id = sa.sale_id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status = 'POSTED'
    AND sa.adjustment_type = 'COGS_ADJUSTMENT'
    AND (sa.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_date_from
    AND (sa.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_date_to;

  -- Operating expenses
  SELECT COALESCE(SUM(er.amount), 0)
  INTO v_operating_expense
  FROM public.expense_records er
  WHERE er.warehouse_id = p_warehouse_id
    AND (er.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_date_from
    AND (er.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_date_to;

  -- COGS thực tế = base COGS + adjustments
  v_cogs := v_cogs + v_cogs_adjustment;
  v_gross_profit := v_revenue + v_extra_charge - v_discount - v_cogs;
  v_net_profit := v_gross_profit - v_operating_expense;

  RETURN jsonb_build_object(
    'revenue', v_revenue,
    'extra_charge', v_extra_charge,
    'discount', v_discount,
    'cogs', v_cogs,
    'cogs_adjustment', v_cogs_adjustment,
    'gross_profit', v_gross_profit,
    'operating_expense', v_operating_expense,
    'net_profit', v_net_profit
  );
END;
$$;

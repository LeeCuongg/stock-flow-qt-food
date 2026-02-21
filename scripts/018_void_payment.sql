-- =============================================
-- StockFlowQTfood - Phase 18: Void Payment
-- Huỷ thanh toán sai sót, giữ audit trail
-- =============================================

-- 1) Add status columns to payments table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='status') THEN
    ALTER TABLE public.payments ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='voided_at') THEN
    ALTER TABLE public.payments ADD COLUMN voided_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='voided_by') THEN
    ALTER TABLE public.payments ADD COLUMN voided_by UUID REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='void_reason') THEN
    ALTER TABLE public.payments ADD COLUMN void_reason TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- 2) RPC: void_payment
-- Huỷ 1 thanh toán, trừ lại amount_paid trên phiếu gốc
CREATE OR REPLACE FUNCTION public.void_payment(
  p_payment_id UUID,
  p_reason TEXT DEFAULT 'Huỷ thanh toán'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_new_paid NUMERIC(14,2);
BEGIN
  -- Only admin can void
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin mới được huỷ thanh toán';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy thanh toán %', p_payment_id;
  END IF;
  IF v_payment.status = 'VOIDED' THEN
    RAISE EXCEPTION 'Thanh toán này đã bị huỷ trước đó';
  END IF;

  -- Check source document is not cancelled
  IF v_payment.source_type = 'SALE' THEN
    IF EXISTS (SELECT 1 FROM public.sales WHERE id = v_payment.source_id AND status = 'CANCELLED') THEN
      RAISE EXCEPTION 'Không thể huỷ thanh toán: đơn bán đã bị huỷ';
    END IF;

    -- Subtract amount_paid on the sale
    UPDATE public.sales
    SET amount_paid = GREATEST(amount_paid - v_payment.amount, 0),
        payment_status = CASE
          WHEN GREATEST(amount_paid - v_payment.amount, 0) <= 0 THEN 'UNPAID'
          WHEN GREATEST(amount_paid - v_payment.amount, 0) < total_revenue THEN 'PARTIAL'
          ELSE 'PAID'
        END
    WHERE id = v_payment.source_id;

  ELSIF v_payment.source_type = 'STOCK_IN' THEN
    IF EXISTS (SELECT 1 FROM public.stock_in WHERE id = v_payment.source_id AND status = 'CANCELLED') THEN
      RAISE EXCEPTION 'Không thể huỷ thanh toán: phiếu nhập đã bị huỷ';
    END IF;

    -- Subtract amount_paid on the stock_in
    UPDATE public.stock_in
    SET amount_paid = GREATEST(amount_paid - v_payment.amount, 0),
        payment_status = CASE
          WHEN GREATEST(amount_paid - v_payment.amount, 0) <= 0 THEN 'UNPAID'
          WHEN GREATEST(amount_paid - v_payment.amount, 0) < total_amount THEN 'PARTIAL'
          ELSE 'PAID'
        END
    WHERE id = v_payment.source_id;
  END IF;

  -- Mark payment as voided
  UPDATE public.payments
  SET status = 'VOIDED',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = p_reason
  WHERE id = p_payment_id;

  RETURN p_payment_id;
END;
$$;

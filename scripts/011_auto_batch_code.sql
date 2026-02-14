-- =============================================
-- StockFlowQTfood - Auto Batch Code Generator
-- Format: {SKU}-{YYYYMMDD}-{SEQ}
-- VD: SP001-20260214-001
-- =============================================

-- Function: sinh mã lô tiếp theo cho 1 sản phẩm trong ngày
CREATE OR REPLACE FUNCTION public.generate_batch_code(
  p_product_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sku TEXT;
  v_product_name TEXT;
  v_prefix TEXT;
  v_date_str TEXT;
  v_pattern TEXT;
  v_max_seq INT;
  v_next_seq INT;
BEGIN
  -- Lấy SKU và tên sản phẩm
  SELECT sku, name INTO v_sku, v_product_name
  FROM public.products
  WHERE id = p_product_id;

  IF v_sku IS NULL OR v_sku = '' THEN
    -- Không có SKU -> dùng 4 ký tự đầu tên sản phẩm, viết hoa, bỏ dấu cách
    v_prefix := UPPER(REPLACE(LEFT(v_product_name, 4), ' ', ''));
  ELSE
    v_prefix := UPPER(v_sku);
  END IF;

  -- Format ngày
  v_date_str := TO_CHAR(p_date, 'YYYYMMDD');

  -- Pattern để tìm mã lô cùng prefix + ngày
  v_pattern := v_prefix || '-' || v_date_str || '-%';

  -- Tìm số thứ tự lớn nhất hiện có
  SELECT MAX(
    CAST(
      NULLIF(SUBSTRING(batch_code FROM LENGTH(v_prefix || '-' || v_date_str || '-') + 1), '')
      AS INT
    )
  )
  INTO v_max_seq
  FROM public.inventory_batches
  WHERE batch_code LIKE v_pattern;

  -- Nếu không tìm thấy, cũng check trong stock_in_items (phòng trường hợp chưa sync)
  IF v_max_seq IS NULL THEN
    SELECT MAX(
      CAST(
        NULLIF(SUBSTRING(batch_code FROM LENGTH(v_prefix || '-' || v_date_str || '-') + 1), '')
        AS INT
      )
    )
    INTO v_max_seq
    FROM public.stock_in_items
    WHERE batch_code LIKE v_pattern;
  END IF;

  v_next_seq := COALESCE(v_max_seq, 0) + 1;

  RETURN v_prefix || '-' || v_date_str || '-' || LPAD(v_next_seq::TEXT, 3, '0');
END;
$$;

-- Function: sinh batch code cho nhiều sản phẩm cùng lúc (dùng cho frontend)
CREATE OR REPLACE FUNCTION public.generate_batch_codes(
  p_product_ids UUID[],
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(product_id UUID, batch_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid UUID;
  v_code TEXT;
  v_seq_map JSONB := '{}'::JSONB;
  v_sku TEXT;
  v_product_name TEXT;
  v_prefix TEXT;
  v_date_str TEXT;
  v_pattern TEXT;
  v_max_seq INT;
  v_next_seq INT;
  v_key TEXT;
BEGIN
  v_date_str := TO_CHAR(p_date, 'YYYYMMDD');

  FOREACH v_pid IN ARRAY p_product_ids
  LOOP
    -- Lấy SKU
    SELECT p.sku, p.name INTO v_sku, v_product_name
    FROM public.products p
    WHERE p.id = v_pid;

    IF v_sku IS NULL OR v_sku = '' THEN
      v_prefix := UPPER(REPLACE(LEFT(v_product_name, 4), ' ', ''));
    ELSE
      v_prefix := UPPER(v_sku);
    END IF;

    v_key := v_prefix || '-' || v_date_str;
    v_pattern := v_key || '-%';

    -- Check nếu đã track prefix này trong batch hiện tại
    IF v_seq_map ? v_key THEN
      v_next_seq := (v_seq_map ->> v_key)::INT + 1;
    ELSE
      -- Tìm max seq từ DB
      SELECT MAX(
        CAST(
          NULLIF(SUBSTRING(ib.batch_code FROM LENGTH(v_key || '-') + 1), '')
          AS INT
        )
      )
      INTO v_max_seq
      FROM public.inventory_batches ib
      WHERE ib.batch_code LIKE v_pattern;

      IF v_max_seq IS NULL THEN
        SELECT MAX(
          CAST(
            NULLIF(SUBSTRING(si.batch_code FROM LENGTH(v_key || '-') + 1), '')
              AS INT
          )
        )
        INTO v_max_seq
        FROM public.stock_in_items si
        WHERE si.batch_code LIKE v_pattern;
      END IF;

      v_next_seq := COALESCE(v_max_seq, 0) + 1;
    END IF;

    -- Cập nhật map
    v_seq_map := jsonb_set(v_seq_map, ARRAY[v_key], to_jsonb(v_next_seq));

    v_code := v_key || '-' || LPAD(v_next_seq::TEXT, 3, '0');

    product_id := v_pid;
    batch_code := v_code;
    RETURN NEXT;
  END LOOP;
END;
$$;

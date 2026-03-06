-- Audit one batch end-to-end as a ledger table.
-- Change the value in params.batch_code before running.

WITH params AS (
  SELECT 'THIT-NGUA-TUOI-20260306-004'::text AS batch_code
),
target_batch AS (
  SELECT
    ib.id AS batch_id,
    ib.batch_code,
    ib.quantity AS batch_quantity,
    ib.quantity_remaining,
    ib.expiry_date,
    ib.created_at AS batch_created_at,
    ib.updated_at AS batch_updated_at,
    p.id AS product_id,
    p.name AS product_name,
    p.sku,
    p.unit,
    p.tolerance_type,
    p.tolerance_value,
    w.id AS warehouse_id,
    w.name AS warehouse_name
  FROM public.inventory_batches ib
  JOIN public.products p ON p.id = ib.product_id
  JOIN public.warehouses w ON w.id = ib.warehouse_id
  JOIN params prm ON prm.batch_code = ib.batch_code
),
ledger AS (
  SELECT
    si.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS event_time,
    'STOCK_IN'::text AS doc_type,
    si.id AS doc_id,
    COALESCE(si.status, 'POSTED') AS doc_status,
    tb.batch_id,
    tb.batch_code,
    tb.product_name,
    tb.sku,
    tb.unit,
    tb.warehouse_name,
    si.supplier_name AS partner_name,
    NULL::text AS reason,
    si.note,
    sii.quantity AS qty_in,
    0::numeric AS qty_out,
    CASE WHEN COALESCE(si.status, 'POSTED') = 'CANCELLED' THEN 0::numeric ELSE sii.quantity END AS net_qty,
    sii.cost_price AS unit_price,
    sii.total_price AS line_total,
    NULL::uuid AS linked_sale_id
  FROM target_batch tb
  JOIN public.stock_in_items sii
    ON sii.product_id = tb.product_id
   AND sii.batch_code = tb.batch_code
  JOIN public.stock_in si
    ON si.id = sii.stock_in_id
   AND si.warehouse_id = tb.warehouse_id

  UNION ALL

  SELECT
    s.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS event_time,
    'SALE'::text AS doc_type,
    s.id AS doc_id,
    COALESCE(s.status, 'POSTED') AS doc_status,
    tb.batch_id,
    tb.batch_code,
    tb.product_name,
    tb.sku,
    tb.unit,
    tb.warehouse_name,
    s.customer_name AS partner_name,
    NULL::text AS reason,
    s.note,
    0::numeric AS qty_in,
    si.quantity AS qty_out,
    CASE WHEN COALESCE(s.status, 'POSTED') = 'CANCELLED' THEN 0::numeric ELSE -si.quantity END AS net_qty,
    si.sale_price AS unit_price,
    si.total_price AS line_total,
    s.id AS linked_sale_id
  FROM target_batch tb
  JOIN public.sales_items si ON si.batch_id = tb.batch_id
  JOIN public.sales s ON s.id = si.sale_id

  UNION ALL

  -- Normal losses: qty_out (deduct)
  SELECT
    lr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS event_time,
    'LOSS'::text AS doc_type,
    lr.id AS doc_id,
    COALESCE(lr.status, 'ACTIVE') AS doc_status,
    tb.batch_id,
    tb.batch_code,
    tb.product_name,
    tb.sku,
    tb.unit,
    tb.warehouse_name,
    NULL::text AS partner_name,
    lr.reason,
    lr.note,
    0::numeric AS qty_in,
    lr.quantity AS qty_out,
    CASE WHEN COALESCE(lr.status, 'ACTIVE') = 'CANCELLED' THEN 0::numeric ELSE -lr.quantity END AS net_qty,
    lr.cost_price AS unit_price,
    lr.total_loss_cost AS line_total,
    lr.source_sale_id AS linked_sale_id
  FROM target_batch tb
  JOIN public.loss_records lr ON lr.batch_id = tb.batch_id
  WHERE lr.reason != 'AUTO_TOLERANCE'

  UNION ALL

  -- AUTO_TOLERANCE: qty_in (compensate / add to inventory)
  SELECT
    lr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS event_time,
    'TOLERANCE_COMPENSATE'::text AS doc_type,
    lr.id AS doc_id,
    COALESCE(lr.status, 'ACTIVE') AS doc_status,
    tb.batch_id,
    tb.batch_code,
    tb.product_name,
    tb.sku,
    tb.unit,
    tb.warehouse_name,
    NULL::text AS partner_name,
    lr.reason,
    lr.note,
    lr.quantity AS qty_in,
    0::numeric AS qty_out,
    CASE WHEN COALESCE(lr.status, 'ACTIVE') = 'CANCELLED' THEN 0::numeric ELSE lr.quantity END AS net_qty,
    lr.cost_price AS unit_price,
    lr.total_loss_cost AS line_total,
    lr.source_sale_id AS linked_sale_id
  FROM target_batch tb
  JOIN public.loss_records lr ON lr.batch_id = tb.batch_id
  WHERE lr.reason = 'AUTO_TOLERANCE'
)
SELECT
  l.event_time,
  l.doc_type,
  l.doc_id,
  l.doc_status,
  l.partner_name,
  l.reason,
  l.note,
  l.qty_in,
  l.qty_out,
  l.net_qty,
  SUM(l.net_qty) OVER (
    PARTITION BY l.batch_id
    ORDER BY l.event_time, l.doc_type, l.doc_id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_balance,
  l.unit_price,
  l.line_total,
  l.linked_sale_id,
  tb.tolerance_type,
  tb.tolerance_value,
  tb.batch_quantity AS current_batch_quantity,
  tb.quantity_remaining AS current_batch_remaining,
  tb.batch_updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS batch_updated_at
FROM ledger l
JOIN target_batch tb ON tb.batch_id = l.batch_id
ORDER BY l.event_time, l.doc_type, l.doc_id;
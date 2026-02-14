'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { CurrencyInput } from '@/components/ui/currency-input'

interface Customer { id: string; name: string }
interface Product { id: string; name: string; sku: string | null; unit: string; default_sale_price: number }
interface Batch {
  id: string; product_id: string; batch_code: string | null
  quantity_remaining: number; cost_price: number; expiry_date: string | null
}

interface EditSaleItem {
  product_id: string
  product_name: string
  product_unit: string
  batch_id: string
  batch_code: string
  batch_remaining: number
  batch_cost_price: number
  old_qty: number
  quantity: number
  sale_price: number
}

export default function SaleEditPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<EditSaleItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [originalStatus, setOriginalStatus] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const [saleRes, custRes, prodRes, batchRes] = await Promise.all([
      supabase
        .from('sales')
        .select('id, customer_id, note, status, sales_items(product_id, batch_id, quantity, sale_price, cost_price, products(name, unit), inventory_batches(id, batch_code, quantity_remaining, cost_price, expiry_date))')
        .eq('id', id)
        .single(),
      supabase.from('customers').select('id, name').order('name'),
      supabase.from('products').select('id, name, sku, unit, default_sale_price').order('name'),
      supabase.from('inventory_batches').select('id, product_id, batch_code, quantity_remaining, cost_price, expiry_date').order('expiry_date', { ascending: true, nullsFirst: false }),
    ])

    if (saleRes.error) { toast.error('Không tìm thấy đơn xuất'); router.push('/sales'); return }
    const sale = saleRes.data as unknown as {
      id: string; customer_id: string | null; note: string | null; status: string
      sales_items: {
        product_id: string; batch_id: string; quantity: number; sale_price: number; cost_price: number
        products: { name: string; unit: string } | null
        inventory_batches: { id: string; batch_code: string | null; quantity_remaining: number; cost_price: number; expiry_date: string | null } | null
      }[]
    }

    if (sale.status === 'CANCELLED') { toast.error('Đơn đã hủy, không thể chỉnh sửa'); router.push(`/sales/${id}`); return }

    setOriginalStatus(sale.status)
    setSelectedCustomerId(sale.customer_id || '')
    setNote(sale.note || '')
    setItems(sale.sales_items.map((si) => ({
      product_id: si.product_id,
      product_name: si.products?.name || '-',
      product_unit: si.products?.unit || '-',
      batch_id: si.batch_id,
      batch_code: si.inventory_batches?.batch_code || '-',
      batch_remaining: Number(si.inventory_batches?.quantity_remaining || 0),
      batch_cost_price: Number(si.inventory_batches?.cost_price || si.cost_price),
      old_qty: Number(si.quantity),
      quantity: Number(si.quantity),
      sale_price: Number(si.sale_price),
    })))
    setCustomers(custRes.data || [])
    setProducts(prodRes.data || [])
    setBatches(batchRes.data || [])
    setLoading(false)
  }, [id, router])

  useEffect(() => { loadData() }, [loadData])

  const filteredProducts = products.filter(
    (p) => p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  )

  // Include batches with remaining > 0 OR batches already in items (old batches)
  const batchesForProduct = (productId: string) => {
    const existingBatchIds = items.map((i) => i.batch_id)
    return batches.filter((b) => b.product_id === productId && (b.quantity_remaining > 0 || existingBatchIds.includes(b.id)))
  }

  const addItem = (batch: Batch) => {
    const product = products.find((p) => p.id === batch.product_id)
    if (!product) return
    if (items.some((i) => i.batch_id === batch.id)) { toast.error('Lô hàng đã được thêm'); return }
    setItems((prev) => [...prev, {
      product_id: product.id,
      product_name: product.name,
      product_unit: product.unit,
      batch_id: batch.id,
      batch_code: batch.batch_code || '-',
      batch_remaining: batch.quantity_remaining,
      batch_cost_price: batch.cost_price,
      old_qty: 0,
      quantity: 1,
      sale_price: product.default_sale_price ?? 0,
    }])
    setSelectedProductId('')
  }

  const updateItem = (index: number, field: keyof EditSaleItem, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const totalRevenue = items.reduce((sum, i) => sum + i.quantity * i.sale_price, 0)
  const totalCost = items.reduce((sum, i) => sum + i.quantity * i.batch_cost_price, 0)
  const totalProfit = totalRevenue - totalCost

  const maxQty = (item: EditSaleItem) => item.batch_remaining + item.old_qty

  const handleSubmit = async () => {
    if (items.length === 0) { toast.error('Cần ít nhất 1 sản phẩm'); return }
    for (const item of items) {
      if (item.quantity <= 0) { toast.error(`SL phải > 0 (${item.product_name})`); return }
      if (item.quantity > maxQty(item)) { toast.error(`SL vượt tồn kho (${item.product_name} - ${item.batch_code}). Max: ${maxQty(item)}`); return }
      if (item.sale_price < 0) { toast.error(`Giá bán phải >= 0 (${item.product_name})`); return }
    }
    setConfirmOpen(true)
  }

  const confirmSave = async () => {
    setConfirmOpen(false)
    setSaving(true)
    try {
      const rpcItems = items.map((item) => ({
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: item.quantity,
        sale_price: item.sale_price,
      }))
      const { error } = await supabase.rpc('update_sale', {
        p_sale_id: id,
        p_customer_id: selectedCustomerId || null,
        p_note: note.trim() || null,
        p_items: rpcItems,
      })
      if (error) throw error
      toast.success('Cập nhật đơn xuất thành công')
      router.push(`/sales/${id}`)
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground">Đang tải...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/sales/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chỉnh sửa đơn xuất</h1>
          <p className="text-sm text-muted-foreground">Trạng thái: {originalStatus}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Thông tin chung</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Khách hàng</Label>
              <Select value={selectedCustomerId || 'none'} onValueChange={(v) => setSelectedCustomerId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Không chọn --</SelectItem>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Ghi chú</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sản phẩm ({items.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Product select */}
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger><SelectValue placeholder="Chọn sản phẩm để thêm lô..." /></SelectTrigger>
            <SelectContent>
              <div className="p-2">
                <Input placeholder="Tìm..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="mb-2" />
              </div>
              {filteredProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''} - {p.unit}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Batch select for chosen product */}
          {selectedProductId && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Chọn lô hàng</Label>
              {batchesForProduct(selectedProductId).length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có lô hàng cho sản phẩm này.</p>
              ) : (
                batchesForProduct(selectedProductId).map((batch) => (
                  <div key={batch.id}
                    className="flex items-center justify-between border rounded-md p-2 hover:bg-muted/50 cursor-pointer"
                    onClick={() => addItem(batch)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') addItem(batch) }}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono text-xs">{batch.batch_code || '-'}</Badge>
                      <span className="text-sm">Tồn: <span className="font-medium">{Number(batch.quantity_remaining).toLocaleString('vi-VN')}</span></span>
                      {batch.expiry_date && <span className="text-xs text-muted-foreground">HSD: {new Date(batch.expiry_date).toLocaleDateString('vi-VN')}</span>}
                    </div>
                    <Button variant="ghost" size="sm" type="button"><Plus className="h-4 w-4" /></Button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Items list */}
          {items.map((item, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{item.product_name}</span>
                  <Badge variant="secondary" className="text-xs">{item.product_unit}</Badge>
                  <Badge variant="outline" className="font-mono text-xs">{item.batch_code}</Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Tồn hiện tại: {item.batch_remaining}</span>
                <span>• SL cũ: {item.old_qty}</span>
                <span>• Max: {maxQty(item)}</span>
                <span>• Giá vốn: {item.batch_cost_price.toLocaleString('vi-VN')}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Số lượng * (max {maxQty(item)})</Label>
                  <Input type="number" min={1} max={maxQty(item)} value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Giá bán *</Label>
                  <CurrencyInput value={item.sale_price} onValueChange={(v) => updateItem(idx, 'sale_price', v)} />
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Thành tiền: <span className="font-medium text-foreground">{(item.quantity * item.sale_price).toLocaleString('vi-VN')}</span>
                </span>
                <span className="text-muted-foreground">
                  Lãi: <span className={(item.quantity * item.sale_price - item.quantity * item.batch_cost_price) >= 0 ? 'font-medium text-green-600' : 'font-medium text-destructive'}>
                    {(item.quantity * item.sale_price - item.quantity * item.batch_cost_price).toLocaleString('vi-VN')}
                  </span>
                </span>
              </div>
            </div>
          ))}

          {items.length > 0 && (
            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tổng doanh thu:</span>
                <span className="font-medium">{totalRevenue.toLocaleString('vi-VN')} VND</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tổng giá vốn:</span>
                <span className="font-medium">{totalCost.toLocaleString('vi-VN')} VND</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>Lợi nhuận:</span>
                <span className={totalProfit >= 0 ? 'text-green-600' : 'text-destructive'}>
                  {totalProfit.toLocaleString('vi-VN')} VND
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push(`/sales/${id}`)}>Hủy</Button>
        <Button onClick={handleSubmit} disabled={saving || items.length === 0}>
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận cập nhật</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn cập nhật đơn xuất này? Tồn kho sẽ được điều chỉnh theo delta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Hủy</Button>
            <Button onClick={confirmSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Xác nhận'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

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

interface Supplier { id: string; name: string }
interface Product { id: string; name: string; sku: string | null; unit: string; default_cost_price: number }

interface EditItem {
  product_id: string
  product_name: string
  product_unit: string
  batch_code: string
  expired_date: string
  quantity: number
  cost_price: number
}

export default function StockInEditPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<EditItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [originalStatus, setOriginalStatus] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const [siRes, suppRes, prodRes] = await Promise.all([
      supabase
        .from('stock_in')
        .select('id, supplier_id, note, status, stock_in_items(product_id, batch_code, expired_date, quantity, cost_price, products(name, unit))')
        .eq('id', id)
        .single(),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('products').select('id, name, sku, unit, default_cost_price').order('name'),
    ])

    if (siRes.error) { toast.error('Không tìm thấy phiếu nhập'); router.push('/stock-in'); return }
    const si = siRes.data as unknown as {
      id: string; supplier_id: string | null; note: string | null; status: string
      stock_in_items: { product_id: string; batch_code: string; expired_date: string | null; quantity: number; cost_price: number; products: { name: string; unit: string } | null }[]
    }

    if (si.status === 'CANCELLED') { toast.error('Phiếu đã hủy, không thể chỉnh sửa'); router.push(`/stock-in/${id}`); return }

    setOriginalStatus(si.status)
    setSelectedSupplierId(si.supplier_id || '')
    setNote(si.note || '')
    setItems(si.stock_in_items.map((item) => ({
      product_id: item.product_id,
      product_name: item.products?.name || '-',
      product_unit: item.products?.unit || '-',
      batch_code: item.batch_code || '',
      expired_date: item.expired_date || '',
      quantity: Number(item.quantity),
      cost_price: Number(item.cost_price),
    })))
    setSuppliers(suppRes.data || [])
    setProducts(prodRes.data || [])
    setLoading(false)
  }, [id, router])

  useEffect(() => { loadData() }, [loadData])

  const filteredProducts = products.filter(
    (p) => p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  )

  const addItem = (product: Product) => {
    setItems((prev) => [...prev, {
      product_id: product.id,
      product_name: product.name,
      product_unit: product.unit,
      batch_code: '',
      expired_date: '',
      quantity: 1,
      cost_price: product.default_cost_price ?? 0,
    }])
    setProductSearch('')
  }

  const updateItem = (index: number, field: keyof EditItem, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const totalCost = items.reduce((sum, item) => sum + item.quantity * item.cost_price, 0)

  const handleSubmit = async () => {
    if (items.length === 0) { toast.error('Cần ít nhất 1 sản phẩm'); return }
    for (const item of items) {
      if (!item.batch_code.trim()) { toast.error(`Mã lô trống (${item.product_name})`); return }
      if (item.quantity <= 0) { toast.error(`SL phải > 0 (${item.product_name})`); return }
      if (item.cost_price < 0) { toast.error(`Giá nhập phải >= 0 (${item.product_name})`); return }
    }
    setConfirmOpen(true)
  }

  const confirmSave = async () => {
    setConfirmOpen(false)
    setSaving(true)
    try {
      const rpcItems = items.map((item) => ({
        product_id: item.product_id,
        batch_code: item.batch_code.trim(),
        expired_date: item.expired_date || null,
        quantity: item.quantity,
        cost_price: item.cost_price,
      }))
      const { error } = await supabase.rpc('update_stock_in', {
        p_stock_in_id: id,
        p_supplier_id: selectedSupplierId || null,
        p_note: note.trim() || null,
        p_items: rpcItems,
      })
      if (error) throw error
      toast.success('Cập nhật phiếu nhập thành công')
      router.push(`/stock-in/${id}`)
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground">Đang tải...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/stock-in/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chỉnh sửa phiếu nhập</h1>
          <p className="text-sm text-muted-foreground">Trạng thái: {originalStatus}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Thông tin chung</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Nhà cung cấp</Label>
              <Select value={selectedSupplierId || 'none'} onValueChange={(v) => setSelectedSupplierId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Không chọn --</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Danh sách sản phẩm ({items.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value="" onValueChange={(val) => { const p = products.find((p) => p.id === val); if (p) addItem(p) }}>
            <SelectTrigger><SelectValue placeholder="Thêm sản phẩm..." /></SelectTrigger>
            <SelectContent>
              <div className="p-2">
                <Input placeholder="Tìm..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="mb-2" />
              </div>
              {filteredProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''} - {p.unit}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {items.map((item, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{item.product_name}</span>
                  <Badge variant="secondary" className="ml-2 text-xs">{item.product_unit}</Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Mã lô *</Label>
                  <Input value={item.batch_code} onChange={(e) => updateItem(idx, 'batch_code', e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">HSD</Label>
                  <Input type="date" value={item.expired_date} onChange={(e) => updateItem(idx, 'expired_date', e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Số lượng *</Label>
                  <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Giá nhập *</Label>
                  <CurrencyInput value={item.cost_price} onValueChange={(v) => updateItem(idx, 'cost_price', v)} />
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                Thành tiền: <span className="font-medium text-foreground">{(item.quantity * item.cost_price).toLocaleString('vi-VN')} VND</span>
              </div>
            </div>
          ))}

          {items.length > 0 && (
            <div className="flex justify-end pt-2 border-t">
              <div className="text-sm font-medium">Tổng cộng: <span className="text-lg">{totalCost.toLocaleString('vi-VN')}</span> VND</div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push(`/stock-in/${id}`)}>Hủy</Button>
        <Button onClick={handleSubmit} disabled={saving || items.length === 0}>
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận cập nhật</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn cập nhật phiếu nhập này? Tồn kho sẽ được điều chỉnh theo delta.
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

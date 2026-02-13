'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
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
import { Plus, Trash2, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'

interface Product {
  id: string
  name: string
  sku: string | null
  unit: string
  default_sale_price: number
}

interface Batch {
  id: string
  product_id: string
  batch_code: string | null
  quantity_remaining: number
  cost_price: number
  expiry_date: string | null
}

interface SaleItem {
  product_id: string
  product_name: string
  product_unit: string
  batch_id: string
  batch_code: string
  batch_remaining: number
  batch_cost_price: number
  expiry_date: string | null
  quantity: number
  sale_price: number
}

interface SaleRecord {
  id: string
  customer_name: string | null
  note: string | null
  total_revenue: number
  total_cost_estimated: number
  profit: number
  created_at: string
}

export default function SalesPage() {
  const [records, setRecords] = useState<SaleRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<SaleItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const supabase = createClient()

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('sales')
      .select('id, customer_name, note, total_revenue, total_cost_estimated, profit, created_at')
      .order('created_at', { ascending: false })
    if (error) toast.error('Lỗi tải đơn bán')
    else setRecords(data || [])
    setIsLoading(false)
  }, [])

  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, unit, default_sale_price')
      .order('name')
    setProducts(data || [])
  }, [])

  const loadBatches = useCallback(async () => {
    const { data } = await supabase
      .from('inventory_batches')
      .select('id, product_id, batch_code, quantity_remaining, cost_price, expiry_date')
      .gt('quantity_remaining', 0)
      .order('expiry_date', { ascending: true, nullsFirst: false })
    setBatches(data || [])
  }, [])

  useEffect(() => {
    loadRecords()
    loadProducts()
    loadBatches()
  }, [loadRecords, loadProducts, loadBatches])

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  )

  // Batches for a selected product (only those with remaining > 0)
  const batchesForProduct = (productId: string) =>
    batches.filter((b) => b.product_id === productId && b.quantity_remaining > 0)

  const openCreate = () => {
    setCustomerName('')
    setNote('')
    setItems([])
    setSelectedProductId('')
    setProductSearch('')
    setDialogOpen(true)
    // Reload batches to get fresh remaining quantities
    loadBatches()
  }

  const addItem = (batch: Batch) => {
    const product = products.find((p) => p.id === batch.product_id)
    if (!product) return
    // Prevent adding same batch twice
    if (items.some((i) => i.batch_id === batch.id)) {
      toast.error('Lô hàng này đã được thêm')
      return
    }
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        product_unit: product.unit,
        batch_id: batch.id,
        batch_code: batch.batch_code || '-',
        batch_remaining: batch.quantity_remaining,
        batch_cost_price: batch.cost_price,
        expiry_date: batch.expiry_date,
        quantity: 1,
        sale_price: product.default_sale_price || 0,
      },
    ])
    setSelectedProductId('')
  }

  const updateItem = (index: number, field: keyof SaleItem, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const totalRevenue = items.reduce((sum, i) => sum + i.quantity * i.sale_price, 0)
  const totalCost = items.reduce((sum, i) => sum + i.quantity * i.batch_cost_price, 0)
  const totalProfit = totalRevenue - totalCost

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error('Vui lòng thêm ít nhất 1 sản phẩm')
      return
    }
    for (const item of items) {
      if (item.quantity <= 0) {
        toast.error(`Số lượng phải > 0 (${item.product_name})`)
        return
      }
      if (item.quantity > item.batch_remaining) {
        toast.error(`Số lượng vượt tồn kho (${item.product_name} - ${item.batch_code}). Tồn: ${item.batch_remaining}`)
        return
      }
      if (item.sale_price < 0) {
        toast.error(`Giá bán phải >= 0 (${item.product_name})`)
        return
      }
    }

    setSaving(true)
    try {
      const { data: warehouses } = await supabase.from('warehouses').select('id').limit(1)
      const warehouseId = warehouses?.[0]?.id
      if (!warehouseId) {
        toast.error('Chưa có kho')
        return
      }

      const rpcItems = items.map((item) => ({
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: item.quantity,
        sale_price: item.sale_price,
      }))

      const { error } = await supabase.rpc('create_sale', {
        p_warehouse_id: warehouseId,
        p_customer_name: customerName.trim() || null,
        p_note: note.trim() || null,
        p_items: rpcItems,
      })

      if (error) throw error
      toast.success('Tạo đơn bán hàng thành công')
      setDialogOpen(false)
      loadRecords()
      loadBatches()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      toast.error(`Lỗi: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bán hàng</h1>
          <p className="text-sm text-muted-foreground">Quản lý đơn bán hàng</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Tạo đơn bán
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách đơn bán</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có đơn bán</h3>
              <p className="text-sm text-muted-foreground mt-1">Nhấn &quot;Tạo đơn bán&quot; để bắt đầu.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Lợi nhuận</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.created_at).toLocaleDateString('vi-VN')}</TableCell>
                    <TableCell>{r.customer_name || '-'}</TableCell>
                    <TableCell className="text-right font-medium">
                      {Number(r.total_revenue).toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={Number(r.profit) >= 0 ? 'text-green-600' : 'text-destructive'}>
                        {Number(r.profit).toLocaleString('vi-VN')}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Sale Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo đơn bán hàng</DialogTitle>
            <DialogDescription>Chọn sản phẩm từ lô hàng tồn kho</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="customer">Khách hàng</Label>
                <Input id="customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Tên khách hàng" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sale-note">Ghi chú</Label>
                <Textarea id="sale-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú đơn bán" rows={1} />
              </div>
            </div>

            {/* Step 1: Select product */}
            <div className="grid gap-2">
              <Label>Chọn sản phẩm</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn sản phẩm..." />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input placeholder="Tìm sản phẩm..." value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)} className="mb-2" />
                  </div>
                  {filteredProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(${p.sku})` : ''} - {p.unit}
                    </SelectItem>
                  ))}
                  {filteredProducts.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground text-center">Không tìm thấy</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Select batch for chosen product */}
            {selectedProductId && (
              <div className="grid gap-2">
                <Label>Chọn lô hàng</Label>
                {batchesForProduct(selectedProductId).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Không có lô hàng còn tồn cho sản phẩm này.</p>
                ) : (
                  <div className="space-y-2">
                    {batchesForProduct(selectedProductId).map((batch) => (
                      <div key={batch.id}
                        className="flex items-center justify-between border rounded-md p-2 hover:bg-muted/50 cursor-pointer"
                        onClick={() => addItem(batch)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') addItem(batch) }}
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="font-mono text-xs">{batch.batch_code || '-'}</Badge>
                          <span className="text-sm">
                            Tồn: <span className="font-medium">{Number(batch.quantity_remaining).toLocaleString('vi-VN')}</span>
                          </span>
                          {batch.expiry_date && (
                            <span className="text-xs text-muted-foreground">
                              HSD: {new Date(batch.expiry_date).toLocaleDateString('vi-VN')}
                            </span>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" type="button">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Items list */}
            {items.length > 0 && (
              <div className="space-y-3">
                <Label>Sản phẩm đã chọn ({items.length})</Label>
                {items.map((item, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-3 relative">
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
                      <span>Tồn: {item.batch_remaining}</span>
                      {item.expiry_date && (
                        <span>• HSD: {new Date(item.expiry_date).toLocaleDateString('vi-VN')}</span>
                      )}
                      <span>• Giá vốn: {item.batch_cost_price.toLocaleString('vi-VN')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Số lượng * (tối đa {item.batch_remaining})</Label>
                        <Input type="number" min={1} max={item.batch_remaining} value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Giá bán *</Label>
                        <Input type="number" min={0} value={item.sale_price}
                          onChange={(e) => updateItem(idx, 'sale_price', Number(e.target.value))} />
                      </div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Thành tiền: <span className="font-medium text-foreground">{(item.quantity * item.sale_price).toLocaleString('vi-VN')}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Lãi: <span className={
                          (item.quantity * item.sale_price - item.quantity * item.batch_cost_price) >= 0
                            ? 'font-medium text-green-600'
                            : 'font-medium text-destructive'
                        }>
                          {(item.quantity * item.sale_price - item.quantity * item.batch_cost_price).toLocaleString('vi-VN')}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}

                {/* Totals */}
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
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={saving || items.length === 0}>
              {saving ? 'Đang lưu...' : 'Tạo đơn bán'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

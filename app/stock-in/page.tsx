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
import { Plus, Trash2, PackagePlus } from 'lucide-react'
import { toast } from 'sonner'

interface Product {
  id: string
  name: string
  sku: string | null
  unit: string
  default_cost_price: number
}

interface StockInItem {
  product_id: string
  product_name: string
  product_unit: string
  batch_code: string
  expired_date: string
  quantity: number
  cost_price: number
}

interface StockInRecord {
  id: string
  supplier_name: string | null
  note: string | null
  total_amount: number
  created_at: string
  warehouse_id: string
}

export default function StockInPage() {
  const [records, setRecords] = useState<StockInRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<StockInItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  const supabase = createClient()

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('stock_in')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) toast.error('Lỗi tải phiếu nhập')
    else setRecords(data || [])
    setIsLoading(false)
  }, [])

  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, unit, default_cost_price')
      .order('name')
    setProducts(data || [])
  }, [])

  useEffect(() => {
    loadRecords()
    loadProducts()
  }, [loadRecords, loadProducts])

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  )

  const openCreate = () => {
    setSupplierName('')
    setNote('')
    setItems([])
    setProductSearch('')
    setDialogOpen(true)
  }

  const addItem = (product: Product) => {
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        product_unit: product.unit,
        batch_code: '',
        expired_date: '',
        quantity: 1,
        cost_price: product.default_cost_price || 0,
      },
    ])
    setProductSearch('')
  }

  const updateItem = (index: number, field: keyof StockInItem, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const totalCost = items.reduce((sum, item) => sum + item.quantity * item.cost_price, 0)

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error('Vui lòng thêm ít nhất 1 sản phẩm')
      return
    }
    for (const item of items) {
      if (!item.batch_code.trim()) {
        toast.error(`Mã lô không được để trống (${item.product_name})`)
        return
      }
      if (item.quantity <= 0) {
        toast.error(`Số lượng phải > 0 (${item.product_name})`)
        return
      }
      if (item.cost_price < 0) {
        toast.error(`Giá nhập phải >= 0 (${item.product_name})`)
        return
      }
    }

    setSaving(true)
    try {
      // Get first warehouse
      const { data: warehouses } = await supabase.from('warehouses').select('id').limit(1)
      const warehouseId = warehouses?.[0]?.id
      if (!warehouseId) {
        toast.error('Chưa có kho')
        return
      }

      const rpcItems = items.map((item) => ({
        product_id: item.product_id,
        batch_code: item.batch_code.trim(),
        expired_date: item.expired_date || null,
        quantity: item.quantity,
        cost_price: item.cost_price,
      }))

      const { error } = await supabase.rpc('create_stock_in', {
        p_warehouse_id: warehouseId,
        p_supplier_name: supplierName.trim() || null,
        p_note: note.trim() || null,
        p_items: rpcItems,
      })

      if (error) throw error
      toast.success('Tạo phiếu nhập kho thành công')
      setDialogOpen(false)
      loadRecords()
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
          <h1 className="text-2xl font-bold tracking-tight">Nhập kho</h1>
          <p className="text-sm text-muted-foreground">Quản lý phiếu nhập kho</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Tạo phiếu nhập
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách phiếu nhập</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <PackagePlus className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có phiếu nhập</h3>
              <p className="text-sm text-muted-foreground mt-1">Nhấn &quot;Tạo phiếu nhập&quot; để bắt đầu.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead>Nhà cung cấp</TableHead>
                  <TableHead>Ghi chú</TableHead>
                  <TableHead className="text-right">Tổng tiền (VND)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.created_at).toLocaleDateString('vi-VN')}</TableCell>
                    <TableCell>{r.supplier_name || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.note || '-'}</TableCell>
                    <TableCell className="text-right font-medium">
                      {Number(r.total_amount).toLocaleString('vi-VN')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Stock-In Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo phiếu nhập kho</DialogTitle>
            <DialogDescription>Nhập thông tin phiếu nhập và danh sách sản phẩm</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="supplier">Nhà cung cấp</Label>
                <Input id="supplier" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Tên nhà cung cấp" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="note">Ghi chú</Label>
                <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú phiếu nhập" rows={1} />
              </div>
            </div>

            {/* Product search & add */}
            <div className="grid gap-2">
              <Label>Thêm sản phẩm</Label>
              <Select
                value=""
                onValueChange={(val) => {
                  const product = products.find((p) => p.id === val)
                  if (product) addItem(product)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn sản phẩm..." />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Tìm sản phẩm..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="mb-2"
                    />
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

            {/* Items table */}
            {items.length > 0 && (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Mã lô *</TableHead>
                      <TableHead>HSD</TableHead>
                      <TableHead>SL *</TableHead>
                      <TableHead>Giá nhập *</TableHead>
                      <TableHead className="text-right">Thành tiền</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div className="text-sm font-medium">{item.product_name}</div>
                          <Badge variant="secondary" className="text-xs">{item.product_unit}</Badge>
                        </TableCell>
                        <TableCell>
                          <Input className="w-28" value={item.batch_code}
                            onChange={(e) => updateItem(idx, 'batch_code', e.target.value)} placeholder="VD: LOT-001" />
                        </TableCell>
                        <TableCell>
                          <Input type="date" className="w-36" value={item.expired_date}
                            onChange={(e) => updateItem(idx, 'expired_date', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" className="w-20" min={1} value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" className="w-28" min={0} value={item.cost_price}
                            onChange={(e) => updateItem(idx, 'cost_price', Number(e.target.value))} />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {(item.quantity * item.cost_price).toLocaleString('vi-VN')}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end p-3 border-t">
                  <div className="text-sm font-medium">
                    Tổng: <span className="text-lg">{totalCost.toLocaleString('vi-VN')}</span> VND
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={saving || items.length === 0}>
              {saving ? 'Đang lưu...' : 'Tạo phiếu nhập'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

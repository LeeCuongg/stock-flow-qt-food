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
import { Plus, Trash2, ShoppingCart, CreditCard, Eye, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CurrencyInput } from '@/components/ui/currency-input'

interface Customer { id: string; name: string }

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK', label: 'Chuyển khoản' },
  { value: 'MOMO', label: 'MoMo' },
  { value: 'ZALOPAY', label: 'ZaloPay' },
  { value: 'OTHER', label: 'Khác' },
]

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
  customer_id: string | null
  note: string | null
  total_revenue: number
  total_cost_estimated: number
  profit: number
  amount_paid: number
  payment_status: string
  created_at: string
}

interface SaleDetail {
  id: string
  customer_name: string | null
  note: string | null
  total_revenue: number
  total_cost_estimated: number
  profit: number
  amount_paid: number
  payment_status: string
  created_at: string
  sales_items: {
    quantity: number
    sale_price: number
    cost_price: number
    total_price: number
    products: { name: string; unit: string } | null
    inventory_batches: { batch_code: string | null; expiry_date: string | null } | null
  }[]
}

export default function SalesPage() {
  const [records, setRecords] = useState<SaleRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [note, setNote] = useState('')
  const [items, setItems] = useState<SaleItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  // Payment modal
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingSale, setPayingSale] = useState<SaleRecord | null>(null)
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('CASH')
  const [payNote, setPayNote] = useState('')
  const [payingSaving, setPayingSaving] = useState(false)
  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [saleDetail, setSaleDetail] = useState<SaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [customerPrices, setCustomerPrices] = useState<Record<string, number>>({})
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancellingSale, setCancellingSale] = useState<SaleRecord | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('sales')
      .select('id, customer_name, customer_id, note, total_revenue, total_cost_estimated, profit, amount_paid, payment_status, created_at')
      .neq('status', 'CANCELLED')
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

  const loadCustomers = useCallback(async () => {
    const { data } = await supabase.from('customers').select('id, name').order('name')
    setCustomers(data || [])
  }, [])

  useEffect(() => {
    loadRecords()
    loadProducts()
    loadBatches()
    loadCustomers()
  }, [loadRecords, loadProducts, loadBatches, loadCustomers])

  const loadCustomerPrices = useCallback(async (customerId: string) => {
    if (!customerId) {
      setCustomerPrices({})
      return
    }
    const { data } = await supabase
      .from('customer_product_prices')
      .select('product_id, sale_price')
      .eq('customer_id', customerId)
    if (data) {
      const map: Record<string, number> = {}
      data.forEach((row: { product_id: string; sale_price: number }) => {
        map[row.product_id] = row.sale_price
      })
      setCustomerPrices(map)
    }
  }, [])

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
    setCustomerPhone('')
    setCustomerAddress('')
    setSelectedCustomerId('')
    setNote('')
    setItems([])
    setSelectedProductId('')
    setProductSearch('')
    setDialogOpen(true)
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
        sale_price: customerPrices[product.id] ?? product.default_sale_price ?? 0,
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

      let customerId = selectedCustomerId || null
      // Auto-create customer if new name entered
      if (!customerId && customerName.trim()) {
        const { data: newCust, error: cErr } = await supabase
          .from('customers')
          .insert({ name: customerName.trim(), phone: customerPhone.trim() || null, address: customerAddress.trim() || null, warehouse_id: warehouseId })
          .select('id')
          .single()
        if (cErr) throw cErr
        customerId = newCust.id
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
        p_customer_id: customerId,
      })

      if (error) throw error
      toast.success('Tạo đơn xuất kho thành công')
      setDialogOpen(false)
      loadRecords()
      loadBatches()
      loadCustomers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      toast.error(`Lỗi: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  const openPayment = (sale: SaleRecord) => {
    setPayingSale(sale)
    setPayAmount(sale.total_revenue - sale.amount_paid)
    setPayMethod('CASH')
    setPayNote('')
    setPayDialogOpen(true)
  }

  const handlePayment = async () => {
    if (!payingSale || payAmount <= 0) { toast.error('Số tiền phải > 0'); return }
    setPayingSaving(true)
    try {
      const { error } = await supabase.rpc('add_sale_payment', {
        p_sale_id: payingSale.id,
        p_amount: payAmount,
        p_payment_method: payMethod,
        p_note: payNote.trim() || null,
      })
      if (error) throw error
      toast.success('Thanh toán thành công')
      setPayDialogOpen(false)
      loadRecords()
    } catch (err: unknown) { toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`) }
    finally { setPayingSaving(false) }
  }

  const paymentStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID': return <Badge className="bg-green-600 text-white hover:bg-green-700">Đã TT</Badge>
      case 'PARTIAL': return <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">TT một phần</Badge>
      default: return <Badge variant="destructive">Chưa TT</Badge>
    }
  }

  const openSaleDetail = async (record: SaleRecord) => {
    setDetailOpen(true)
    setSaleDetail(null)
    setDetailLoading(true)
    const { data, error } = await supabase
      .from('sales')
      .select('id, customer_name, note, total_revenue, total_cost_estimated, profit, amount_paid, payment_status, created_at, sales_items(quantity, sale_price, cost_price, total_price, products(name, unit), inventory_batches(batch_code, expiry_date))')
      .eq('id', record.id)
      .single()
    if (error) toast.error('Lỗi tải chi tiết')
    else setSaleDetail(data as unknown as SaleDetail)
    setDetailLoading(false)
  }

  const openCancelDialog = (record: SaleRecord) => {
    setCancellingSale(record)
    setCancelReason('')
    setCancelDialogOpen(true)
  }

  const handleCancelSale = async () => {
    if (!cancellingSale) return
    setCancelSaving(true)
    try {
      const { error } = await supabase.rpc('cancel_sale', {
        p_sale_id: cancellingSale.id,
        p_reason: cancelReason.trim() || 'Huỷ đơn xuất',
      })
      if (error) throw error
      toast.success('Đã huỷ đơn xuất')
      setCancelDialogOpen(false)
      loadRecords()
      loadBatches()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setCancelSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Xuất kho</h1>
          <p className="text-sm text-muted-foreground">Quản lý đơn xuất kho</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Tạo đơn xuất
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách đơn xuất</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có đơn bán</h3>
              <p className="text-sm text-muted-foreground mt-1">Nhấn &quot;Tạo đơn xuất&quot; để bắt đầu.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Đã TT</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Lợi nhuận</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => openSaleDetail(r)}>
                    <TableCell>{new Date(r.created_at).toLocaleDateString('vi-VN')}</TableCell>
                    <TableCell>{r.customer_name || '-'}</TableCell>
                    <TableCell className="text-right font-medium">
                      {Number(r.total_revenue).toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(r.amount_paid).toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell>{paymentStatusBadge(r.payment_status)}</TableCell>
                    <TableCell className="text-right">
                      <span className={Number(r.profit) >= 0 ? 'text-green-600' : 'text-destructive'}>
                        {Number(r.profit).toLocaleString('vi-VN')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/sales/${r.id}`) }}>
                          <Eye className="mr-1 h-3 w-3" /> Xem
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/sales/${r.id}/edit`) }}>
                          <Pencil className="mr-1 h-3 w-3" /> Sửa
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); openCancelDialog(r) }}>
                          <Trash2 className="mr-1 h-3 w-3" /> Huỷ
                        </Button>
                        {r.payment_status !== 'PAID' && (
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openPayment(r) }}>
                            <CreditCard className="mr-1 h-3 w-3" /> Thanh toán
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Sale Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết đơn xuất</DialogTitle>
            <DialogDescription>
              {saleDetail ? new Date(saleDetail.created_at).toLocaleString('vi-VN') : ''}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : saleDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Khách hàng:</span> {saleDetail.customer_name || '-'}</div>
                <div><span className="text-muted-foreground">Ghi chú:</span> {saleDetail.note || '-'}</div>
                <div><span className="text-muted-foreground">Doanh thu:</span> <span className="font-medium">{Number(saleDetail.total_revenue).toLocaleString('vi-VN')} VND</span></div>
                <div><span className="text-muted-foreground">Giá vốn:</span> {Number(saleDetail.total_cost_estimated).toLocaleString('vi-VN')} VND</div>
                <div><span className="text-muted-foreground">Lợi nhuận:</span> <span className={Number(saleDetail.profit) >= 0 ? 'font-medium text-green-600' : 'font-medium text-destructive'}>{Number(saleDetail.profit).toLocaleString('vi-VN')} VND</span></div>
                <div><span className="text-muted-foreground">Đã TT:</span> {Number(saleDetail.amount_paid).toLocaleString('vi-VN')} VND</div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Mã lô</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead className="text-right">Giá bán</TableHead>
                    <TableHead className="text-right">Giá vốn</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saleDetail.sales_items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{item.products?.name || '-'} <span className="text-xs text-muted-foreground">({item.products?.unit})</span></TableCell>
                      <TableCell className="font-mono text-xs">{item.inventory_batches?.batch_code || '-'}</TableCell>
                      <TableCell className="text-right">{Number(item.quantity).toLocaleString('vi-VN')}</TableCell>
                      <TableCell className="text-right">{Number(item.sale_price).toLocaleString('vi-VN')}</TableCell>
                      <TableCell className="text-right">{Number(item.cost_price).toLocaleString('vi-VN')}</TableCell>
                      <TableCell className="text-right font-medium">{Number(item.total_price).toLocaleString('vi-VN')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Sale Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo đơn xuất kho</DialogTitle>
            <DialogDescription>Chọn sản phẩm từ lô hàng tồn kho</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Khách hàng</Label>
                <Select value={selectedCustomerId} onValueChange={(val) => {
                  if (val === 'none') {
                    setSelectedCustomerId('')
                    setCustomerName('')
                    setCustomerPrices({})
                  } else {
                    setSelectedCustomerId(val)
                    const c = customers.find((c) => c.id === val)
                    if (c) setCustomerName(c.name)
                    loadCustomerPrices(val)
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Chọn khách hàng..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Nhập tay --</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedCustomerId && (
                  <>
                    <Input
                      placeholder="Nhập tên khách hàng mới..."
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="SĐT"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                      />
                      <Input
                        placeholder="Địa chỉ"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                      />
                    </div>
                  </>
                )}
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
                        <CurrencyInput value={item.sale_price}
                          onValueChange={(v) => updateItem(idx, 'sale_price', v)} />
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
              {saving ? 'Đang lưu...' : 'Tạo đơn xuất'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thanh toán đơn bán</DialogTitle>
            <DialogDescription>
              Tổng: {Number(payingSale?.total_revenue || 0).toLocaleString('vi-VN')} — Đã TT: {Number(payingSale?.amount_paid || 0).toLocaleString('vi-VN')} — Còn lại: {Number((payingSale?.total_revenue || 0) - (payingSale?.amount_paid || 0)).toLocaleString('vi-VN')} VND
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Số tiền thanh toán *</Label>
              <CurrencyInput value={payAmount}
                onValueChange={(v) => setPayAmount(v)} />
            </div>
            <div className="grid gap-2">
              <Label>Phương thức *</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Ghi chú</Label>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Ghi chú thanh toán" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Hủy</Button>
            <Button onClick={handlePayment} disabled={payingSaving}>{payingSaving ? 'Đang xử lý...' : 'Xác nhận'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận huỷ đơn xuất</DialogTitle>
            <DialogDescription>
              Tồn kho sẽ được hoàn trả. Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>Lý do huỷ</Label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Nhập lý do..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Đóng</Button>
            <Button variant="destructive" onClick={handleCancelSale} disabled={cancelSaving}>
              {cancelSaving ? 'Đang huỷ...' : 'Xác nhận huỷ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

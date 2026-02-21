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
import { Plus, Trash2, ShoppingCart, CreditCard, Pencil, Search, X, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CurrencyInput } from '@/components/ui/currency-input'
import { ViewSaleDetails } from '@/components/view-sale-details'

interface Customer { id: string; name: string }

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK', label: 'Chuyển khoản' },
  { value: 'MOMO', label: 'MoMo' },
  { value: 'ZALOPAY', label: 'ZaloPay' },
  { value: 'OTHER', label: 'Khác' },
]

const DATE_PRESETS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'today', label: 'Hôm nay' },
  { value: '7days', label: '7 ngày' },
  { value: '30days', label: '30 ngày' },
  { value: '90days', label: '90 ngày' },
  { value: 'last_month', label: 'Tháng trước' },
  { value: '3months_ago', label: '3 tháng trước' },
  { value: 'last_year', label: 'Năm trước' },
  { value: 'custom', label: 'Tuỳ chọn' },
]

function getDateRange(preset: string): { from: string; to: string } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const todayStr = fmt(today)
  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr }
    case '7days': {
      const d = new Date(today); d.setDate(d.getDate() - 6)
      return { from: fmt(d), to: todayStr }
    }
    case '30days': {
      const d = new Date(today); d.setDate(d.getDate() - 29)
      return { from: fmt(d), to: todayStr }
    }
    case '90days': {
      const d = new Date(today); d.setDate(d.getDate() - 89)
      return { from: fmt(d), to: todayStr }
    }
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const last = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: fmt(first), to: fmt(last) }
    }
    case '3months_ago': {
      const first = new Date(today.getFullYear(), today.getMonth() - 3, 1)
      const last = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: fmt(first), to: fmt(last) }
    }
    case 'last_year': {
      const first = new Date(today.getFullYear() - 1, 0, 1)
      const last = new Date(today.getFullYear() - 1, 11, 31)
      return { from: fmt(first), to: fmt(last) }
    }
    default:
      return { from: '', to: '' }
  }
}

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
  const [createdDate, setCreatedDate] = useState(new Date().toISOString().split('T')[0])
  const [items, setItems] = useState<SaleItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  // Adjustments in create dialog
  const [createAdjustments, setCreateAdjustments] = useState<{ type: string; amount: number; note: string }[]>([])
  // Payment modal
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingSale, setPayingSale] = useState<SaleRecord | null>(null)
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('CASH')
  const [payNote, setPayNote] = useState('')
  const [payingSaving, setPayingSaving] = useState(false)
  // Detail modal (invoice-style)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null)
  const [customerPrices, setCustomerPrices] = useState<Record<string, number>>({})
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancellingSale, setCancellingSale] = useState<SaleRecord | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterDatePreset, setFilterDatePreset] = useState('all')
  const [filterCustomerId, setFilterCustomerId] = useState('')
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 50
  const supabase = createClient()
  const router = useRouter()

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    let query = supabase
      .from('sales')
      .select('id, customer_name, customer_id, note, total_revenue, total_cost_estimated, profit, amount_paid, payment_status, created_at', { count: 'exact' })
      .neq('status', 'CANCELLED')
    if (filterDateFrom) query = query.gte('created_at', filterDateFrom + 'T00:00:00')
    if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59')
    if (filterCustomerId) query = query.eq('customer_id', filterCustomerId)
    if (filterPaymentStatus) query = query.eq('payment_status', filterPaymentStatus)
    query = query.order('created_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1)
    const { data, error, count } = await query
    if (error) toast.error('Lỗi tải đơn bán')
    else {
      setRecords(data || [])
      setTotalCount(count || 0)
    }
    setIsLoading(false)
  }, [filterDateFrom, filterDateTo, filterCustomerId, filterPaymentStatus, page])

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
    setCreatedDate(new Date().toISOString().split('T')[0])
    setItems([])
    setSelectedProductId('')
    setProductSearch('')
    setCreateAdjustments([])
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
  const totalExtraCharge = createAdjustments.filter(a => a.type === 'EXTRA_CHARGE').reduce((s, a) => s + a.amount, 0)
  const totalDiscount = createAdjustments.filter(a => a.type === 'DISCOUNT').reduce((s, a) => s + a.amount, 0)
  const adjustedRevenue = totalRevenue + totalExtraCharge - totalDiscount

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error('Vui lòng thêm ít nhất 1 sản phẩm')
      return
    }
    if (!selectedCustomerId && !customerName.trim()) {
      toast.error('Vui lòng chọn hoặc nhập tên khách hàng')
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
      // Auto-create or reuse existing customer (match by name + phone + address)
      if (!customerId && customerName.trim()) {
        const trimmedName = customerName.trim()
        const trimmedPhone = customerPhone.trim() || null
        const trimmedAddress = customerAddress.trim() || null
        let q = supabase.from('customers').select('id').ilike('name', trimmedName)
        if (trimmedPhone) q = q.eq('phone', trimmedPhone)
        else q = q.is('phone', null)
        if (trimmedAddress) q = q.eq('address', trimmedAddress)
        else q = q.is('address', null)
        const { data: existing } = await q.limit(1)
        if (existing && existing.length > 0) {
          customerId = existing[0].id
        } else {
          const { data: newCust, error: cErr } = await supabase
            .from('customers')
            .insert({ name: trimmedName, phone: trimmedPhone, address: trimmedAddress, warehouse_id: warehouseId })
            .select('id')
            .single()
          if (cErr) throw cErr
          customerId = newCust.id
        }
      }

      const rpcItems = items.map((item) => ({
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: item.quantity,
        sale_price: item.sale_price,
      }))

      const { data: saleResult, error } = await supabase.rpc('create_sale', {
        p_warehouse_id: warehouseId,
        p_customer_name: customerName.trim() || null,
        p_note: note.trim() || null,
        p_items: rpcItems,
        p_customer_id: customerId,
        p_created_at: createdDate ? new Date(createdDate + 'T00:00:00').toISOString() : null,
      })

      if (error) throw error

      // Insert adjustments if any
      if (createAdjustments.length > 0 && saleResult) {
        const adjRows = createAdjustments.map(a => ({
          sale_id: saleResult,
          adjustment_type: a.type,
          amount: a.amount,
          note: a.note.trim() || null,
        }))
        const { error: adjErr } = await supabase.from('sale_adjustments').insert(adjRows)
        if (adjErr) toast.error('Đơn đã tạo nhưng lỗi thêm phụ phí: ' + adjErr.message)
      }

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

  const openSaleDetail = (record: SaleRecord) => {
    setDetailSaleId(record.id)
    setDetailOpen(true)
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

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Thời gian</Label>
              <Select value={filterDatePreset} onValueChange={(val) => {
                setFilterDatePreset(val)
                if (val !== 'custom') {
                  const range = getDateRange(val)
                  setFilterDateFrom(range.from)
                  setFilterDateTo(range.to)
                }
              }}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {filterDatePreset === 'custom' && (
              <>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Từ ngày</Label>
                  <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="w-[150px] h-9" />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Đến ngày</Label>
                  <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="w-[150px] h-9" />
                </div>
              </>
            )}
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Khách hàng</Label>
              <Select value={filterCustomerId} onValueChange={(val) => setFilterCustomerId(val === 'all' ? '' : val)}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Tất cả" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Trạng thái TT</Label>
              <Select value={filterPaymentStatus} onValueChange={(val) => setFilterPaymentStatus(val === 'all' ? '' : val)}>
                <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Tất cả" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="PAID">Đã TT</SelectItem>
                  <SelectItem value="PARTIAL">TT một phần</SelectItem>
                  <SelectItem value="UNPAID">Chưa TT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={() => { setPage(0); loadRecords() }}>
              <Search className="mr-1 h-3 w-3" /> Lọc
            </Button>
            {(filterDatePreset !== 'all' || filterCustomerId || filterPaymentStatus) && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFilterDatePreset('all'); setFilterDateFrom(''); setFilterDateTo(''); setFilterCustomerId(''); setFilterPaymentStatus(''); setPage(0) }}>
                <X className="mr-1 h-3 w-3" /> Xoá lọc
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openSaleDetail(r) }}>
                          <FileText className="mr-1 h-3 w-3" /> Phiếu
                        </Button>
                        {Number(r.amount_paid) === 0 && (
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/sales/${r.id}/edit`) }}>
                            <Pencil className="mr-1 h-3 w-3" /> Sửa
                          </Button>
                        )}
                        {Number(r.amount_paid) === 0 && (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); openCancelDialog(r) }}>
                            <Trash2 className="mr-1 h-3 w-3" /> Huỷ
                          </Button>
                        )}
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
          {/* Pagination */}
          {totalCount > pageSize && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Hiển thị {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} / {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">Trang {page + 1} / {Math.ceil(totalCount / pageSize)}</span>
                <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= totalCount} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sale Detail Dialog (Invoice-style) */}
      <ViewSaleDetails
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        saleId={detailSaleId}
      />

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
                <Label>Khách hàng *</Label>
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

            <div className="grid gap-2">
              <Label htmlFor="sale-created-date">Ngày tạo phiếu</Label>
              <Input id="sale-created-date" type="date" value={createdDate} onChange={(e) => setCreatedDate(e.target.value)} />
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
                  {totalExtraCharge > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Phụ thu:</span>
                      <span className="font-medium text-orange-600">+{totalExtraCharge.toLocaleString('vi-VN')} VND</span>
                    </div>
                  )}
                  {totalDiscount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Giảm giá:</span>
                      <span className="font-medium text-green-600">-{totalDiscount.toLocaleString('vi-VN')} VND</span>
                    </div>
                  )}
                  {(totalExtraCharge > 0 || totalDiscount > 0) && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tổng sau điều chỉnh:</span>
                      <span className="font-bold">{adjustedRevenue.toLocaleString('vi-VN')} VND</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-medium">
                    <span>Lợi nhuận:</span>
                    <span className={totalProfit >= 0 ? 'text-green-600' : 'text-destructive'}>
                      {totalProfit.toLocaleString('vi-VN')} VND
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Adjustments section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Phụ phí / Giảm giá</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setCreateAdjustments(prev => [...prev, { type: 'EXTRA_CHARGE', amount: 0, note: '' }])}>
                  <Plus className="mr-1 h-3 w-3" /> Thêm
                </Button>
              </div>
              {createAdjustments.map((adj, idx) => (
                <div key={idx} className="flex items-center gap-2 border rounded-md p-2">
                  <Select value={adj.type} onValueChange={(val) => setCreateAdjustments(prev => prev.map((a, i) => i === idx ? { ...a, type: val } : a))}>
                    <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EXTRA_CHARGE">Phụ thu</SelectItem>
                      <SelectItem value="DISCOUNT">Giảm giá</SelectItem>
                    </SelectContent>
                  </Select>
                  <CurrencyInput value={adj.amount} onValueChange={(v) => setCreateAdjustments(prev => prev.map((a, i) => i === idx ? { ...a, amount: v } : a))} className="h-8 w-[130px] text-xs" />
                  <Input placeholder="Ghi chú" value={adj.note} onChange={(e) => setCreateAdjustments(prev => prev.map((a, i) => i === idx ? { ...a, note: e.target.value } : a))} className="h-8 text-xs flex-1" />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setCreateAdjustments(prev => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
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

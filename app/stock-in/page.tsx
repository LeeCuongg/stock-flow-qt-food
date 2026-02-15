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
import { Plus, Trash2, PackagePlus, CreditCard, Eye, Pencil, Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CurrencyInput } from '@/components/ui/currency-input'

interface Supplier { id: string; name: string }

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
  supplier_id: string | null
  note: string | null
  total_amount: number
  amount_paid: number
  payment_status: string
  created_at: string
  warehouse_id: string
}

interface StockInDetail {
  id: string
  supplier_name: string | null
  note: string | null
  total_amount: number
  amount_paid: number
  payment_status: string
  created_at: string
  stock_in_items: {
    quantity: number
    cost_price: number
    total_price: number
    batch_code: string | null
    expired_date: string | null
    products: { name: string; unit: string } | null
  }[]
}

export default function StockInPage() {
  const [records, setRecords] = useState<StockInRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [supplierAddress, setSupplierAddress] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [note, setNote] = useState('')
  const [createdDate, setCreatedDate] = useState(new Date().toISOString().split('T')[0])
  const [items, setItems] = useState<StockInItem[]>([])
  const [productSearch, setProductSearch] = useState('')
  // Payment modal
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingRecord, setPayingRecord] = useState<StockInRecord | null>(null)
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('CASH')
  const [payNote, setPayNote] = useState('')
  const [payingSaving, setPayingSaving] = useState(false)
  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<StockInDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [supplierPrices, setSupplierPrices] = useState<Record<string, number>>({})
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancellingRecord, setCancellingRecord] = useState<StockInRecord | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterDatePreset, setFilterDatePreset] = useState('all')
  const [filterSupplierId, setFilterSupplierId] = useState('')
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    let query = supabase
      .from('stock_in')
      .select('*')
      .neq('status', 'CANCELLED')
    if (filterDateFrom) query = query.gte('created_at', filterDateFrom + 'T00:00:00')
    if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59')
    if (filterSupplierId) query = query.eq('supplier_id', filterSupplierId)
    if (filterPaymentStatus) query = query.eq('payment_status', filterPaymentStatus)
    query = query.order('created_at', { ascending: false })
    const { data, error } = await query
    if (error) toast.error('Lỗi tải phiếu nhập')
    else setRecords(data || [])
    setIsLoading(false)
  }, [filterDateFrom, filterDateTo, filterSupplierId, filterPaymentStatus])

  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, unit, default_cost_price')
      .order('name')
    setProducts(data || [])
  }, [])

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase.from('suppliers').select('id, name').order('name')
    setSuppliers(data || [])
  }, [])

  useEffect(() => {
    loadRecords()
    loadProducts()
    loadSuppliers()
  }, [loadRecords, loadProducts, loadSuppliers])

  const loadSupplierPrices = useCallback(async (supplierId: string) => {
    if (!supplierId) {
      setSupplierPrices({})
      return
    }
    const { data } = await supabase
      .from('supplier_product_prices')
      .select('product_id, cost_price')
      .eq('supplier_id', supplierId)
    if (data) {
      const map: Record<string, number> = {}
      data.forEach((row: { product_id: string; cost_price: number }) => {
        map[row.product_id] = row.cost_price
      })
      setSupplierPrices(map)
    }
  }, [])

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  )

  const openCreate = () => {
    setSupplierName('')
    setSupplierPhone('')
    setSupplierAddress('')
    setSelectedSupplierId('')
    setNote('')
    setCreatedDate(new Date().toISOString().split('T')[0])
    setItems([])
    setProductSearch('')
    setDialogOpen(true)
  }

  const generateBatchCode = useCallback(async (productId: string): Promise<string> => {
    try {
      const { data, error } = await supabase.rpc('generate_batch_code', {
        p_product_id: productId,
        p_date: new Date().toISOString().split('T')[0],
      })
      if (error) throw error
      return data as string
    } catch {
      // Fallback: sinh mã lô phía client
      const product = products.find(p => p.id === productId)
      const prefix = product?.sku ? product.sku.toUpperCase() : (product?.name || 'PROD').substring(0, 4).toUpperCase().replace(/\s/g, '')
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const existingCount = items.filter(i => i.batch_code.startsWith(`${prefix}-${dateStr}-`)).length
      return `${prefix}-${dateStr}-${String(existingCount + 1).padStart(3, '0')}`
    }
  }, [products, items])

  const addItem = async (product: Product) => {
    const batchCode = await generateBatchCode(product.id)
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        product_unit: product.unit,
        batch_code: batchCode,
        expired_date: '',
        quantity: 1,
        cost_price: supplierPrices[product.id] ?? product.default_cost_price ?? 0,
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

  const openStockInPayment = (record: StockInRecord) => {
    setPayingRecord(record)
    setPayAmount(record.total_amount - record.amount_paid)
    setPayMethod('CASH')
    setPayNote('')
    setPayDialogOpen(true)
  }

  const handleStockInPayment = async () => {
    if (!payingRecord || payAmount <= 0) { toast.error('Số tiền phải > 0'); return }
    setPayingSaving(true)
    try {
      const { error } = await supabase.rpc('add_stock_in_payment', {
        p_stock_in_id: payingRecord.id,
        p_amount: payAmount,
        p_payment_method: payMethod,
        p_note: payNote.trim() || null,
      })
      if (error) throw error
      toast.success('Chi tiền thành công')
      setPayDialogOpen(false)
      loadRecords()
    } catch (err: unknown) { toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`) }
    finally { setPayingSaving(false) }
  }

  const openDetail = async (record: StockInRecord) => {
    setDetailOpen(true)
    setDetail(null)
    setDetailLoading(true)
    const { data, error } = await supabase
      .from('stock_in')
      .select('id, supplier_name, note, total_amount, amount_paid, payment_status, created_at, stock_in_items(quantity, cost_price, total_price, batch_code, expired_date, products(name, unit))')
      .eq('id', record.id)
      .single()
    if (error) toast.error('Lỗi tải chi tiết')
    else setDetail(data as unknown as StockInDetail)
    setDetailLoading(false)
  }

  const openCancelDialog = (record: StockInRecord) => {
    setCancellingRecord(record)
    setCancelReason('')
    setCancelDialogOpen(true)
  }

  const handleCancelStockIn = async () => {
    if (!cancellingRecord) return
    setCancelSaving(true)
    try {
      const { error } = await supabase.rpc('cancel_stock_in', {
        p_stock_in_id: cancellingRecord.id,
        p_reason: cancelReason.trim() || 'Huỷ phiếu nhập',
      })
      if (error) throw error
      toast.success('Đã huỷ phiếu nhập')
      setCancelDialogOpen(false)
      loadRecords()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setCancelSaving(false) }
  }

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

      let supplierId = selectedSupplierId || null
      // Auto-create supplier if new name entered
      if (!supplierId && supplierName.trim()) {
        const { data: newSupplier, error: sErr } = await supabase
          .from('suppliers')
          .insert({ name: supplierName.trim(), phone: supplierPhone.trim() || null, address: supplierAddress.trim() || null, warehouse_id: warehouseId })
          .select('id')
          .single()
        if (sErr) throw sErr
        supplierId = newSupplier.id
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
        p_supplier_id: supplierId,
        p_created_at: createdDate ? new Date(createdDate + 'T00:00:00').toISOString() : null,
      })

      if (error) throw error
      toast.success('Tạo phiếu nhập kho thành công')
      setDialogOpen(false)
      loadRecords()
      loadSuppliers()
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
              <Label className="text-xs text-muted-foreground">Nhà cung cấp</Label>
              <Select value={filterSupplierId} onValueChange={(val) => setFilterSupplierId(val === 'all' ? '' : val)}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Tất cả" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
            <Button variant="outline" size="sm" className="h-9" onClick={() => loadRecords()}>
              <Search className="mr-1 h-3 w-3" /> Lọc
            </Button>
            {(filterDatePreset !== 'all' || filterSupplierId || filterPaymentStatus) && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFilterDatePreset('all'); setFilterDateFrom(''); setFilterDateTo(''); setFilterSupplierId(''); setFilterPaymentStatus('') }}>
                <X className="mr-1 h-3 w-3" /> Xoá lọc
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
                  <TableHead className="text-right">Tổng tiền</TableHead>
                  <TableHead className="text-right">Đã TT</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => openDetail(r)}>
                    <TableCell>{new Date(r.created_at).toLocaleDateString('vi-VN')}</TableCell>
                    <TableCell>{r.supplier_name || '-'}</TableCell>
                    <TableCell className="text-right font-medium">
                      {Number(r.total_amount).toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(r.amount_paid).toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell>
                      {r.payment_status === 'PAID' ? <Badge className="bg-green-600 text-white hover:bg-green-700">Đã TT</Badge>
                        : r.payment_status === 'PARTIAL' ? <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">TT một phần</Badge>
                        : <Badge variant="destructive">Chưa TT</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/stock-in/${r.id}`) }}>
                          <Eye className="mr-1 h-3 w-3" /> Xem
                        </Button>
                        {Number(r.amount_paid) === 0 && (
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/stock-in/${r.id}/edit`) }}>
                            <Pencil className="mr-1 h-3 w-3" /> Sửa
                          </Button>
                        )}
                        {Number(r.amount_paid) === 0 && (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); openCancelDialog(r) }}>
                            <Trash2 className="mr-1 h-3 w-3" /> Huỷ
                          </Button>
                        )}
                        {r.payment_status !== 'PAID' && (
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openStockInPayment(r) }}>
                            <CreditCard className="mr-1 h-3 w-3" /> Chi tiền
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

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết phiếu nhập</DialogTitle>
            <DialogDescription>
              {detail ? new Date(detail.created_at).toLocaleString('vi-VN') : ''}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">NCC:</span> {detail.supplier_name || '-'}</div>
                <div><span className="text-muted-foreground">Ghi chú:</span> {detail.note || '-'}</div>
                <div><span className="text-muted-foreground">Tổng tiền:</span> <span className="font-medium">{Number(detail.total_amount).toLocaleString('vi-VN')} VND</span></div>
                <div><span className="text-muted-foreground">Đã TT:</span> {Number(detail.amount_paid).toLocaleString('vi-VN')} VND</div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Mã lô</TableHead>
                    <TableHead>HSD</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead className="text-right">Đơn giá</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.stock_in_items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{item.products?.name || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{item.batch_code || '-'}</TableCell>
                      <TableCell className="text-sm">{item.expired_date ? new Date(item.expired_date).toLocaleDateString('vi-VN') : '-'}</TableCell>
                      <TableCell className="text-right">{Number(item.quantity).toLocaleString('vi-VN')}</TableCell>
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

      {/* Create Stock-In Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo phiếu nhập kho</DialogTitle>
            <DialogDescription>Nhập thông tin phiếu nhập và danh sách sản phẩm</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Nhà cung cấp</Label>
                <Select value={selectedSupplierId} onValueChange={(val) => {
                  if (val === 'none') {
                    setSelectedSupplierId('')
                    setSupplierName('')
                    setSupplierPrices({})
                  } else {
                    setSelectedSupplierId(val)
                    const s = suppliers.find((s) => s.id === val)
                    if (s) setSupplierName(s.name)
                    loadSupplierPrices(val)
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Chọn NCC..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Nhập tay --</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedSupplierId && (
                  <>
                    <Input
                      placeholder="Nhập tên NCC mới..."
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="SĐT"
                        value={supplierPhone}
                        onChange={(e) => setSupplierPhone(e.target.value)}
                      />
                      <Input
                        placeholder="Địa chỉ"
                        value={supplierAddress}
                        onChange={(e) => setSupplierAddress(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="note">Ghi chú</Label>
                <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú phiếu nhập" rows={1} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="created-date">Ngày tạo phiếu</Label>
              <Input id="created-date" type="date" value={createdDate} onChange={(e) => setCreatedDate(e.target.value)} />
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

            {/* Items as cards */}
            {items.length > 0 && (
              <div className="space-y-3">
                <Label>Danh sách sản phẩm nhập ({items.length})</Label>
                {items.map((item, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-3 relative">
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
                        <Label className="text-xs text-muted-foreground">Mã lô * (tự sinh)</Label>
                        <Input value={item.batch_code}
                          onChange={(e) => updateItem(idx, 'batch_code', e.target.value)} placeholder="VD: SP001-20260214-001" />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Hạn sử dụng</Label>
                        <Input type="date" value={item.expired_date}
                          onChange={(e) => updateItem(idx, 'expired_date', e.target.value)} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Số lượng *</Label>
                        <Input type="number" min={1} value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Giá nhập *</Label>
                        <CurrencyInput value={item.cost_price}
                          onValueChange={(v) => updateItem(idx, 'cost_price', v)} />
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      Thành tiền: <span className="font-medium text-foreground">{(item.quantity * item.cost_price).toLocaleString('vi-VN')} VND</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-2 border-t">
                  <div className="text-sm font-medium">
                    Tổng cộng: <span className="text-lg">{totalCost.toLocaleString('vi-VN')}</span> VND
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

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chi tiền phiếu nhập</DialogTitle>
            <DialogDescription>
              Tổng: {Number(payingRecord?.total_amount || 0).toLocaleString('vi-VN')} — Đã TT: {Number(payingRecord?.amount_paid || 0).toLocaleString('vi-VN')} — Còn lại: {Number((payingRecord?.total_amount || 0) - (payingRecord?.amount_paid || 0)).toLocaleString('vi-VN')} VND
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Số tiền *</Label>
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
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Ghi chú" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleStockInPayment} disabled={payingSaving}>{payingSaving ? 'Đang xử lý...' : 'Xác nhận'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận huỷ phiếu nhập</DialogTitle>
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
            <Button variant="destructive" onClick={handleCancelStockIn} disabled={cancelSaving}>
              {cancelSaving ? 'Đang huỷ...' : 'Xác nhận huỷ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

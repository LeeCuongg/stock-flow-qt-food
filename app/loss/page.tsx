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
import { Plus, AlertTriangle, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const LOSS_REASONS = [
  { value: 'EXPIRED', label: 'Hết hạn' },
  { value: 'DAMAGED', label: 'Hư hỏng' },
  { value: 'LOST', label: 'Thất lạc' },
  { value: 'ADJUSTMENT', label: 'Điều chỉnh' },
  { value: 'SAMPLE', label: 'Mẫu thử' },
] as const

interface Product {
  id: string
  name: string
  sku: string | null
  unit: string
}

interface Batch {
  id: string
  product_id: string
  batch_code: string | null
  quantity_remaining: number
  cost_price: number
  expiry_date: string | null
}

interface LossRecord {
  id: string
  quantity: number
  reason: string
  note: string | null
  cost_price: number
  total_loss_cost: number
  status: string
  created_at: string
  products: { name: string; sku: string | null; unit: string } | null
  inventory_batches: { batch_code: string | null; expiry_date: string | null } | null
}

export default function LossPage() {
  const [records, setRecords] = useState<LossRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [filterReason, setFilterReason] = useState('ALL')

  // Form
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [inputMode, setInputMode] = useState<'loss' | 'remaining'>('loss')
  const [remainingQty, setRemainingQty] = useState(0)

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<LossRecord | null>(null)

  // Cancel modal
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelRecord, setCancelRecord] = useState<LossRecord | null>(null)

  const supabase = createClient()

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('loss_records')
      .select('id, quantity, reason, note, cost_price, total_loss_cost, status, created_at, products(name, sku, unit), inventory_batches(batch_code, expiry_date)')
      .order('created_at', { ascending: false })
    if (error) toast.error('Lỗi tải dữ liệu hao hụt')
    else setRecords((data as unknown as LossRecord[]) || [])
    setIsLoading(false)
  }, [])

  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from('products').select('id, name, sku, unit').order('name')
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

  const batchesForProduct = (productId: string) =>
    batches.filter((b) => b.product_id === productId && b.quantity_remaining > 0)

  const selectedBatch = batches.find((b) => b.id === selectedBatchId)

  const effectiveLossQty = inputMode === 'remaining' && selectedBatch
    ? selectedBatch.quantity_remaining - remainingQty
    : quantity
  const lossCost = selectedBatch ? effectiveLossQty * selectedBatch.cost_price : 0

  // Filter records
  const filteredRecords = records.filter((r) => {
    const matchReason = filterReason === 'ALL' || r.reason === filterReason
    if (!search.trim()) return matchReason
    const s = search.toLowerCase()
    const pName = r.products?.name?.toLowerCase() || ''
    const pSku = r.products?.sku?.toLowerCase() || ''
    const bCode = r.inventory_batches?.batch_code?.toLowerCase() || ''
    return matchReason && (pName.includes(s) || pSku.includes(s) || bCode.includes(s))
  })

  const openCreate = () => {
    setSelectedProductId('')
    setSelectedBatchId('')
    setQuantity(1)
    setReason('')
    setNote('')
    setProductSearch('')
    setInputMode('loss')
    setRemainingQty(0)
    setDialogOpen(true)
    loadBatches()
  }

  const handleSubmit = async () => {
    if (!selectedBatchId) { toast.error('Vui lòng chọn lô hàng'); return }
    if (!reason) { toast.error('Vui lòng chọn lý do'); return }

    const lossQty = inputMode === 'remaining' && selectedBatch
      ? selectedBatch.quantity_remaining - remainingQty
      : quantity

    if (lossQty <= 0) {
      toast.error(inputMode === 'remaining' ? 'Số lượng thực tế phải nhỏ hơn tồn kho hệ thống' : 'Số lượng phải > 0')
      return
    }
    if (selectedBatch && lossQty > selectedBatch.quantity_remaining) {
      toast.error(`Số lượng vượt tồn kho. Tồn: ${selectedBatch.quantity_remaining}`)
      return
    }
    if (inputMode === 'remaining' && remainingQty < 0) {
      toast.error('Số lượng thực tế không thể âm')
      return
    }

    setSaving(true)
    try {
      const { data: warehouses } = await supabase.from('warehouses').select('id').limit(1)
      const warehouseId = warehouses?.[0]?.id
      if (!warehouseId) { toast.error('Chưa có kho'); return }

      const { error } = await supabase.rpc('create_loss_record', {
        p_warehouse_id: warehouseId,
        p_product_id: selectedProductId,
        p_batch_id: selectedBatchId,
        p_quantity: lossQty,
        p_reason: reason,
        p_note: note.trim() || null,
      })

      if (error) throw error
      toast.success('Ghi nhận hao hụt thành công')
      setDialogOpen(false)
      loadRecords()
      loadBatches()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      toast.error(`Lỗi: ${message}`)
    } finally { setSaving(false) }
  }

  const handleCancel = async () => {
    if (!cancelRecord) return
    setCancelling(true)
    try {
      const { error } = await supabase.rpc('cancel_loss_record', {
        p_loss_id: cancelRecord.id,
        p_reason: cancelReason.trim() || 'Huỷ ghi nhận hao hụt',
      })
      if (error) throw error
      toast.success('Đã huỷ ghi nhận hao hụt')
      setCancelOpen(false)
      setDetailOpen(false)
      loadRecords()
      loadBatches()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setCancelling(false) }
  }

  const openCancelDialog = (record: LossRecord) => {
    setCancelRecord(record)
    setCancelReason('')
    setCancelOpen(true)
  }

  const reasonLabel = (value: string) =>
    LOSS_REASONS.find((r) => r.value === value)?.label || value

  const reasonBadgeVariant = (value: string) => {
    switch (value) {
      case 'EXPIRED': return 'destructive' as const
      case 'DAMAGED': return 'destructive' as const
      case 'LOST': return 'destructive' as const
      case 'ADJUSTMENT': return 'secondary' as const
      case 'SAMPLE': return 'outline' as const
      default: return 'secondary' as const
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hao hụt</h1>
          <p className="text-sm text-muted-foreground">Ghi nhận hao hụt, mất mát, hết hạn</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Ghi nhận hao hụt
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm theo sản phẩm, SKU, mã lô..." value={search}
                onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            </div>
            <Select value={filterReason} onValueChange={setFilterReason}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Lọc lý do" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả lý do</SelectItem>
                {LOSS_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có ghi nhận</h3>
              <p className="text-sm text-muted-foreground mt-1">Nhấn &quot;Ghi nhận hao hụt&quot; để bắt đầu.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Mã lô</TableHead>
                  <TableHead>HSD</TableHead>
                  <TableHead className="text-right">SL</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead className="text-right">Giá vốn</TableHead>
                  <TableHead className="text-right">Tiền hao hụt</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((r) => (
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer ${r.status === 'CANCELLED' ? 'opacity-50' : ''}`}
                    onClick={() => { setDetailRecord(r); setDetailOpen(true) }}
                  >
                    <TableCell className="text-sm">{new Date(r.created_at).toLocaleDateString('vi-VN')}</TableCell>
                    <TableCell className="font-medium">{r.products?.name || '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.inventory_batches?.batch_code || '-'}</TableCell>
                    <TableCell className="text-sm">
                      {r.inventory_batches?.expiry_date
                        ? new Date(r.inventory_batches.expiry_date).toLocaleDateString('vi-VN')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">{Number(r.quantity).toLocaleString('vi-VN')}</TableCell>
                    <TableCell>
                      <Badge variant={reasonBadgeVariant(r.reason)}>{reasonLabel(r.reason)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{Number(r.cost_price).toLocaleString('vi-VN')}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">
                      {Number(r.total_loss_cost).toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell>
                      {r.status === 'CANCELLED'
                        ? <Badge variant="destructive">Đã huỷ</Badge>
                        : <Badge variant="secondary">Hoạt động</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Loss Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chi tiết hao hụt</DialogTitle>
            <DialogDescription>
              {detailRecord ? new Date(detailRecord.created_at).toLocaleString('vi-VN') : ''}
            </DialogDescription>
          </DialogHeader>
          {detailRecord && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Sản phẩm:</span><br/><span className="font-medium">{detailRecord.products?.name || '-'}</span></div>
                <div><span className="text-muted-foreground">Đơn vị:</span><br/>{detailRecord.products?.unit || '-'}</div>
                <div><span className="text-muted-foreground">Mã lô:</span><br/><span className="font-mono">{detailRecord.inventory_batches?.batch_code || '-'}</span></div>
                <div><span className="text-muted-foreground">HSD:</span><br/>{detailRecord.inventory_batches?.expiry_date ? new Date(detailRecord.inventory_batches.expiry_date).toLocaleDateString('vi-VN') : '-'}</div>
                <div><span className="text-muted-foreground">Số lượng:</span><br/><span className="font-medium">{Number(detailRecord.quantity).toLocaleString('vi-VN')}</span></div>
                <div><span className="text-muted-foreground">Lý do:</span><br/><Badge variant={reasonBadgeVariant(detailRecord.reason)}>{reasonLabel(detailRecord.reason)}</Badge></div>
                <div><span className="text-muted-foreground">Giá vốn:</span><br/>{Number(detailRecord.cost_price).toLocaleString('vi-VN')} VND</div>
                <div><span className="text-muted-foreground">Tiền hao hụt:</span><br/><span className="font-medium text-destructive">{Number(detailRecord.total_loss_cost).toLocaleString('vi-VN')} VND</span></div>
                <div><span className="text-muted-foreground">Trạng thái:</span><br/>
                  {detailRecord.status === 'CANCELLED'
                    ? <Badge variant="destructive">Đã huỷ</Badge>
                    : <Badge variant="secondary">Hoạt động</Badge>}
                </div>
              </div>
              {detailRecord.note && (
                <div><span className="text-muted-foreground">Ghi chú:</span><br/>{detailRecord.note}</div>
              )}
              {detailRecord.status !== 'CANCELLED' && (
                <div className="pt-2 border-t">
                  <Button variant="destructive" size="sm" onClick={() => openCancelDialog(detailRecord)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Huỷ ghi nhận
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận huỷ ghi nhận hao hụt</DialogTitle>
            <DialogDescription>
              Tồn kho sẽ được hoàn trả. Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          {cancelRecord && (
            <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/30">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sản phẩm:</span>
                <span className="font-medium">{cancelRecord.products?.name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số lượng hoàn trả:</span>
                <span className="font-medium">{Number(cancelRecord.quantity).toLocaleString('vi-VN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tiền hao hụt:</span>
                <span className="font-medium text-destructive">{Number(cancelRecord.total_loss_cost).toLocaleString('vi-VN')} VND</span>
              </div>
            </div>
          )}
          <div className="grid gap-2 py-2">
            <Label>Lý do huỷ</Label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Nhập lý do..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Đóng</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Đang huỷ...' : 'Xác nhận huỷ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Loss Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ghi nhận hao hụt</DialogTitle>
            <DialogDescription>Chọn lô hàng và nhập số lượng hao hụt</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Select product */}
            <div className="grid gap-2">
              <Label>Sản phẩm *</Label>
              <Select value={selectedProductId} onValueChange={(val) => {
                setSelectedProductId(val)
                setSelectedBatchId('')
              }}>
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

            {/* Select batch */}
            {selectedProductId && (
              <div className="grid gap-2">
                <Label>Lô hàng *</Label>
                {batchesForProduct(selectedProductId).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Không có lô hàng còn tồn.</p>
                ) : (
                  <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn lô hàng..." />
                    </SelectTrigger>
                    <SelectContent>
                      {batchesForProduct(selectedProductId).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.batch_code || '-'} — Tồn: {Number(b.quantity_remaining).toLocaleString('vi-VN')}
                          {b.expiry_date ? ` — HSD: ${new Date(b.expiry_date).toLocaleDateString('vi-VN')}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Batch info */}
            {selectedBatch && (
              <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/30">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tồn kho:</span>
                  <span className="font-medium">{Number(selectedBatch.quantity_remaining).toLocaleString('vi-VN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Giá vốn:</span>
                  <span className="font-medium">{Number(selectedBatch.cost_price).toLocaleString('vi-VN')} VND</span>
                </div>
                {selectedBatch.expiry_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hạn sử dụng:</span>
                    <span>{new Date(selectedBatch.expiry_date).toLocaleDateString('vi-VN')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Input mode */}
            {selectedBatch && (
              <div className="grid gap-2">
                <Label>Cách nhập</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={inputMode === 'loss' ? 'default' : 'outline'}
                    onClick={() => { setInputMode('loss'); setQuantity(1) }}>
                    Nhập số lượng hao hụt
                  </Button>
                  <Button type="button" size="sm" variant={inputMode === 'remaining' ? 'default' : 'outline'}
                    onClick={() => { setInputMode('remaining'); setRemainingQty(selectedBatch.quantity_remaining) }}>
                    Nhập SL thực tế còn
                  </Button>
                </div>
              </div>
            )}

            {/* Quantity + Reason */}
            <div className="grid grid-cols-2 gap-4">
              {inputMode === 'loss' ? (
                <div className="grid gap-2">
                  <Label>Số lượng hao hụt *{selectedBatch ? ` (tối đa ${selectedBatch.quantity_remaining})` : ''}</Label>
                  <Input type="number" min={1} max={selectedBatch?.quantity_remaining || undefined}
                    value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label>SL thực tế còn trong kho *</Label>
                  <Input type="number" min={0} max={selectedBatch?.quantity_remaining || undefined}
                    value={remainingQty} onChange={(e) => setRemainingQty(Number(e.target.value))} />
                  {selectedBatch && remainingQty >= 0 && remainingQty < selectedBatch.quantity_remaining && (
                    <p className="text-sm text-muted-foreground">
                      → Hao hụt: <span className="font-medium text-destructive">{(selectedBatch.quantity_remaining - remainingQty).toLocaleString('vi-VN')}</span>
                      {' '}(Tồn hệ thống: {Number(selectedBatch.quantity_remaining).toLocaleString('vi-VN')} − Thực tế: {remainingQty.toLocaleString('vi-VN')})
                    </p>
                  )}
                </div>
              )}
              <div className="grid gap-2">
                <Label>Lý do *</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn lý do..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LOSS_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Note */}
            <div className="grid gap-2">
              <Label>Ghi chú</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú thêm (tùy chọn)" rows={2} />
            </div>

            {/* Loss cost preview */}
            {selectedBatch && effectiveLossQty > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex justify-between text-sm font-medium">
                  <span>Tiền hao hụt:</span>
                  <span className="text-destructive text-lg">{lossCost.toLocaleString('vi-VN')} VND</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button variant="destructive" onClick={handleSubmit} disabled={saving || !selectedBatchId || !reason}>
              {saving ? 'Đang lưu...' : 'Ghi nhận hao hụt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RevisionHistory } from '@/components/revision-history'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Pencil, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { formatVN, formatQty } from '@/lib/utils'

interface StockInDetail {
  id: string
  supplier_name: string | null
  supplier_id: string | null
  note: string | null
  total_amount: number
  amount_paid: number
  payment_status: string
  status: string
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

interface LandedCost {
  id: string
  cost_type: string
  amount: number
  allocation_method: string
  created_at: string
}

export default function StockInDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [detail, setDetail] = useState<StockInDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // Landed cost state
  const [landedCosts, setLandedCosts] = useState<LandedCost[]>([])
  const [landedOpen, setLandedOpen] = useState(false)
  const [landedCostType, setLandedCostType] = useState('')
  const [landedAmount, setLandedAmount] = useState('')
  const [landedMethod, setLandedMethod] = useState<string>('BY_QUANTITY')
  const [landedSubmitting, setLandedSubmitting] = useState(false)
  const [hasSales, setHasSales] = useState(false)

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('stock_in')
      .select('id, supplier_name, supplier_id, note, total_amount, amount_paid, payment_status, status, created_at, stock_in_items(quantity, cost_price, total_price, batch_code, expired_date, products(name, unit))')
      .eq('id', id)
      .single()
    if (error) { toast.error('Không tìm thấy phiếu nhập'); router.push('/stock-in') }
    else setDetail(data as unknown as StockInDetail)
    setLoading(false)
  }, [id, router])

  const loadLandedCosts = useCallback(async () => {
    const { data } = await supabase
      .from('stock_in_landed_costs')
      .select('id, cost_type, amount, allocation_method, created_at')
      .eq('stock_in_id', id)
      .order('created_at', { ascending: true })
    if (data) setLandedCosts(data)
  }, [id])

  const checkHasSales = useCallback(async () => {
    // Check if any batches from this stock-in have been sold
    // We query stock_in_items → match inventory_batches → check sales_items
    if (!detail) return
    const { data: items } = await supabase
      .from('stock_in_items')
      .select('product_id, batch_code, expired_date')
      .eq('stock_in_id', id)
    if (!items || items.length === 0) { setHasSales(false); return }

    // For each item, find the batch and check if sales_items reference it
    for (const item of items) {
      const { data: batches } = await supabase
        .from('inventory_batches')
        .select('id')
        .eq('product_id', item.product_id)
        .eq('batch_code', item.batch_code)
        .is('expiry_date', item.expired_date === null ? null : undefined)
      if (item.expired_date !== null && batches?.length === 0) {
        const { data: batchesWithDate } = await supabase
          .from('inventory_batches')
          .select('id')
          .eq('product_id', item.product_id)
          .eq('batch_code', item.batch_code)
          .eq('expiry_date', item.expired_date)
        if (batchesWithDate && batchesWithDate.length > 0) {
          for (const b of batchesWithDate) {
            const { count } = await supabase
              .from('sales_items')
              .select('id', { count: 'exact', head: true })
              .eq('batch_id', b.id)
            if (count && count > 0) { setHasSales(true); return }
          }
        }
      } else if (batches && batches.length > 0) {
        for (const b of batches) {
          const { count } = await supabase
            .from('sales_items')
            .select('id', { count: 'exact', head: true })
            .eq('batch_id', b.id)
          if (count && count > 0) { setHasSales(true); return }
        }
      }
    }
    setHasSales(false)
  }, [id, detail])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadLandedCosts() }, [loadLandedCosts])
  useEffect(() => { if (detail) checkHasSales() }, [detail, checkHasSales])

  if (loading) return <div className="text-center py-12 text-muted-foreground">Đang tải...</div>
  if (!detail) return null

  const canAddLandedCost =
    detail.status !== 'CANCELLED' &&
    Number(detail.amount_paid) === 0 &&
    !hasSales

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const { error } = await supabase.rpc('cancel_stock_in', {
        p_stock_in_id: id,
        p_reason: cancelReason.trim() || 'Huỷ phiếu nhập',
      })
      if (error) throw error
      toast.success('Đã huỷ phiếu nhập')
      setCancelOpen(false)
      load()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setCancelling(false) }
  }

  const handleAddLandedCost = async () => {
    const amount = parseFloat(landedAmount)
    if (!landedCostType.trim()) { toast.error('Vui lòng nhập loại chi phí'); return }
    if (isNaN(amount) || amount <= 0) { toast.error('Số tiền phải > 0'); return }

    setLandedSubmitting(true)
    try {
      const { error } = await supabase.rpc('add_landed_cost', {
        p_stock_in_id: id,
        p_cost_type: landedCostType.trim(),
        p_amount: amount,
        p_allocation_method: landedMethod,
      })
      if (error) throw error
      toast.success('Đã thêm chi phí landed cost')
      setLandedOpen(false)
      setLandedCostType('')
      setLandedAmount('')
      setLandedMethod('BY_QUANTITY')
      load()
      loadLandedCosts()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setLandedSubmitting(false) }
  }

  const landedCostDisabledReason = detail.status === 'CANCELLED'
    ? 'Phiếu đã huỷ'
    : Number(detail.amount_paid) > 0
    ? 'Đã có thanh toán'
    : hasSales
    ? 'Lô hàng đã được bán'
    : ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/stock-in')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Chi tiết phiếu nhập</h1>
            <p className="text-sm text-muted-foreground">{new Date(detail.created_at).toLocaleString('vi-VN')}</p>
          </div>
        </div>
        {detail.status !== 'CANCELLED' && (
          <div className="flex items-center gap-2">
            {Number(detail.amount_paid) === 0 && (
              <Button variant="destructive" onClick={() => { setCancelReason(''); setCancelOpen(true) }}>
                <Trash2 className="mr-2 h-4 w-4" /> Huỷ phiếu
              </Button>
            )}
            {Number(detail.amount_paid) === 0 && (
              <Button onClick={() => router.push(`/stock-in/${id}/edit`)}>
                <Pencil className="mr-2 h-4 w-4" /> Chỉnh sửa
              </Button>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Chi tiết</TabsTrigger>
          <TabsTrigger value="landed">Landed Cost</TabsTrigger>
          <TabsTrigger value="history">Lịch sử chỉnh sửa</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader><CardTitle>Thông tin phiếu nhập</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div><span className="text-muted-foreground">NCC:</span> {detail.supplier_name || '-'}</div>
                <div><span className="text-muted-foreground">Ghi chú:</span> {detail.note || '-'}</div>
                <div><span className="text-muted-foreground">Trạng thái:</span>{' '}
                  <Badge variant={detail.status === 'CANCELLED' ? 'destructive' : 'secondary'}>{detail.status}</Badge>
                </div>
                <div><span className="text-muted-foreground">Tổng tiền:</span> <span className="font-medium">{formatVN(detail.total_amount)} VND</span></div>
                <div><span className="text-muted-foreground">Đã TT:</span> {formatVN(detail.amount_paid)} VND</div>
                <div><span className="text-muted-foreground">Thanh toán:</span>{' '}
                  {detail.payment_status === 'PAID' ? <Badge className="bg-green-600 text-white">Đã TT</Badge>
                    : detail.payment_status === 'PARTIAL' ? <Badge className="bg-yellow-500 text-white">TT một phần</Badge>
                    : <Badge variant="destructive">Chưa TT</Badge>}
                </div>
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
                      <TableCell className="text-right">{formatQty(item.quantity)}</TableCell>
                      <TableCell className="text-right">{formatVN(item.cost_price)}</TableCell>
                      <TableCell className="text-right font-medium">{formatVN(item.total_price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="landed">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Chi phí nhập hàng</CardTitle>
                <div className="flex items-center gap-2">
                  {!canAddLandedCost && landedCostDisabledReason && (
                    <span className="text-xs text-muted-foreground">{landedCostDisabledReason}</span>
                  )}
                  <Button
                    size="sm"
                    disabled={!canAddLandedCost}
                    onClick={() => setLandedOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Thêm chi phí
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {landedCosts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Chưa có chi phí landed cost nào.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loại chi phí</TableHead>
                      <TableHead>Phương pháp phân bổ</TableHead>
                      <TableHead className="text-right">Số tiền</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {landedCosts.map((lc) => (
                      <TableRow key={lc.id}>
                        <TableCell className="font-medium">{lc.cost_type}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {lc.allocation_method === 'BY_VALUE' ? 'Theo giá trị' : 'Theo số lượng'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatVN(lc.amount)} VND</TableCell>
                        <TableCell className="text-sm">{new Date(lc.created_at).toLocaleString('vi-VN')}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={2} className="font-medium text-right">Tổng Landed Cost:</TableCell>
                      <TableCell className="text-right font-bold">
                        {formatVN(landedCosts.reduce((sum, lc) => sum + Number(lc.amount), 0))} VND
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <RevisionHistory documentType="STOCK_IN" documentId={id} />
        </TabsContent>
      </Tabs>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
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
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Đóng</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Đang huỷ...' : 'Xác nhận huỷ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Landed Cost Dialog */}
      <Dialog open={landedOpen} onOpenChange={setLandedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm Landed Cost</DialogTitle>
            <DialogDescription>
              Chi phí sẽ được phân bổ vào giá vốn từng lô hàng.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Loại chi phí</Label>
              <Input
                value={landedCostType}
                onChange={(e) => setLandedCostType(e.target.value)}
                placeholder="VD: Vận chuyển, Thuế nhập khẩu..."
              />
            </div>
            <div className="grid gap-2">
              <Label>Số tiền (VND)</Label>
              <Input
                type="number"
                min="0"
                step="1000"
                value={landedAmount}
                onChange={(e) => setLandedAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            {/* Phương pháp phân bổ: tạm ẩn BY_VALUE, mặc định BY_QUANTITY */}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLandedOpen(false)}>Đóng</Button>
            <Button onClick={handleAddLandedCost} disabled={landedSubmitting}>
              {landedSubmitting ? 'Đang xử lý...' : 'Xác nhận'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

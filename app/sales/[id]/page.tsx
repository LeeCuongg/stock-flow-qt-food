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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Pencil, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { CurrencyInput } from '@/components/ui/currency-input'
import { formatVN, formatQty } from '@/lib/utils'

interface SaleDetail {
  id: string
  customer_name: string | null
  customer_id: string | null
  note: string | null
  total_revenue: number
  total_cost_estimated: number
  profit: number
  amount_paid: number
  payment_status: string
  status: string
  created_at: string
  sales_items: {
    quantity: number
    sale_price: number
    cost_price: number
    total_price: number
    note: string | null
    products: { name: string; unit: string } | null
    inventory_batches: { batch_code: string | null; expiry_date: string | null } | null
  }[]
}

interface Adjustment {
  id: string
  adjustment_type: string
  amount: number
  note: string | null
  created_at: string
}

export default function SaleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // Adjustments
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [adjOpen, setAdjOpen] = useState(false)
  const [adjType, setAdjType] = useState<string>('EXTRA_CHARGE')
  const [adjAmount, setAdjAmount] = useState(0)
  const [adjNote, setAdjNote] = useState('')
  const [adjSaving, setAdjSaving] = useState(false)

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('sales')
      .select('id, customer_name, customer_id, note, total_revenue, total_cost_estimated, profit, amount_paid, payment_status, status, created_at, sales_items(quantity, sale_price, cost_price, total_price, note, products(name, unit), inventory_batches(batch_code, expiry_date))')
      .eq('id', id)
      .single()
    if (error) { toast.error('Không tìm thấy đơn xuất'); router.push('/sales') }
    else setDetail(data as unknown as SaleDetail)
    setLoading(false)
  }, [id, router])

  const loadAdjustments = useCallback(async () => {
    const { data, error } = await supabase
      .from('sale_adjustments')
      .select('*')
      .eq('sale_id', id)
      .order('created_at', { ascending: false })
    if (!error) setAdjustments(data || [])
  }, [id])

  useEffect(() => { load(); loadAdjustments() }, [load, loadAdjustments])

  if (loading) return <div className="text-center py-12 text-muted-foreground">Đang tải...</div>
  if (!detail) return null

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const { error } = await supabase.rpc('cancel_sale', {
        p_sale_id: id,
        p_reason: cancelReason.trim() || 'Huỷ đơn xuất',
      })
      if (error) throw error
      toast.success('Đã huỷ đơn xuất')
      setCancelOpen(false)
      load()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setCancelling(false) }
  }

  const handleAddAdjustment = async () => {
    if (adjAmount <= 0) { toast.error('Số tiền phải > 0'); return }
    setAdjSaving(true)
    try {
      const { error } = await supabase.from('sale_adjustments').insert({
        sale_id: id,
        adjustment_type: adjType,
        amount: adjAmount,
        note: adjNote.trim() || null,
      })
      if (error) throw error
      toast.success(adjType === 'EXTRA_CHARGE' ? 'Đã thêm phụ thu' : 'Đã thêm giảm giá')
      setAdjOpen(false)
      setAdjAmount(0)
      setAdjNote('')
      loadAdjustments()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setAdjSaving(false) }
  }

  const handleDeleteAdjustment = async (adjId: string) => {
    const { error } = await supabase.from('sale_adjustments').delete().eq('id', adjId)
    if (error) toast.error('Lỗi xoá điều chỉnh')
    else { toast.success('Đã xoá'); loadAdjustments() }
  }

  const totalExtraCharge = adjustments.filter(a => a.adjustment_type === 'EXTRA_CHARGE').reduce((s, a) => s + Number(a.amount), 0)
  const totalDiscount = adjustments.filter(a => a.adjustment_type === 'DISCOUNT').reduce((s, a) => s + Number(a.amount), 0)
  const adjustedTotal = Number(detail.total_revenue) + totalExtraCharge - totalDiscount

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/sales')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Chi tiết đơn xuất</h1>
            <p className="text-sm text-muted-foreground">{new Date(detail.created_at).toLocaleString('vi-VN')}</p>
          </div>
        </div>
        {detail.status !== 'CANCELLED' && (
          <div className="flex items-center gap-2">
            {Number(detail.amount_paid) === 0 && (
              <Button variant="destructive" onClick={() => { setCancelReason(''); setCancelOpen(true) }}>
                <Trash2 className="mr-2 h-4 w-4" /> Huỷ đơn
              </Button>
            )}
            {Number(detail.amount_paid) === 0 && (
              <Button onClick={() => router.push(`/sales/${id}/edit`)}>
                <Pencil className="mr-2 h-4 w-4" /> Chỉnh sửa
              </Button>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Chi tiết</TabsTrigger>
          <TabsTrigger value="adjustments">Điều chỉnh ({adjustments.length})</TabsTrigger>
          <TabsTrigger value="history">Lịch sử chỉnh sửa</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader><CardTitle>Thông tin đơn xuất</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div><span className="text-muted-foreground">Khách hàng:</span> {detail.customer_name || '-'}</div>
                <div><span className="text-muted-foreground">Ghi chú:</span> {detail.note || '-'}</div>
                <div><span className="text-muted-foreground">Trạng thái:</span>{' '}
                  <Badge variant={detail.status === 'CANCELLED' ? 'destructive' : 'secondary'}>{detail.status}</Badge>
                </div>
                <div><span className="text-muted-foreground">Doanh thu:</span> <span className="font-medium">{formatVN(detail.total_revenue)} VND</span></div>
                <div><span className="text-muted-foreground">Giá vốn:</span> {formatVN(detail.total_cost_estimated)} VND</div>
                <div><span className="text-muted-foreground">Lợi nhuận:</span>{' '}
                  <span className={Number(detail.profit) >= 0 ? 'font-medium text-green-600' : 'font-medium text-destructive'}>
                    {formatVN(detail.profit)} VND
                  </span>
                </div>
                <div><span className="text-muted-foreground">Đã TT:</span> {formatVN(detail.amount_paid)} VND</div>
                <div><span className="text-muted-foreground">Thanh toán:</span>{' '}
                  {detail.payment_status === 'PAID' ? <Badge className="bg-green-600 text-white">Đã TT</Badge>
                    : detail.payment_status === 'PARTIAL' ? <Badge className="bg-yellow-500 text-white">TT một phần</Badge>
                    : <Badge variant="destructive">Chưa TT</Badge>}
                </div>
                {(totalExtraCharge > 0 || totalDiscount > 0) && (
                  <>
                    {totalExtraCharge > 0 && (
                      <div><span className="text-muted-foreground">Phụ thu:</span> <span className="font-medium text-orange-600">+{formatVN(totalExtraCharge)} VND</span></div>
                    )}
                    {totalDiscount > 0 && (
                      <div><span className="text-muted-foreground">Giảm giá:</span> <span className="font-medium text-green-600">-{formatVN(totalDiscount)} VND</span></div>
                    )}
                    <div><span className="text-muted-foreground">Tổng sau điều chỉnh:</span> <span className="font-bold">{formatVN(adjustedTotal)} VND</span></div>
                  </>
                )}
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
                    <TableHead>Ghi chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.sales_items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{item.products?.name || '-'} <span className="text-xs text-muted-foreground">({item.products?.unit})</span></TableCell>
                      <TableCell className="font-mono text-xs">{item.inventory_batches?.batch_code || '-'}</TableCell>
                      <TableCell className="text-right">{formatQty(item.quantity)}</TableCell>
                      <TableCell className="text-right">{formatVN(item.sale_price)}</TableCell>
                      <TableCell className="text-right">{formatVN(item.cost_price)}</TableCell>
                      <TableCell className="text-right font-medium">{formatVN(item.total_price)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.note || ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adjustments">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Điều chỉnh đơn xuất</CardTitle>
                {detail.status !== 'CANCELLED' && (
                  <Button size="sm" onClick={() => { setAdjType('EXTRA_CHARGE'); setAdjAmount(0); setAdjNote(''); setAdjOpen(true) }}>
                    <Plus className="mr-2 h-4 w-4" /> Thêm điều chỉnh
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {adjustments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Chưa có điều chỉnh nào</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ngày</TableHead>
                        <TableHead>Loại</TableHead>
                        <TableHead className="text-right">Số tiền</TableHead>
                        <TableHead>Ghi chú</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustments.map((adj) => (
                        <TableRow key={adj.id}>
                          <TableCell className="text-sm">{new Date(adj.created_at).toLocaleString('vi-VN')}</TableCell>
                          <TableCell>
                            {adj.adjustment_type === 'EXTRA_CHARGE'
                              ? <Badge className="bg-orange-500 text-white">Phụ thu</Badge>
                              : <Badge className="bg-green-600 text-white">Giảm giá</Badge>}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${adj.adjustment_type === 'EXTRA_CHARGE' ? 'text-orange-600' : 'text-green-600'}`}>
                            {adj.adjustment_type === 'EXTRA_CHARGE' ? '+' : '-'}{formatVN(adj.amount)}
                          </TableCell>
                          <TableCell className="text-sm">{adj.note || '-'}</TableCell>
                          <TableCell>
                            {detail.status !== 'CANCELLED' && (
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteAdjustment(adj.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-4 flex justify-end gap-6 text-sm border-t pt-3">
                    <div>Phụ thu: <span className="font-medium text-orange-600">+{formatVN(totalExtraCharge)}</span></div>
                    <div>Giảm giá: <span className="font-medium text-green-600">-{formatVN(totalDiscount)}</span></div>
                    <div>Tổng sau điều chỉnh: <span className="font-bold">{formatVN(adjustedTotal)} VND</span></div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <RevisionHistory documentType="SALE" documentId={id} />
        </TabsContent>
      </Tabs>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
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
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Đóng</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Đang huỷ...' : 'Xác nhận huỷ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Adjustment Dialog */}
      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm điều chỉnh</DialogTitle>
            <DialogDescription>Phụ thu hoặc giảm giá cho đơn xuất</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Loại điều chỉnh</Label>
              <Select value={adjType} onValueChange={setAdjType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXTRA_CHARGE">Phụ thu</SelectItem>
                  <SelectItem value="DISCOUNT">Giảm giá</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Số tiền (VND)</Label>
              <CurrencyInput value={adjAmount} onValueChange={setAdjAmount} />
            </div>
            <div className="grid gap-2">
              <Label>Ghi chú</Label>
              <Textarea value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="Lý do điều chỉnh..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjOpen(false)}>Hủy</Button>
            <Button onClick={handleAddAdjustment} disabled={adjSaving || adjAmount <= 0}>
              {adjSaving ? 'Đang lưu...' : 'Thêm điều chỉnh'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

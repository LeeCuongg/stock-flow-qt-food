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
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

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
    products: { name: string; unit: string } | null
    inventory_batches: { batch_code: string | null; expiry_date: string | null } | null
  }[]
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
  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('sales')
      .select('id, customer_name, customer_id, note, total_revenue, total_cost_estimated, profit, amount_paid, payment_status, status, created_at, sales_items(quantity, sale_price, cost_price, total_price, products(name, unit), inventory_batches(batch_code, expiry_date))')
      .eq('id', id)
      .single()
    if (error) { toast.error('Không tìm thấy đơn xuất'); router.push('/sales') }
    else setDetail(data as unknown as SaleDetail)
    setLoading(false)
  }, [id, router])

  useEffect(() => { load() }, [load])

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
                <div><span className="text-muted-foreground">Doanh thu:</span> <span className="font-medium">{Number(detail.total_revenue).toLocaleString('vi-VN')} VND</span></div>
                <div><span className="text-muted-foreground">Giá vốn:</span> {Number(detail.total_cost_estimated).toLocaleString('vi-VN')} VND</div>
                <div><span className="text-muted-foreground">Lợi nhuận:</span>{' '}
                  <span className={Number(detail.profit) >= 0 ? 'font-medium text-green-600' : 'font-medium text-destructive'}>
                    {Number(detail.profit).toLocaleString('vi-VN')} VND
                  </span>
                </div>
                <div><span className="text-muted-foreground">Đã TT:</span> {Number(detail.amount_paid).toLocaleString('vi-VN')} VND</div>
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
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead className="text-right">Giá bán</TableHead>
                    <TableHead className="text-right">Giá vốn</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.sales_items.map((item, i) => (
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <RevisionHistory documentType="SALE" documentId={id} />
        </TabsContent>
      </Tabs>

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
    </div>
  )
}

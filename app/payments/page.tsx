'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { CreditCard, Ban } from 'lucide-react'
import { toast } from 'sonner'

interface Payment {
  id: string
  payment_type: string
  source_type: string
  source_id: string
  amount: number
  payment_method: string
  note: string | null
  created_at: string
  status: string
  void_reason: string | null
  voided_at: string | null
  customers: { name: string } | null
  suppliers: { name: string } | null
}

interface SourceItem {
  batch_code: string | null
  quantity: number
  products: { name: string } | null
}

const METHOD_LABELS: Record<string, string> = { CASH: 'Tiền mặt', BANK: 'Chuyển khoản', MOMO: 'MoMo', ZALOPAY: 'ZaloPay', OTHER: 'Khác' }

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [batchMap, setBatchMap] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [filterType, setFilterType] = useState('ALL')
  const [filterMethod, setFilterMethod] = useState('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [batchSearch, setBatchSearch] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null)
  const [detailItems, setDetailItems] = useState<SourceItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidSaving, setVoidSaving] = useState(false)
  const supabase = createClient()

  // Check admin role
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
        if (data?.role === 'admin') setIsAdmin(true)
      }
    })()
  }, [])

  const load = useCallback(async () => {
    setIsLoading(true)
    let q = supabase.from('payments').select('*, customers(name), suppliers(name)').order('created_at', { ascending: false })
    if (filterType !== 'ALL') q = q.eq('payment_type', filterType)
    if (filterMethod !== 'ALL') q = q.eq('payment_method', filterMethod)
    if (startDate) q = q.gte('created_at', `${startDate}T00:00:00+07:00`)
    if (endDate) q = q.lte('created_at', `${endDate}T23:59:59+07:00`)
    const { data, error } = await q
    if (error) { toast.error('Lỗi tải thanh toán'); setIsLoading(false); return }
    const list = (data as unknown as Payment[]) || []
    setPayments(list)

    // Fetch batch codes for all source_ids
    const saleIds = list.filter(p => p.source_type === 'SALE').map(p => p.source_id)
    const stockInIds = list.filter(p => p.source_type === 'STOCK_IN').map(p => p.source_id)
    const map: Record<string, string> = {}

    if (saleIds.length > 0) {
      const { data: sItems } = await supabase
        .from('sales_items')
        .select('sale_id, inventory_batches(batch_code)')
        .in('sale_id', saleIds)
      if (sItems) {
        for (const item of sItems as unknown as { sale_id: string; inventory_batches: { batch_code: string | null } | null }[]) {
          const code = item.inventory_batches?.batch_code
          if (code) {
            map[item.sale_id] = map[item.sale_id] ? `${map[item.sale_id]}, ${code}` : code
          }
        }
      }
    }
    if (stockInIds.length > 0) {
      const { data: siItems } = await supabase
        .from('stock_in_items')
        .select('stock_in_id, batch_code')
        .in('stock_in_id', stockInIds)
      if (siItems) {
        for (const item of siItems as { stock_in_id: string; batch_code: string | null }[]) {
          if (item.batch_code) {
            map[item.stock_in_id] = map[item.stock_in_id] ? `${map[item.stock_in_id]}, ${item.batch_code}` : item.batch_code
          }
        }
      }
    }
    for (const key of Object.keys(map)) {
      const codes = [...new Set(map[key].split(', '))]
      map[key] = codes.join(', ')
    }
    setBatchMap(map)
    setIsLoading(false)
  }, [filterType, filterMethod, startDate, endDate])

  useEffect(() => { load() }, [load])

  const openDetail = async (p: Payment) => {
    setDetailPayment(p)
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailItems([])

    if (p.source_type === 'SALE') {
      const { data } = await supabase
        .from('sales_items')
        .select('quantity, products(name), inventory_batches(batch_code)')
        .eq('sale_id', p.source_id)
      setDetailItems((data as unknown as SourceItem[])?.map(d => ({
        batch_code: (d as unknown as { inventory_batches: { batch_code: string | null } | null }).inventory_batches?.batch_code || null,
        quantity: d.quantity,
        products: d.products,
      })) || [])
    } else {
      const { data } = await supabase
        .from('stock_in_items')
        .select('batch_code, quantity, products(name)')
        .eq('stock_in_id', p.source_id)
      setDetailItems((data as unknown as SourceItem[]) || [])
    }
    setDetailLoading(false)
  }

  const handleVoidPayment = async () => {
    if (!detailPayment) return
    if (!voidReason.trim()) { toast.error('Vui lòng nhập lý do huỷ'); return }
    setVoidSaving(true)
    try {
      const { error } = await supabase.rpc('void_payment', {
        p_payment_id: detailPayment.id,
        p_reason: voidReason.trim(),
      })
      if (error) throw error
      toast.success('Đã huỷ thanh toán thành công')
      setVoidOpen(false)
      setDetailOpen(false)
      load()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally {
      setVoidSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Thanh toán</h1>
        <p className="text-sm text-muted-foreground">Lịch sử thu chi</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả</SelectItem>
                <SelectItem value="IN">Thu (IN)</SelectItem>
                <SelectItem value="OUT">Chi (OUT)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterMethod} onValueChange={setFilterMethod}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả PT</SelectItem>
                <SelectItem value="CASH">Tiền mặt</SelectItem>
                <SelectItem value="BANK">Chuyển khoản</SelectItem>
                <SelectItem value="MOMO">MoMo</SelectItem>
                <SelectItem value="ZALOPAY">ZaloPay</SelectItem>
                <SelectItem value="OTHER">Khác</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" aria-label="Từ ngày" />
              <span className="text-sm text-muted-foreground">→</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" aria-label="Đến ngày" />
            </div>
            <Input placeholder="Lọc mã lô..." value={batchSearch} onChange={(e) => setBatchSearch(e.target.value)} className="w-[160px]" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có giao dịch</h3>
            </div>
          ) : (
            (() => {
              const filtered = batchSearch.trim()
                ? payments.filter(p => (batchMap[p.source_id] || '').toLowerCase().includes(batchSearch.trim().toLowerCase()))
                : payments
              return filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CreditCard className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">Không tìm thấy</h3>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead>Nguồn</TableHead>
                      <TableHead>Đối tác</TableHead>
                      <TableHead>Mã lô</TableHead>
                      <TableHead className="text-right">Số tiền</TableHead>
                      <TableHead>Phương thức</TableHead>
                      <TableHead>Ghi chú</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow
                        key={p.id}
                        className={`cursor-pointer ${p.status === 'VOIDED' ? 'opacity-50 line-through' : ''}`}
                        onClick={() => openDetail(p)}
                      >
                        <TableCell className="text-sm">{new Date(p.created_at).toLocaleDateString('vi-VN')}</TableCell>
                        <TableCell>
                          {p.status === 'VOIDED'
                            ? <Badge variant="outline" className="text-muted-foreground">Đã huỷ</Badge>
                            : p.payment_type === 'IN'
                              ? <Badge className="bg-green-600 text-white hover:bg-green-700">Thu</Badge>
                              : <Badge variant="destructive">Chi</Badge>}
                        </TableCell>
                        <TableCell className="text-sm">{p.source_type === 'SALE' ? 'Đơn bán' : 'Phiếu nhập'}</TableCell>
                        <TableCell>{p.customers?.name || p.suppliers?.name || '-'}</TableCell>
                        <TableCell className="font-mono text-xs max-w-[150px] truncate">{batchMap[p.source_id] || '-'}</TableCell>
                        <TableCell className={`text-right font-medium ${p.status === 'VOIDED' ? 'text-muted-foreground' : p.payment_type === 'IN' ? 'text-green-600' : 'text-destructive'}`}>
                          {p.payment_type === 'IN' ? '+' : '-'}{Number(p.amount).toLocaleString('vi-VN')}
                        </TableCell>
                        <TableCell><Badge variant="outline">{METHOD_LABELS[p.payment_method] || p.payment_method}</Badge></TableCell>
                        <TableCell className="max-w-[150px] truncate text-sm">{p.status === 'VOIDED' ? `[Đã huỷ] ${p.void_reason || ''}` : (p.note || '-')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            })()
          )}
        </CardContent>
      </Card>

      {/* Payment Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết thanh toán</DialogTitle>
            <DialogDescription>
              {detailPayment ? new Date(detailPayment.created_at).toLocaleString('vi-VN') : ''}
            </DialogDescription>
          </DialogHeader>
          {detailPayment && (
            <div className="space-y-4 text-sm">
              {detailPayment.status === 'VOIDED' && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                  <p className="font-medium text-destructive">Thanh toán này đã bị huỷ</p>
                  {detailPayment.void_reason && <p className="text-sm text-muted-foreground mt-1">Lý do: {detailPayment.void_reason}</p>}
                  {detailPayment.voided_at && <p className="text-xs text-muted-foreground mt-1">Huỷ lúc: {new Date(detailPayment.voided_at).toLocaleString('vi-VN')}</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Loại:</span><br/>{detailPayment.payment_type === 'IN' ? <Badge className="bg-green-600 text-white">Thu</Badge> : <Badge variant="destructive">Chi</Badge>}</div>
                <div><span className="text-muted-foreground">Nguồn:</span><br/>{detailPayment.source_type === 'SALE' ? 'Đơn bán' : 'Phiếu nhập'}</div>
                <div><span className="text-muted-foreground">Đối tác:</span><br/><span className="font-medium">{detailPayment.customers?.name || detailPayment.suppliers?.name || '-'}</span></div>
                <div><span className="text-muted-foreground">Phương thức:</span><br/><Badge variant="outline">{METHOD_LABELS[detailPayment.payment_method] || detailPayment.payment_method}</Badge></div>
                <div className="col-span-2"><span className="text-muted-foreground">Số tiền:</span><br/><span className={`text-lg font-medium ${detailPayment.payment_type === 'IN' ? 'text-green-600' : 'text-destructive'}`}>{detailPayment.payment_type === 'IN' ? '+' : '-'}{Number(detailPayment.amount).toLocaleString('vi-VN')} VND</span></div>
              </div>
              {detailPayment.note && (
                <div><span className="text-muted-foreground">Ghi chú:</span><br/>{detailPayment.note}</div>
              )}
              {/* Source items with batch codes */}
              <div>
                <span className="text-muted-foreground font-medium">Sản phẩm liên quan:</span>
                {detailLoading ? (
                  <div className="text-center py-4 text-muted-foreground">Đang tải...</div>
                ) : detailItems.length === 0 ? (
                  <p className="text-muted-foreground mt-1">Không có thông tin</p>
                ) : (
                  <div className="mt-2 border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sản phẩm</TableHead>
                          <TableHead>Mã lô</TableHead>
                          <TableHead className="text-right">SL</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailItems.map((item, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{item.products?.name || '-'}</TableCell>
                            <TableCell className="font-mono text-xs">{item.batch_code || '-'}</TableCell>
                            <TableCell className="text-right">{Number(item.quantity).toLocaleString('vi-VN')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              {/* Void button - admin only, active payments only */}
              {isAdmin && (!detailPayment.status || detailPayment.status === 'ACTIVE') && (
                <div className="pt-2 border-t">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => { setVoidReason(''); setVoidOpen(true) }}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Huỷ thanh toán này
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Void Confirmation Dialog */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận huỷ thanh toán</DialogTitle>
            <DialogDescription>
              Huỷ khoản {detailPayment?.payment_type === 'IN' ? 'thu' : 'chi'}{' '}
              {Number(detailPayment?.amount || 0).toLocaleString('vi-VN')} VND.
              Số tiền sẽ được trừ khỏi phiếu gốc.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Nhập lý do huỷ thanh toán..."
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)} disabled={voidSaving}>
              Đóng
            </Button>
            <Button variant="destructive" onClick={handleVoidPayment} disabled={voidSaving || !voidReason.trim()}>
              {voidSaving ? 'Đang xử lý...' : 'Xác nhận huỷ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

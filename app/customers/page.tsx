'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Search, UserCheck, CreditCard } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CurrencyInput } from '@/components/ui/currency-input'

interface Customer { id: string; name: string; phone: string | null; address: string | null; note: string | null; created_at: string }
interface UnpaidSale { id: string; created_at: string; total_revenue: number; amount_paid: number; customer_name: string | null }
interface SaleDetailItem { quantity: number; sale_price: number; cost_price: number; total_price: number; products: { name: string; unit: string } | null; inventory_batches: { batch_code: string | null } | null }
interface SaleDetail { id: string; created_at: string; total_revenue: number; amount_paid: number; payment_status: string; note: string | null; sales_items: SaleDetailItem[] }
const emptyForm = { name: '', phone: '', address: '', note: '' }
const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK', label: 'Chuyển khoản' },
  { value: 'MOMO', label: 'MoMo' },
  { value: 'ZALOPAY', label: 'ZaloPay' },
  { value: 'OTHER', label: 'Khác' },
]

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  // Debt map: customer_id -> total_receivable
  const [debtMap, setDebtMap] = useState<Record<string, number>>({})
  // Bulk payment
  const [payOpen, setPayOpen] = useState(false)
  const [payCustomer, setPayCustomer] = useState<Customer | null>(null)
  const [unpaidSales, setUnpaidSales] = useState<UnpaidSale[]>([])
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('CASH')
  const [payNote, setPayNote] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [paySaving, setPaySaving] = useState(false)
  const [payMode, setPayMode] = useState<'pay' | 'debt'>('pay')
  const [debtRemaining, setDebtRemaining] = useState(0)
  // Sale detail popup
  const [saleDetailOpen, setSaleDetailOpen] = useState(false)
  const [saleDetail, setSaleDetail] = useState<SaleDetail | null>(null)
  const [saleDetailLoading, setSaleDetailLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    setIsLoading(true)
    let q = supabase.from('customers').select('*').order('created_at', { ascending: false })
    if (search.trim()) q = q.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`)
    const { data, error } = await q
    if (error) toast.error('Lỗi tải khách hàng')
    else setItems(data || [])
    setIsLoading(false)
  }, [search])

  const loadDebts = useCallback(async () => {
    const { data: wh } = await supabase.from('warehouses').select('id').limit(1)
    if (!wh?.[0]?.id) return
    const { data } = await supabase.rpc('get_receivable_report', { p_warehouse_id: wh[0].id })
    if (data) {
      const map: Record<string, number> = {}
      for (const r of data as { customer_id: string; total_receivable: number }[]) {
        if (r.customer_id) map[r.customer_id] = Number(r.total_receivable)
      }
      setDebtMap(map)
    }
  }, [])

  useEffect(() => { load(); loadDebts() }, [load, loadDebts])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true) }
  const openDelete = (c: Customer) => { setDeleting(c); setDeleteOpen(true) }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Tên không được để trống'); return }
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('customers').update({ name: form.name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null, note: form.note.trim() || null }).eq('id', editing.id)
        if (error) throw error
        toast.success('Cập nhật thành công')
      } else {
        const { data: wh } = await supabase.from('warehouses').select('id').limit(1)
        const { error } = await supabase.from('customers').insert({ name: form.name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null, note: form.note.trim() || null, warehouse_id: wh?.[0]?.id })
        if (error) throw error
        toast.success('Tạo khách hàng thành công')
      }
      setDialogOpen(false); load()
    } catch (err: unknown) { toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    const { error } = await supabase.from('customers').delete().eq('id', deleting.id)
    if (error) toast.error(`Lỗi: ${error.message}`)
    else { toast.success('Đã xóa'); setDeleteOpen(false); load() }
  }

  const openPayment = async (c: Customer) => {
    setPayCustomer(c)
    setPayAmount(debtMap[c.id] || 0)
    setPayMethod('CASH')
    setPayNote('')
    setPayMode('pay')
    setDebtRemaining(0)
    setPayOpen(true)
    setPayLoading(true)
    const { data } = await supabase
      .from('sales')
      .select('id, created_at, total_revenue, amount_paid, customer_name')
      .eq('customer_id', c.id)
      .neq('payment_status', 'PAID')
      .gt('total_revenue', 0)
      .order('created_at', { ascending: true })
    setUnpaidSales((data as UnpaidSale[]) || [])
    setPayLoading(false)
  }

  const handleBulkPayment = async () => {
    if (!payCustomer || payAmount <= 0) { toast.error('Số tiền phải > 0'); return }
    setPaySaving(true)
    try {
      const { data, error } = await supabase.rpc('allocate_customer_payment', {
        p_customer_id: payCustomer.id,
        p_amount: payAmount,
        p_payment_method: payMethod,
        p_note: payNote.trim() || null,
      })
      if (error) throw error
      const result = data as { total_allocated: number; invoices_paid: number; remaining: number }
      toast.success(`Đã phân bổ ${Number(result.total_allocated).toLocaleString('vi-VN')} VND vào ${result.invoices_paid} phiếu`)
      if (result.remaining > 0) {
        toast.info(`Còn dư ${Number(result.remaining).toLocaleString('vi-VN')} VND chưa phân bổ`)
      }
      setPayOpen(false)
      loadDebts()
    } catch (err: unknown) { toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`) }
    finally { setPaySaving(false) }
  }

  const totalUnpaidDebt = unpaidSales.reduce((s, sale) => s + (sale.total_revenue - sale.amount_paid), 0)

  const openSaleDetail = async (saleId: string) => {
    setSaleDetailOpen(true)
    setSaleDetailLoading(true)
    const { data } = await supabase
      .from('sales')
      .select('id, created_at, total_revenue, amount_paid, payment_status, note, sales_items(quantity, sale_price, cost_price, total_price, products(name, unit), inventory_batches(batch_code))')
      .eq('id', saleId)
      .single()
    setSaleDetail(data as unknown as SaleDetail)
    setSaleDetailLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Khách hàng</h1>
          <p className="text-sm text-muted-foreground">Quản lý danh sách khách hàng</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Thêm khách hàng</Button>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Tìm theo tên hoặc SĐT..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có khách hàng</h3>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tên</TableHead><TableHead>SĐT</TableHead><TableHead>Địa chỉ</TableHead><TableHead className="text-right">Công nợ</TableHead><TableHead className="text-right">Thao tác</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((c) => {
                  const debt = debtMap[c.id] || 0
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/customers/${c.id}`)}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.phone || '-'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{c.address || '-'}</TableCell>
                      <TableCell className="text-right">
                        {debt > 0 ? <span className="font-medium text-orange-600">{Number(debt).toLocaleString('vi-VN')}</span> : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {debt > 0 && (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openPayment(c) }}>
                              <CreditCard className="mr-1 h-3 w-3" /> Thu tiền
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDelete(c) }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Bulk Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thu tiền — {payCustomer?.name}</DialogTitle>
            <DialogDescription>
              Tổng nợ: <span className="font-medium text-orange-600">{Number(totalUnpaidDebt).toLocaleString('vi-VN')} VND</span> — Nhập số tiền khách trả, hệ thống tự phân bổ vào các phiếu (cũ trước)
            </DialogDescription>
          </DialogHeader>
          {payLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : (
            <div className="space-y-4">
              {/* Unpaid sales list */}
              {unpaidSales.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ngày</TableHead>
                        <TableHead className="text-right">Tổng tiền</TableHead>
                        <TableHead className="text-right">Đã TT</TableHead>
                        <TableHead className="text-right">Còn nợ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unpaidSales.map((s) => (
                        <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openSaleDetail(s.id)}>
                          <TableCell className="text-sm">{new Date(s.created_at).toLocaleDateString('vi-VN')}</TableCell>
                          <TableCell className="text-right">{Number(s.total_revenue).toLocaleString('vi-VN')}</TableCell>
                          <TableCell className="text-right">{Number(s.amount_paid).toLocaleString('vi-VN')}</TableCell>
                          <TableCell className="text-right font-medium text-orange-600">{Number(s.total_revenue - s.amount_paid).toLocaleString('vi-VN')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <div className="flex gap-2 mb-1">
                    <Button type="button" variant={payMode === 'pay' ? 'default' : 'outline'} size="sm" onClick={() => setPayMode('pay')}>Số tiền khách trả</Button>
                    <Button type="button" variant={payMode === 'debt' ? 'default' : 'outline'} size="sm" onClick={() => setPayMode('debt')}>Số tiền còn nợ</Button>
                  </div>
                  {payMode === 'pay' ? (
                    <>
                      <Label>Số tiền khách trả *</Label>
                      <CurrencyInput value={payAmount} onValueChange={setPayAmount} />
                    </>
                  ) : (
                    <>
                      <Label>Số tiền khách còn nợ sau khi trả *</Label>
                      <CurrencyInput value={debtRemaining} onValueChange={(v) => {
                        setDebtRemaining(v)
                        setPayAmount(Math.max(0, totalUnpaidDebt - v))
                      }} />
                      <p className="text-sm text-muted-foreground">→ Khách trả: <span className="font-medium text-foreground">{Number(Math.max(0, totalUnpaidDebt - debtRemaining)).toLocaleString('vi-VN')} VND</span></p>
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setPayMode('pay'); setPayAmount(totalUnpaidDebt); setDebtRemaining(0) }}>Trả hết nợ</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
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
              </div>
              {/* Preview allocation */}
              {payAmount > 0 && unpaidSales.length > 0 && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-1 text-sm">
                  <div className="font-medium mb-2">Dự kiến phân bổ:</div>
                  {(() => {
                    let rem = payAmount
                    return unpaidSales.map((s) => {
                      if (rem <= 0) return null
                      const debt = s.total_revenue - s.amount_paid
                      const alloc = Math.min(rem, debt)
                      rem -= alloc
                      return (
                        <div key={s.id} className="flex justify-between">
                          <span className="text-muted-foreground">{new Date(s.created_at).toLocaleDateString('vi-VN')} (nợ {Number(debt).toLocaleString('vi-VN')})</span>
                          <span className="font-medium text-green-600">→ {Number(alloc).toLocaleString('vi-VN')}{alloc >= debt ? <Badge className="ml-1 bg-green-600 text-white text-[10px] px-1">Tất toán</Badge> : ''}</span>
                        </div>
                      )
                    })
                  })()}
                  {payAmount > totalUnpaidDebt && (
                    <div className="flex justify-between text-orange-600 pt-1 border-t">
                      <span>Dư:</span>
                      <span className="font-medium">{Number(payAmount - totalUnpaidDebt).toLocaleString('vi-VN')} VND</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Hủy</Button>
            <Button onClick={handleBulkPayment} disabled={paySaving || payAmount <= 0}>
              {paySaving ? 'Đang xử lý...' : 'Xác nhận thu tiền'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale Detail Popup */}
      <Dialog open={saleDetailOpen} onOpenChange={setSaleDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết phiếu xuất</DialogTitle>
            {saleDetail && (
              <DialogDescription>
                Ngày: {new Date(saleDetail.created_at).toLocaleString('vi-VN')} — Tổng: {Number(saleDetail.total_revenue).toLocaleString('vi-VN')} VND
              </DialogDescription>
            )}
          </DialogHeader>
          {saleDetailLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : saleDetail ? (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <div><span className="text-muted-foreground">Đã TT:</span> {Number(saleDetail.amount_paid).toLocaleString('vi-VN')}</div>
                <div><span className="text-muted-foreground">Còn nợ:</span> <span className="font-medium text-orange-600">{Number(saleDetail.total_revenue - saleDetail.amount_paid).toLocaleString('vi-VN')}</span></div>
                {saleDetail.note && <div><span className="text-muted-foreground">Ghi chú:</span> {saleDetail.note}</div>}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Mã lô</TableHead>
                      <TableHead className="text-right">SL</TableHead>
                      <TableHead className="text-right">Giá vốn</TableHead>
                      <TableHead className="text-right">Giá bán</TableHead>
                      <TableHead className="text-right">Thành tiền</TableHead>
                      
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saleDetail.sales_items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{item.products?.name || '-'} <span className="text-xs text-muted-foreground">({item.products?.unit})</span></TableCell>
                        <TableCell className="font-mono text-xs">{item.inventory_batches?.batch_code || '-'}</TableCell>
                        <TableCell className="text-right">{Number(item.quantity).toLocaleString('vi-VN')}</TableCell>
                        <TableCell className="text-right">{Number(item.cost_price).toLocaleString('vi-VN')}</TableCell>
                        <TableCell className="text-right">{Number(item.sale_price).toLocaleString('vi-VN')}</TableCell>
                        <TableCell className="text-right font-medium">{Number(item.total_price).toLocaleString('vi-VN')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaleDetailOpen(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Sửa khách hàng' : 'Thêm khách hàng'}</DialogTitle>
            <DialogDescription>{editing ? 'Cập nhật thông tin' : 'Nhập thông tin khách hàng mới'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label>Tên *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>SĐT</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Địa chỉ</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            </div>
            <div className="grid gap-2"><Label>Ghi chú</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Tạo mới'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>Xóa khách hàng &quot;{deleting?.name}&quot;?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

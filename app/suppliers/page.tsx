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
import { Plus, Trash2, Search, Truck, CreditCard } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CurrencyInput } from '@/components/ui/currency-input'
import { formatVN, formatQty, formatVNDate } from '@/lib/utils'

interface Supplier { id: string; name: string; phone: string | null; address: string | null; note: string | null; created_at: string }
interface UnpaidStockIn { id: string; created_at: string; total_amount: number; amount_paid: number; supplier_name: string | null }
interface StockInDetailItem { quantity: number; cost_price: number; total_price: number; products: { name: string; unit: string } | null; batch_code: string | null }
interface StockInDetail { id: string; created_at: string; total_amount: number; amount_paid: number; payment_status: string; note: string | null; stock_in_items: StockInDetailItem[] }
const emptyForm = { name: '', phone: '', address: '', note: '' }
const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK', label: 'Chuyển khoản' },
  { value: 'MOMO', label: 'MoMo' },
  { value: 'ZALOPAY', label: 'ZaloPay' },
  { value: 'OTHER', label: 'Khác' },
]

export default function SuppliersPage() {
  const [items, setItems] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState<Supplier | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  // Debt map
  const [debtMap, setDebtMap] = useState<Record<string, number>>({})
  // Bulk payment
  const [payOpen, setPayOpen] = useState(false)
  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null)
  const [unpaidStockIns, setUnpaidStockIns] = useState<UnpaidStockIn[]>([])
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('CASH')
  const [payNote, setPayNote] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [paySaving, setPaySaving] = useState(false)
  const [payMode, setPayMode] = useState<'pay' | 'debt'>('pay')
  const [debtRemaining, setDebtRemaining] = useState(0)
  // Stock-in detail popup
  const [siDetailOpen, setSiDetailOpen] = useState(false)
  const [siDetail, setSiDetail] = useState<StockInDetail | null>(null)
  const [siDetailLoading, setSiDetailLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    setIsLoading(true)
    let q = supabase.from('suppliers').select('*').order('created_at', { ascending: false }).order('id', { ascending: false })
    if (search.trim()) q = q.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`)
    const { data, error } = await q
    if (error) toast.error('Lỗi tải nhà cung cấp')
    else setItems(data || [])
    setIsLoading(false)
  }, [search])

  const loadDebts = useCallback(async () => {
    const { data: wh } = await supabase.from('warehouses').select('id').limit(1)
    if (!wh?.[0]?.id) return
    const { data } = await supabase.rpc('get_payable_report', { p_warehouse_id: wh[0].id })
    if (data) {
      const map: Record<string, number> = {}
      for (const r of data as { supplier_id: string; total_payable: number }[]) {
        if (r.supplier_id) map[r.supplier_id] = Number(r.total_payable)
      }
      setDebtMap(map)
    }
  }, [])

  useEffect(() => { load(); loadDebts() }, [load, loadDebts])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true) }
  const openDelete = (s: Supplier) => { setDeleting(s); setDeleteOpen(true) }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Tên không được để trống'); return }
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('suppliers').update({ name: form.name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null, note: form.note.trim() || null }).eq('id', editing.id)
        if (error) throw error
        toast.success('Cập nhật thành công')
      } else {
        const { data: wh } = await supabase.from('warehouses').select('id').limit(1)
        const { error } = await supabase.from('suppliers').insert({ name: form.name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null, note: form.note.trim() || null, warehouse_id: wh?.[0]?.id })
        if (error) throw error
        toast.success('Tạo nhà cung cấp thành công')
      }
      setDialogOpen(false); load()
    } catch (err: unknown) { toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    // Check for active stock_in linked to this supplier
    const { count } = await supabase
      .from('stock_in')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', deleting.id)
      .neq('status', 'CANCELLED')
    if (count && count > 0) {
      toast.error(`Không thể xoá: nhà cung cấp "${deleting.name}" đang có ${count} phiếu nhập chưa huỷ`)
      setDeleteOpen(false)
      return
    }
    // Nullify supplier_id on cancelled stock_in to avoid FK constraint
    await supabase
      .from('stock_in')
      .update({ supplier_id: null })
      .eq('supplier_id', deleting.id)
      .eq('status', 'CANCELLED')
    const { error } = await supabase.from('suppliers').delete().eq('id', deleting.id)
    if (error) toast.error(`Lỗi: ${error.message}`)
    else { toast.success('Đã xóa'); setDeleteOpen(false); load() }
  }

  const openPayment = async (s: Supplier) => {
    setPaySupplier(s)
    setPayAmount(debtMap[s.id] || 0)
    setPayMethod('CASH')
    setPayNote('')
    setPayMode('pay')
    setDebtRemaining(0)
    setPayOpen(true)
    setPayLoading(true)
    const { data } = await supabase
      .from('stock_in')
      .select('id, created_at, total_amount, amount_paid, supplier_name')
      .eq('supplier_id', s.id)
      .neq('payment_status', 'PAID')
      .neq('status', 'CANCELLED')
      .gt('total_amount', 0)
      .order('created_at', { ascending: true })
    setUnpaidStockIns((data as UnpaidStockIn[]) || [])
    setPayLoading(false)
  }

  const handleBulkPayment = async () => {
    if (!paySupplier || payAmount <= 0) { toast.error('Số tiền phải > 0'); return }
    setPaySaving(true)
    try {
      const { data, error } = await supabase.rpc('allocate_supplier_payment', {
        p_supplier_id: paySupplier.id,
        p_amount: payAmount,
        p_payment_method: payMethod,
        p_note: payNote.trim() || null,
      })
      if (error) throw error
      const result = data as { total_allocated: number; invoices_paid: number; remaining: number }
      toast.success(`Đã phân bổ ${formatVN(result.total_allocated)} VND vào ${result.invoices_paid} phiếu`)
      if (result.remaining > 0) {
        toast.info(`Còn dư ${formatVN(result.remaining)} VND chưa phân bổ`)
      }
      setPayOpen(false)
      loadDebts()
    } catch (err: unknown) { toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`) }
    finally { setPaySaving(false) }
  }

  const totalUnpaidDebt = unpaidStockIns.reduce((s, si) => s + (si.total_amount - si.amount_paid), 0)

  const openSiDetail = async (siId: string) => {
    setSiDetailOpen(true)
    setSiDetailLoading(true)
    const { data } = await supabase
      .from('stock_in')
      .select('id, created_at, total_amount, amount_paid, payment_status, note, stock_in_items(quantity, cost_price, total_price, batch_code, products(name, unit))')
      .eq('id', siId)
      .single()
    setSiDetail(data as unknown as StockInDetail)
    setSiDetailLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nhà cung cấp</h1>
          <p className="text-sm text-muted-foreground">Quản lý danh sách nhà cung cấp</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Thêm NCC</Button>
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
              <Truck className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có nhà cung cấp</h3>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tên</TableHead><TableHead>SĐT</TableHead><TableHead>Địa chỉ</TableHead><TableHead className="text-right">Công nợ</TableHead><TableHead className="text-right">Thao tác</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((s) => {
                  const debt = debtMap[s.id] || 0
                  return (
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/suppliers/${s.id}`)}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.phone || '-'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{s.address || '-'}</TableCell>
                      <TableCell className="text-right">
                        {debt > 0 ? <span className="font-medium text-red-600">{formatVN(debt)}</span> : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {debt > 0 && (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openPayment(s) }}>
                              <CreditCard className="mr-1 h-3 w-3" /> Chi tiền
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDelete(s) }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
            <DialogTitle>Chi tiền — {paySupplier?.name}</DialogTitle>
            <DialogDescription>
              Tổng nợ: <span className="font-medium text-red-600">{formatVN(totalUnpaidDebt)} VND</span> — Nhập số tiền chi, hệ thống tự phân bổ vào các phiếu (cũ trước)
            </DialogDescription>
          </DialogHeader>
          {payLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : (
            <div className="space-y-4">
              {unpaidStockIns.length > 0 && (
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
                      {unpaidStockIns.map((si) => (
                        <TableRow key={si.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openSiDetail(si.id)}>
                          <TableCell className="text-sm">{formatVNDate(si.created_at)}</TableCell>
                          <TableCell className="text-right">{formatVN(si.total_amount)}</TableCell>
                          <TableCell className="text-right">{formatVN(si.amount_paid)}</TableCell>
                          <TableCell className="text-right font-medium text-red-600">{formatVN(si.total_amount - si.amount_paid)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <div className="flex gap-2 mb-1">
                    <Button type="button" variant={payMode === 'pay' ? 'default' : 'outline'} size="sm" onClick={() => setPayMode('pay')}>Số tiền chi</Button>
                    <Button type="button" variant={payMode === 'debt' ? 'default' : 'outline'} size="sm" onClick={() => setPayMode('debt')}>Số tiền còn nợ</Button>
                  </div>
                  {payMode === 'pay' ? (
                    <>
                      <Label>Số tiền chi *</Label>
                      <CurrencyInput value={payAmount} onValueChange={setPayAmount} />
                    </>
                  ) : (
                    <>
                      <Label>Số tiền còn nợ NCC sau khi trả *</Label>
                      <CurrencyInput value={debtRemaining} onValueChange={(v) => {
                        setDebtRemaining(v)
                        setPayAmount(Math.max(0, totalUnpaidDebt - v))
                      }} />
                      <p className="text-sm text-muted-foreground">→ Số tiền chi: <span className="font-medium text-foreground">{formatVN(Math.max(0, totalUnpaidDebt - debtRemaining))} VND</span></p>
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
              {payAmount > 0 && unpaidStockIns.length > 0 && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-1 text-sm">
                  <div className="font-medium mb-2">Dự kiến phân bổ:</div>
                  {(() => {
                    let rem = payAmount
                    return unpaidStockIns.map((si) => {
                      if (rem <= 0) return null
                      const debt = si.total_amount - si.amount_paid
                      const alloc = Math.min(rem, debt)
                      rem -= alloc
                      return (
                        <div key={si.id} className="flex justify-between">
                          <span className="text-muted-foreground">{formatVNDate(si.created_at)} (nợ {formatVN(debt)})</span>
                          <span className="font-medium text-green-600">→ {formatVN(alloc)}{alloc >= debt ? <Badge className="ml-1 bg-green-600 text-white text-[10px] px-1">Tất toán</Badge> : ''}</span>
                        </div>
                      )
                    })
                  })()}
                  {payAmount > totalUnpaidDebt && (
                    <div className="flex justify-between text-orange-600 pt-1 border-t">
                      <span>Dư:</span>
                      <span className="font-medium">{formatVN(payAmount - totalUnpaidDebt)} VND</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Hủy</Button>
            <Button onClick={handleBulkPayment} disabled={paySaving || payAmount <= 0}>
              {paySaving ? 'Đang xử lý...' : 'Xác nhận chi tiền'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock-In Detail Popup */}
      <Dialog open={siDetailOpen} onOpenChange={setSiDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết phiếu nhập</DialogTitle>
            {siDetail && (
              <DialogDescription>
                Ngày: {new Date(siDetail.created_at).toLocaleString('vi-VN')} — Tổng: {formatVN(siDetail.total_amount)} VND
              </DialogDescription>
            )}
          </DialogHeader>
          {siDetailLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : siDetail ? (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <div><span className="text-muted-foreground">Đã TT:</span> {formatVN(siDetail.amount_paid)}</div>
                <div><span className="text-muted-foreground">Còn nợ:</span> <span className="font-medium text-red-600">{formatVN(siDetail.total_amount - siDetail.amount_paid)}</span></div>
                {siDetail.note && <div><span className="text-muted-foreground">Ghi chú:</span> {siDetail.note}</div>}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Mã lô</TableHead>
                      <TableHead className="text-right">SL</TableHead>
                      <TableHead className="text-right">Giá nhập</TableHead>
                      <TableHead className="text-right">Thành tiền</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {siDetail.stock_in_items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{item.products?.name || '-'} <span className="text-xs text-muted-foreground">({item.products?.unit})</span></TableCell>
                        <TableCell className="font-mono text-xs">{item.batch_code || '-'}</TableCell>
                        <TableCell className="text-right">{formatQty(item.quantity)}</TableCell>
                        <TableCell className="text-right">{formatVN(item.cost_price)}</TableCell>
                        <TableCell className="text-right font-medium">{formatVN(item.total_price)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSiDetailOpen(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}</DialogTitle>
            <DialogDescription>{editing ? 'Cập nhật thông tin' : 'Nhập thông tin NCC mới'}</DialogDescription>
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
            <AlertDialogDescription>Xóa nhà cung cấp &quot;{deleting?.name}&quot;?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

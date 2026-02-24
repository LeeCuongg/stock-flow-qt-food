'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import { Plus, Receipt, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CurrencyInput } from '@/components/ui/currency-input'
import { formatVN, formatVNDate } from '@/lib/utils'

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK', label: 'Chuyển khoản' },
  { value: 'MOMO', label: 'MoMo' },
  { value: 'ZALOPAY', label: 'ZaloPay' },
  { value: 'OTHER', label: 'Khác' },
]

interface ExpenseCategory { id: string; name: string }

interface ExpenseRecord {
  id: string
  amount: number
  payment_method: string
  note: string | null
  created_at: string
  expense_categories: { name: string } | null
  sales: { customer_name: string | null } | null
}

export default function ExpensesPage() {
  const [records, setRecords] = useState<ExpenseRecord[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [warehouseId, setWarehouseId] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('ALL')
  const [filterMethod, setFilterMethod] = useState('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Create expense dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formCategoryId, setFormCategoryId] = useState('')
  const [formAmount, setFormAmount] = useState(0)
  const [formMethod, setFormMethod] = useState('CASH')
  const [formNote, setFormNote] = useState('')

  // Create category dialog
  const [catOpen, setCatOpen] = useState(false)
  const [catName, setCatName] = useState('')
  const [catSaving, setCatSaving] = useState(false)

  const supabase = createClient()

  const loadWarehouse = useCallback(async () => {
    const { data } = await supabase.from('warehouses').select('id').limit(1)
    if (data?.[0]) setWarehouseId(data[0].id)
  }, [])

  const loadCategories = useCallback(async () => {
    if (!warehouseId) return
    const { data } = await supabase
      .from('expense_categories')
      .select('id, name')
      .eq('warehouse_id', warehouseId)
      .order('name')
    setCategories(data || [])
  }, [warehouseId])

  const loadRecords = useCallback(async () => {
    if (!warehouseId) return
    setIsLoading(true)
    let q = supabase
      .from('expense_records')
      .select('id, amount, payment_method, note, created_at, expense_categories(name), sales(customer_name)')
      .eq('warehouse_id', warehouseId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    if (filterCategory !== 'ALL') q = q.eq('category_id', filterCategory)
    if (filterMethod !== 'ALL') q = q.eq('payment_method', filterMethod)
    if (startDate) q = q.gte('created_at', `${startDate}T00:00:00+07:00`)
    if (endDate) q = q.lte('created_at', `${endDate}T23:59:59+07:00`)
    const { data, error } = await q
    if (error) toast.error('Lỗi tải chi phí')
    else setRecords((data as unknown as ExpenseRecord[]) || [])
    setIsLoading(false)
  }, [warehouseId, filterCategory, filterMethod, startDate, endDate])

  useEffect(() => { loadWarehouse() }, [loadWarehouse])
  useEffect(() => { if (warehouseId) { loadCategories(); loadRecords() } }, [warehouseId, loadCategories, loadRecords])

  const filteredRecords = records.filter((r) => {
    if (!search.trim()) return true
    const s = search.toLowerCase()
    const catName = r.expense_categories?.name?.toLowerCase() || ''
    const note = r.note?.toLowerCase() || ''
    return catName.includes(s) || note.includes(s)
  })

  const totalAmount = filteredRecords.reduce((s, r) => s + Number(r.amount), 0)

  const handleCreateExpense = async () => {
    if (formAmount <= 0) { toast.error('Số tiền phải > 0'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('expense_records').insert({
        warehouse_id: warehouseId,
        category_id: formCategoryId || null,
        amount: formAmount,
        payment_method: formMethod,
        note: formNote.trim() || null,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      })
      if (error) throw error
      toast.success('Đã thêm chi phí')
      setCreateOpen(false)
      setFormAmount(0)
      setFormNote('')
      loadRecords()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setSaving(false) }
  }

  const handleCreateCategory = async () => {
    if (!catName.trim()) { toast.error('Tên danh mục không được trống'); return }
    setCatSaving(true)
    try {
      const { error } = await supabase.from('expense_categories').insert({
        warehouse_id: warehouseId,
        name: catName.trim(),
      })
      if (error) throw error
      toast.success('Đã thêm danh mục')
      setCatOpen(false)
      setCatName('')
      loadCategories()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setCatSaving(false) }
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('expense_records').delete().eq('id', id)
    if (error) toast.error('Lỗi xoá chi phí')
    else { toast.success('Đã xoá'); loadRecords() }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chi phí vận hành</h1>
          <p className="text-sm text-muted-foreground">Quản lý chi phí hoạt động</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setCatName(''); setCatOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" /> Danh mục
          </Button>
          <Button onClick={() => { setFormCategoryId(''); setFormAmount(0); setFormMethod('CASH'); setFormNote(''); setCreateOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" /> Thêm chi phí
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm theo danh mục, ghi chú..." value={search}
                onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Danh mục" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả danh mục</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterMethod} onValueChange={setFilterMethod}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả PT</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" aria-label="Từ ngày" />
              <span className="text-sm text-muted-foreground">→</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" aria-label="Đến ngày" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có chi phí</h3>
              <p className="text-sm text-muted-foreground mt-1">Nhấn &quot;Thêm chi phí&quot; để bắt đầu.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Danh mục</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead>Phương thức</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead>Đơn liên quan</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{formatVNDate(r.created_at)}</TableCell>
                      <TableCell>
                        {r.expense_categories?.name
                          ? <Badge variant="secondary">{r.expense_categories.name}</Badge>
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium text-destructive">
                        {formatVN(r.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {PAYMENT_METHODS.find(m => m.value === r.payment_method)?.label || r.payment_method}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{r.note || '-'}</TableCell>
                      <TableCell className="text-sm">{r.sales?.customer_name || '-'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 flex justify-end text-sm border-t pt-3">
                <span>Tổng chi phí: <span className="font-bold text-destructive">{formatVN(totalAmount)} VND</span></span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Expense Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm chi phí</DialogTitle>
            <DialogDescription>Ghi nhận chi phí vận hành</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Danh mục</Label>
              <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                <SelectTrigger><SelectValue placeholder="Chọn danh mục..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không phân loại</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Số tiền (VND) *</Label>
              <CurrencyInput value={formAmount} onValueChange={setFormAmount} />
            </div>
            <div className="grid gap-2">
              <Label>Phương thức thanh toán</Label>
              <Select value={formMethod} onValueChange={setFormMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Ghi chú</Label>
              <Textarea value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Mô tả chi phí..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button>
            <Button onClick={handleCreateExpense} disabled={saving || formAmount <= 0}>
              {saving ? 'Đang lưu...' : 'Thêm chi phí'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Category Dialog */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Thêm danh mục chi phí</DialogTitle>
            <DialogDescription>Tạo danh mục mới để phân loại chi phí</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Tên danh mục *</Label>
              <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="VD: Điện nước, Vận chuyển..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatOpen(false)}>Hủy</Button>
            <Button onClick={handleCreateCategory} disabled={catSaving || !catName.trim()}>
              {catSaving ? 'Đang lưu...' : 'Tạo danh mục'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

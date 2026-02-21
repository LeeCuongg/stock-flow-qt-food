'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Pencil, Phone, MapPin, FileText, Package, Check, X, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { CurrencyInput } from '@/components/ui/currency-input'
import { formatVN, formatQty } from '@/lib/utils'

interface Supplier {
  id: string; name: string; phone: string | null; address: string | null; note: string | null; created_at: string
}
interface SupplierPrice {
  id: string; product_id: string; cost_price: number; updated_at: string
  products: { name: string; unit: string; sku: string | null; product_categories: { name: string } | null } | null
}

export default function SupplierDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [prices, setPrices] = useState<SupplierPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [debt, setDebt] = useState(0)
  // Edit supplier info
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', note: '' })
  const [editSaving, setEditSaving] = useState(false)
  // Edit price inline
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [editPriceValue, setEditPriceValue] = useState(0)
  const [priceSaving, setPriceSaving] = useState(false)
  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const [suppRes, priceRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('id', id).single(),
      supabase
        .from('supplier_product_prices')
        .select('id, product_id, cost_price, updated_at, products(name, unit, sku, product_categories(name))')
        .eq('supplier_id', id)
        .order('updated_at', { ascending: false }),
    ])
    if (suppRes.error) {
      toast.error('Không tìm thấy nhà cung cấp')
      router.push('/suppliers')
      return
    }
    setSupplier(suppRes.data as Supplier)
    setPrices((priceRes.data as unknown as SupplierPrice[]) || [])
    // Load debt
    const { data: wh } = await supabase.from('warehouses').select('id').limit(1)
    if (wh?.[0]?.id) {
      const { data: debtData } = await supabase.rpc('get_payable_report', { p_warehouse_id: wh[0].id })
      if (debtData) {
        const found = (debtData as { supplier_id: string; total_payable: number }[]).find(r => r.supplier_id === id)
        setDebt(found ? Number(found.total_payable) : 0)
      }
    }
    setLoading(false)
  }, [id, router])

  useEffect(() => { load() }, [load])

  const openEditInfo = () => {
    if (!supplier) return
    setEditForm({ name: supplier.name, phone: supplier.phone || '', address: supplier.address || '', note: supplier.note || '' })
    setEditOpen(true)
  }

  const handleSaveInfo = async () => {
    if (!editForm.name.trim()) { toast.error('Tên không được để trống'); return }
    setEditSaving(true)
    try {
      const { error } = await supabase.from('suppliers').update({
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
        note: editForm.note.trim() || null,
      }).eq('id', id)
      if (error) throw error
      toast.success('Cập nhật thành công')
      setEditOpen(false)
      load()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setEditSaving(false) }
  }

  const startEditPrice = (p: SupplierPrice) => {
    setEditingPriceId(p.id)
    setEditPriceValue(Number(p.cost_price))
  }
  const cancelEditPrice = () => { setEditingPriceId(null); setEditPriceValue(0) }

  const savePrice = async (priceRow: SupplierPrice) => {
    if (editPriceValue < 0) { toast.error('Giá không hợp lệ'); return }
    setPriceSaving(true)
    try {
      const { error } = await supabase
        .from('supplier_product_prices')
        .update({ cost_price: editPriceValue, updated_at: new Date().toISOString() })
        .eq('id', priceRow.id)
      if (error) throw error
      toast.success(`Đã cập nhật giá ${priceRow.products?.name}`)
      setEditingPriceId(null)
      load()
    } catch (err: unknown) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'Không xác định'}`)
    } finally { setPriceSaving(false) }
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground">Đang tải...</div>
  if (!supplier) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/suppliers')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chi tiết nhà cung cấp</h1>
          <p className="text-sm text-muted-foreground">Thông tin và bảng giá của {supplier.name}</p>
        </div>
      </div>

      {/* Supplier Info */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Thông tin cơ bản</CardTitle>
          <Button variant="outline" size="sm" onClick={openEditInfo}>
            <Pencil className="mr-1 h-3 w-3" /> Sửa
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Tên:</span>
              <span className="font-medium">{supplier.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">SĐT:</span>
              <span>{supplier.phone || '-'}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Địa chỉ:</span>
              <span>{supplier.address || '-'}</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Ghi chú:</span>
              <span>{supplier.note || '-'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Công nợ:</span>
              {debt > 0 ? (
                <span className="font-medium text-red-600">{formatVN(debt)} VND</span>
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Ngày tạo:</span>
              <span>{new Date(supplier.created_at).toLocaleDateString('vi-VN')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Prices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Bảng giá nhập
            <Badge variant="secondary" className="ml-2">{prices.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {prices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Chưa có lịch sử giá nhập cho NCC này
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Danh mục</TableHead>
                  <TableHead>Đơn vị</TableHead>
                  <TableHead className="text-right">Giá nhập gần nhất</TableHead>
                  <TableHead className="text-right">Cập nhật</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prices.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.products?.name || '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{p.products?.sku || '-'}</TableCell>
                    <TableCell>
                      {p.products?.product_categories?.name ? (
                        <Badge variant="outline">{p.products.product_categories.name}</Badge>
                      ) : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{p.products?.unit || '-'}</Badge></TableCell>
                    <TableCell className="text-right">
                      {editingPriceId === p.id ? (
                        <CurrencyInput
                          value={editPriceValue}
                          onValueChange={setEditPriceValue}
                          className="w-32 ml-auto"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') savePrice(p)
                            if (e.key === 'Escape') cancelEditPrice()
                          }}
                        />
                      ) : (
                        <span className="font-medium">{formatVN(p.cost_price)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {new Date(p.updated_at).toLocaleDateString('vi-VN')}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingPriceId === p.id ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => savePrice(p)} disabled={priceSaving}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={cancelEditPrice}>
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => startEditPrice(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Supplier Info Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa thông tin nhà cung cấp</DialogTitle>
            <DialogDescription>Cập nhật thông tin cơ bản</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Tên *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>SĐT</Label>
                <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Địa chỉ</Label>
                <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Ghi chú</Label>
              <Textarea value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Hủy</Button>
            <Button onClick={handleSaveInfo} disabled={editSaving}>
              {editSaving ? 'Đang lưu...' : 'Cập nhật'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

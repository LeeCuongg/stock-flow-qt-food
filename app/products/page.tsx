'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, Search, Package, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

function generateSKU(name: string): string {
  const clean = removeVietnameseTones(name.trim()).toUpperCase()
  return clean
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean)
    .join('-')
}

interface Category {
  id: string
  name: string
}

interface Product {
  id: string
  name: string
  sku: string | null
  unit: string
  category: string | null
  category_id: string | null
  warehouse_id: string
  created_at: string
  tolerance_type: 'FIXED' | 'PERCENT'
  tolerance_value: number
  product_categories?: { name: string } | null
}

const emptyForm = {
  name: '',
  sku: '',
  unit: 'kg',
  category_id: '',
  tolerance_type: 'FIXED' as 'FIXED' | 'PERCENT',
  tolerance_value: 0,
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterUnit, setFilterUnit] = useState('')
  const [availableUnits, setAvailableUnits] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const loadCategories = useCallback(async () => {
    const { data } = await supabase.from('product_categories').select('id, name').order('name')
    setCategories(data || [])
  }, [])

  const loadUnits = useCallback(async () => {
    const { data } = await supabase.from('products').select('unit')
    if (data) {
      const units = Array.from(new Set(data.map((p) => p.unit))).sort()
      setAvailableUnits(units)
    }
  }, [])

  const loadProducts = useCallback(async () => {
    setIsLoading(true)
    let query = supabase
      .from('products')
      .select('*, product_categories(name)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    if (search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,sku.ilike.%${search.trim()}%`)
    }
    if (filterCategory) {
      query = query.eq('category_id', filterCategory)
    }
    if (filterUnit) {
      query = query.eq('unit', filterUnit)
    }
    const { data, error } = await query
    if (error) {
      toast.error('Lỗi tải sản phẩm')
    } else {
      setProducts(data || [])
    }
    setIsLoading(false)
  }, [search, filterCategory, filterUnit])

  useEffect(() => { loadCategories(); loadUnits() }, [loadCategories, loadUnits])
  useEffect(() => { loadProducts() }, [loadProducts])

  const openCreate = () => {
    setEditingProduct(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const autoGenerateSKU = () => {
    if (!form.name.trim()) {
      toast.error('Nhập tên sản phẩm trước để tạo SKU')
      return
    }
    setForm((prev) => ({ ...prev, sku: generateSKU(prev.name) }))
  }

  const openEdit = (product: Product) => {
    setEditingProduct(product)
    setForm({
      name: product.name,
      sku: product.sku || '',
      unit: product.unit,
      category_id: product.category_id || '',
      tolerance_type: product.tolerance_type || 'FIXED',
      tolerance_value: product.tolerance_value || 0,
    })
    setDialogOpen(true)
  }

  const openDelete = (product: Product) => {
    setDeletingProduct(product)
    setDeleteDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Tên sản phẩm không được để trống')
      return
    }
    setSaving(true)
    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update({
            name: form.name.trim(),
            sku: form.sku.trim() || null,
            unit: form.unit.trim(),
            category_id: form.category_id || null,
            tolerance_type: form.tolerance_type,
            tolerance_value: form.tolerance_value,
          })
          .eq('id', editingProduct.id)
        if (error) throw error
        toast.success('Cập nhật sản phẩm thành công')
      } else {
        const { data: warehouses } = await supabase.from('warehouses').select('id').limit(1)
        const warehouseId = warehouses?.[0]?.id
        if (!warehouseId) {
          toast.error('Chưa có kho. Vui lòng tạo kho trước.')
          return
        }
        const { error } = await supabase.from('products').insert({
          name: form.name.trim(),
          sku: form.sku.trim() || null,
          unit: form.unit.trim(),
          category_id: form.category_id || null,
          warehouse_id: warehouseId,
          tolerance_type: form.tolerance_type,
          tolerance_value: form.tolerance_value,
        })
        if (error) throw error
        toast.success('Tạo sản phẩm thành công')
      }
      setDialogOpen(false)
      loadProducts()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      toast.error(`Lỗi: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingProduct) return
    try {
      const { error } = await supabase.from('products').delete().eq('id', deletingProduct.id)
      if (error) throw error
      toast.success('Xóa sản phẩm thành công')
      setDeleteDialogOpen(false)
      loadProducts()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      toast.error(`Lỗi: ${message}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sản phẩm</h1>
          <p className="text-sm text-muted-foreground">Quản lý danh sách sản phẩm</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Thêm sản phẩm
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên hoặc SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterCategory || 'all'} onValueChange={(v) => setFilterCategory(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Tất cả danh mục" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả danh mục</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterUnit || 'all'} onValueChange={(v) => setFilterUnit(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Tất cả đơn vị" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả đơn vị</SelectItem>
                {availableUnits.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(filterCategory || filterUnit) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterCategory(''); setFilterUnit('') }}>
                Xóa lọc
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có sản phẩm</h3>
              <p className="text-sm text-muted-foreground mt-1">Nhấn &quot;Thêm sản phẩm&quot; để bắt đầu.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Tên sản phẩm</TableHead>
                  <TableHead>Danh mục</TableHead>
                  <TableHead>Đơn vị</TableHead>
                  <TableHead>Sai số cho phép</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.sku || '-'}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      {p.product_categories?.name ? (
                        <Badge variant="outline">{p.product_categories.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{p.unit}</Badge></TableCell>
                    <TableCell>
                      {p.tolerance_value > 0 ? (
                        <Badge variant="outline">
                          {p.tolerance_type === 'PERCENT'
                            ? `${p.tolerance_value}%`
                            : `${p.tolerance_value} ${p.unit}`}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Không</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDelete(p)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</DialogTitle>
            <DialogDescription>
              {editingProduct ? 'Cập nhật thông tin sản phẩm' : 'Nhập thông tin sản phẩm mới'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Tên sản phẩm *</Label>
              <Input id="name" value={form.name} onChange={(e) => {
                const newName = e.target.value
                setForm((prev) => {
                  const updated = { ...prev, name: newName }
                  // Tự tạo SKU khi thêm mới và SKU đang trống hoặc là auto-generated
                  if (!editingProduct && newName.trim()) {
                    updated.sku = generateSKU(newName)
                  }
                  return updated
                })
              }} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sku">SKU</Label>
                <div className="flex gap-1">
                  <Input id="sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                  <Button type="button" variant="outline" size="icon" onClick={autoGenerateSKU} title="Tự tạo SKU">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unit">Đơn vị *</Label>
                <Input id="unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Danh mục</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v === 'none' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn danh mục" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không có danh mục</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Sai số cho phép (Tolerance)</Label>
              <p className="text-xs text-muted-foreground">Cho phép xuất vượt tồn kho trong mức sai số nhỏ (ví dụ: sai số cân)</p>
              <div className="grid grid-cols-2 gap-4">
                <Select value={form.tolerance_type} onValueChange={(v) => setForm({ ...form, tolerance_type: v as 'FIXED' | 'PERCENT' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Cố định ({form.unit})</SelectItem>
                    <SelectItem value="PERCENT">Phần trăm (%)</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step={form.tolerance_type === 'PERCENT' ? 0.1 : 0.01}
                  value={form.tolerance_value}
                  onChange={(e) => setForm({ ...form, tolerance_value: Number(e.target.value) })}
                  placeholder={form.tolerance_type === 'PERCENT' ? 'VD: 0.5' : 'VD: 0.1'}
                />
              </div>
              {form.tolerance_value > 0 && (
                <p className="text-xs text-muted-foreground">
                  → Khi tồn kho còn 10 {form.unit}, cho phép xuất tối đa{' '}
                  <span className="font-medium">
                    {form.tolerance_type === 'PERCENT'
                      ? `${(10 + 10 * form.tolerance_value / 100).toFixed(2)} ${form.unit} (+${form.tolerance_value}%)`
                      : `${(10 + form.tolerance_value).toFixed(2)} ${form.unit} (+${form.tolerance_value})`}
                  </span>
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : editingProduct ? 'Cập nhật' : 'Tạo mới'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa sản phẩm &quot;{deletingProduct?.name}&quot;? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

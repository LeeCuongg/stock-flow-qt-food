'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Plus, Pencil, Trash2, Search, Package } from 'lucide-react'
import { toast } from 'sonner'

interface Product {
  id: string
  name: string
  sku: string | null
  unit: string
  category: string | null
  price: number
  default_cost_price: number
  default_sale_price: number
  warehouse_id: string
  created_at: string
}

const emptyForm = {
  name: '',
  sku: '',
  unit: 'kg',
  default_cost_price: 0,
  default_sale_price: 0,
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const loadProducts = useCallback(async () => {
    setIsLoading(true)
    let query = supabase.from('products').select('*').order('created_at', { ascending: false })
    if (search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,sku.ilike.%${search.trim()}%`)
    }
    const { data, error } = await query
    if (error) {
      toast.error('Lỗi tải sản phẩm')
    } else {
      setProducts(data || [])
    }
    setIsLoading(false)
  }, [search])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  const openCreate = () => {
    setEditingProduct(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (product: Product) => {
    setEditingProduct(product)
    setForm({
      name: product.name,
      sku: product.sku || '',
      unit: product.unit,
      default_cost_price: product.default_cost_price || 0,
      default_sale_price: product.default_sale_price || 0,
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
            default_cost_price: form.default_cost_price,
            default_sale_price: form.default_sale_price,
            price: form.default_sale_price,
          })
          .eq('id', editingProduct.id)
        if (error) throw error
        toast.success('Cập nhật sản phẩm thành công')
      } else {
        // Get first warehouse
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
          default_cost_price: form.default_cost_price,
          default_sale_price: form.default_sale_price,
          price: form.default_sale_price,
          warehouse_id: warehouseId,
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
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên hoặc SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
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
                  <TableHead>Đơn vị</TableHead>
                  <TableHead className="text-right">Giá nhập</TableHead>
                  <TableHead className="text-right">Giá bán</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.sku || '-'}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><Badge variant="secondary">{p.unit}</Badge></TableCell>
                    <TableCell className="text-right">
                      {Number(p.default_cost_price || 0).toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(p.default_sale_price || 0).toLocaleString('vi-VN')}
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
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unit">Đơn vị *</Label>
                <Input id="unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cost">Giá nhập mặc định</Label>
                <Input id="cost" type="number" min={0} value={form.default_cost_price}
                  onChange={(e) => setForm({ ...form, default_cost_price: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sale">Giá bán mặc định</Label>
                <Input id="sale" type="number" min={0} value={form.default_sale_price}
                  onChange={(e) => setForm({ ...form, default_sale_price: Number(e.target.value) })} />
              </div>
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
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Pencil, Trash2, Search, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { formatVNDate } from '@/lib/utils'

interface Category {
  id: string
  warehouse_id: string
  name: string
  description: string | null
  created_at: string
}

const emptyForm = { name: '', description: '' }

export default function CategoriesPage() {
  const [items, setItems] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const load = useCallback(async () => {
    setIsLoading(true)
    let q = supabase.from('product_categories').select('*').order('name', { ascending: true })
    if (search.trim()) q = q.ilike('name', `%${search.trim()}%`)
    const { data, error } = await q
    if (error) toast.error('Lỗi tải danh mục')
    else setItems(data || [])
    setIsLoading(false)
  }, [search])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true) }

  const openEdit = (item: Category) => {
    setEditing(item)
    setForm({ name: item.name, description: item.description || '' })
    setDialogOpen(true)
  }

  const openDelete = (item: Category) => { setDeleting(item); setDeleteOpen(true) }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Tên danh mục không được để trống'); return }
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase
          .from('product_categories')
          .update({ name: form.name.trim(), description: form.description.trim() || null })
          .eq('id', editing.id)
        if (error) throw error
        toast.success('Cập nhật danh mục thành công')
      } else {
        const { data: wh } = await supabase.from('warehouses').select('id').limit(1)
        const warehouseId = wh?.[0]?.id
        if (!warehouseId) { toast.error('Chưa có kho. Vui lòng tạo kho trước.'); return }
        const { error } = await supabase.from('product_categories').insert({
          name: form.name.trim(),
          description: form.description.trim() || null,
          warehouse_id: warehouseId,
        })
        if (error) {
          if (error.code === '23505') { toast.error('Danh mục này đã tồn tại'); return }
          throw error
        }
        toast.success('Tạo danh mục thành công')
      }
      setDialogOpen(false)
      load()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      toast.error(`Lỗi: ${message}`)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const { error } = await supabase.from('product_categories').delete().eq('id', deleting.id)
      if (error) throw error
      toast.success('Xóa danh mục thành công')
      setDeleteOpen(false)
      load()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định'
      toast.error(`Lỗi: ${message}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Danh mục sản phẩm</h1>
          <p className="text-sm text-muted-foreground">Quản lý danh mục phân loại sản phẩm</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Thêm danh mục
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên danh mục..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Tags className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có danh mục</h3>
              <p className="text-sm text-muted-foreground mt-1">Nhấn &quot;Thêm danh mục&quot; để bắt đầu.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên danh mục</TableHead>
                  <TableHead>Mô tả</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.description || '-'}</TableCell>
                    <TableCell className="text-sm">{formatVNDate(c.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDelete(c)}>
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
            <DialogTitle>{editing ? 'Sửa danh mục' : 'Thêm danh mục'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Cập nhật thông tin danh mục' : 'Nhập thông tin danh mục mới'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cat-name">Tên danh mục *</Label>
              <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-desc">Mô tả</Label>
              <Textarea id="cat-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Tạo mới'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa danh mục &quot;{deleting?.name}&quot;? Các sản phẩm thuộc danh mục này sẽ không bị xóa nhưng sẽ mất liên kết danh mục.
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

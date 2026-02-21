'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, Warehouse, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { formatQty } from '@/lib/utils'

interface InventoryBatch {
  id: string
  product_id: string
  warehouse_id: string
  batch_code: string | null
  quantity: number
  quantity_remaining: number
  expiry_date: string | null
  manufactured_date: string | null
  created_at: string
  products: { name: string; unit: string; sku: string | null } | null
}

export default function InventoryPage() {
  const [batches, setBatches] = useState<InventoryBatch[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  const loadBatches = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('inventory_batches')
      .select('*, products(name, unit, sku)')
      .order('expiry_date', { ascending: true, nullsFirst: false })
    if (error) {
      toast.error('Lỗi tải tồn kho')
    } else {
      setBatches(data || [])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadBatches()
  }, [loadBatches])

  const filtered = batches.filter((b) => {
    if (!search.trim()) return true
    const s = search.toLowerCase()
    const productName = b.products?.name?.toLowerCase() || ''
    const batchCode = b.batch_code?.toLowerCase() || ''
    const sku = b.products?.sku?.toLowerCase() || ''
    return productName.includes(s) || batchCode.includes(s) || sku.includes(s)
  })

  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return 'none'
    const now = new Date()
    const expiry = new Date(expiryDate)
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return 'expired'
    if (diffDays <= 7) return 'critical'
    if (diffDays <= 30) return 'warning'
    return 'ok'
  }

  const expiryBadge = (status: string) => {
    switch (status) {
      case 'expired':
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Hết hạn</Badge>
      case 'critical':
        return <Badge variant="destructive" className="gap-1">Sắp hết hạn</Badge>
      case 'warning':
        return <Badge className="gap-1 bg-yellow-500 text-white hover:bg-yellow-600">Gần hạn</Badge>
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tồn kho</h1>
        <p className="text-sm text-muted-foreground">Danh sách lô hàng tồn kho theo hạn sử dụng</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên sản phẩm, mã lô, SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Warehouse className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có lô hàng</h3>
              <p className="text-sm text-muted-foreground mt-1">Tạo phiếu nhập kho để thêm lô hàng.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã lô</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Tồn kho</TableHead>
                  <TableHead>Ngày SX</TableHead>
                  <TableHead>Hạn sử dụng</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((batch) => {
                  const product = batch.products
                  const status = getExpiryStatus(batch.expiry_date)
                  return (
                    <TableRow
                      key={batch.id}
                      className={
                        status === 'expired' ? 'bg-destructive/5' :
                        status === 'critical' ? 'bg-destructive/5' :
                        status === 'warning' ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''
                      }
                    >
                      <TableCell className="font-mono text-xs">{batch.batch_code || '-'}</TableCell>
                      <TableCell className="font-medium">{product?.name || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{product?.sku || '-'}</TableCell>
                      <TableCell className="text-right">
                        {formatQty(batch.quantity_remaining || batch.quantity)}{' '}
                        <Badge variant="secondary" className="ml-1">{product?.unit || '-'}</Badge>
                      </TableCell>
                      <TableCell>
                        {batch.manufactured_date
                          ? new Date(batch.manufactured_date).toLocaleDateString('vi-VN')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {batch.expiry_date
                          ? new Date(batch.expiry_date).toLocaleDateString('vi-VN')
                          : '-'}
                      </TableCell>
                      <TableCell>{expiryBadge(status)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

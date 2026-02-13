import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'

export default async function InventoryPage() {
  const supabase = await createClient()
  const { data: batches } = await supabase
    .from('inventory_batches')
    .select('*, products(name, unit, sku)')
    .order('created_at', { ascending: false })

  return (
    <DashboardLayout title="Ton kho">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Danh sach lo hang ton kho</CardTitle>
          </CardHeader>
          <CardContent>
            {batches && batches.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ma lo</TableHead>
                    <TableHead>San pham</TableHead>
                    <TableHead>So luong</TableHead>
                    <TableHead>Ngay san xuat</TableHead>
                    <TableHead>Han su dung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => {
                    const product = batch.products as { name: string; unit: string; sku: string } | null
                    return (
                      <TableRow key={batch.id}>
                        <TableCell className="font-mono text-xs">
                          {batch.batch_code || '-'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {product?.name || '-'}
                        </TableCell>
                        <TableCell>
                          {Number(batch.quantity).toLocaleString('vi-VN')}{' '}
                          <Badge variant="secondary" className="ml-1">
                            {product?.unit || '-'}
                          </Badge>
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
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Chua co lo hang nao.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

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

export default async function ProductsPage() {
  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <DashboardLayout title="San pham">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Danh sach san pham</CardTitle>
          </CardHeader>
          <CardContent>
            {products && products.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Ten san pham</TableHead>
                    <TableHead>Don vi</TableHead>
                    <TableHead>Danh muc</TableHead>
                    <TableHead className="text-right">Gia (VND)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-mono text-xs">
                        {product.sku || '-'}
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{product.unit}</Badge>
                      </TableCell>
                      <TableCell>{product.category || '-'}</TableCell>
                      <TableCell className="text-right">
                        {Number(product.price).toLocaleString('vi-VN')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Chua co san pham nao.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

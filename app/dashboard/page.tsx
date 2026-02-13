import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { Package, PackagePlus, ShoppingCart, AlertTriangle } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: productCount },
    { count: batchCount },
    { count: stockInCount },
    { count: salesCount },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('inventory_batches').select('*', { count: 'exact', head: true }),
    supabase.from('stock_in').select('*', { count: 'exact', head: true }),
    supabase.from('sales').select('*', { count: 'exact', head: true }),
  ])

  const stats = [
    {
      title: 'San pham',
      value: productCount ?? 0,
      icon: Package,
      description: 'Tong so san pham trong he thong',
    },
    {
      title: 'Lo hang',
      value: batchCount ?? 0,
      icon: PackagePlus,
      description: 'Tong so lo hang ton kho',
    },
    {
      title: 'Phieu nhap',
      value: stockInCount ?? 0,
      icon: PackagePlus,
      description: 'Tong so phieu nhap kho',
    },
    {
      title: 'Don ban',
      value: salesCount ?? 0,
      icon: ShoppingCart,
      description: 'Tong so don ban hang',
    },
  ]

  return (
    <DashboardLayout title="Tong quan">
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Hoat dong gan day</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Chua co hoat dong nao. Bat dau bang cach nhap kho hoac tao don ban hang.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

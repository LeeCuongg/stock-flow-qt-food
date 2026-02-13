import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart } from 'lucide-react'

export default function SalesPage() {
  return (
    <DashboardLayout title="Bán hàng">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Đơn bán hàng</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có đơn bán</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Chức năng bán hàng sẽ được xây dựng ở Phase 2.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

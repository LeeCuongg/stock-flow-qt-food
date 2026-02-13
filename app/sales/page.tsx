import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart } from 'lucide-react'

export default function SalesPage() {
  return (
    <DashboardLayout title="Ban hang">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Don ban hang</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chua co don ban</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Chuc nang ban hang se duoc xay dung o Phase 2.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

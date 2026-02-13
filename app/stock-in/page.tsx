import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PackagePlus } from 'lucide-react'

export default function StockInPage() {
  return (
    <DashboardLayout title="Nhap kho">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Phieu nhap kho</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <PackagePlus className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chua co phieu nhap</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Chuc nang nhap kho se duoc xay dung o Phase 2.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

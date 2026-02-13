import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

export default function LossPage() {
  return (
    <DashboardLayout title="Hao hut">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Ghi nhan hao hut / mat mat</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chua co ghi nhan</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Chuc nang ghi nhan hao hut se duoc xay dung o Phase 2.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

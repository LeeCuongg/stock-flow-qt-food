import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

export default function LossPage() {
  return (
    <DashboardLayout title="Hao hụt">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Ghi nhận hao hụt / mất mát</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Chưa có ghi nhận</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Chức năng ghi nhận hao hụt sẽ được xây dựng ở Phase 2.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

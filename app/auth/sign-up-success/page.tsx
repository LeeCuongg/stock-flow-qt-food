import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Package } from 'lucide-react'

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-primary">
              <Package className="h-8 w-8" />
              <span className="text-2xl font-bold tracking-tight font-sans">StockFlowQT</span>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Dang ky thanh cong!</CardTitle>
              <CardDescription>Kiem tra email de xac nhan</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Ban da dang ky thanh cong. Vui long kiem tra email de xac nhan tai khoan truoc khi dang nhap.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

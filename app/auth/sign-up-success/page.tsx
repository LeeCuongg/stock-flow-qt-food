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
              <CardTitle className="text-2xl">Đăng ký thành công!</CardTitle>
              <CardDescription>Kiểm tra email để xác nhận</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Bạn đã đăng ký thành công. Vui lòng kiểm tra email để xác nhận tài khoản trước khi đăng nhập.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

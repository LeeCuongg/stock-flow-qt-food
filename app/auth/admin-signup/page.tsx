'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Package, ShieldCheck } from 'lucide-react'

export default function AdminSignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [adminCode, setAdminCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    // Kiểm tra mã admin (thay đổi mã này theo ý bạn)
    const ADMIN_SECRET_CODE = process.env.NEXT_PUBLIC_ADMIN_SIGNUP_CODE || 'ADMIN2025'
    
    if (adminCode !== ADMIN_SECRET_CODE) {
      setError('Mã admin không đúng')
      setIsLoading(false)
      return
    }

    if (password !== repeatPassword) {
      setError('Mật khẩu không khớp')
      setIsLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
            `${window.location.origin}/dashboard`,
          data: {
            full_name: fullName,
            role: 'admin',
          },
        },
      })
      if (error) throw error
      router.push('/auth/sign-up-success')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Đăng ký thất bại')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-primary">
              <Package className="h-8 w-8" />
              <span className="text-2xl font-bold tracking-tight font-sans">StockFlowQT</span>
            </div>
            <div className="flex items-center gap-2 text-orange-600">
              <ShieldCheck className="h-5 w-5" />
              <p className="text-sm font-semibold">Đăng ký tài khoản Admin</p>
            </div>
          </div>
          <Card className="border-orange-200">
            <CardHeader>
              <CardTitle className="text-2xl">Tạo tài khoản Admin</CardTitle>
              <CardDescription>Yêu cầu mã bảo mật để tạo tài khoản quản trị viên</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignUp}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="adminCode" className="text-orange-700">
                      Mã Admin <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="adminCode"
                      type="password"
                      placeholder="Nhập mã bảo mật admin"
                      required
                      value={adminCode}
                      onChange={(e) => setAdminCode(e.target.value)}
                      className="border-orange-200"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="fullName">Họ và tên</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Nguyễn Văn A"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Mật khẩu</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="repeat-password">Nhập lại mật khẩu</Label>
                    <Input
                      id="repeat-password"
                      type="password"
                      required
                      value={repeatPassword}
                      onChange={(e) => setRepeatPassword(e.target.value)}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700" disabled={isLoading}>
                    {isLoading ? 'Đang xử lý...' : 'Tạo tài khoản Admin'}
                  </Button>
                </div>
                <div className="mt-4 text-center text-sm">
                  <Link
                    href="/auth/login"
                    className="underline underline-offset-4 text-primary"
                  >
                    Quay lại đăng nhập
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

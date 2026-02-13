import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  if (user) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    profile = data
  }

  return (
    <DashboardLayout title="Cài đặt">
      <div className="flex flex-col gap-4 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin tài khoản</CardTitle>
            <CardDescription>Thông tin cá nhân và vai trò của bạn</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm font-medium">{user?.email || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Họ và tên</span>
                <span className="text-sm font-medium">{profile?.full_name || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Vai trò</span>
                <Badge variant={profile?.role === 'admin' ? 'default' : 'secondary'}>
                  {profile?.role || 'staff'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Kho</span>
                <span className="text-sm font-medium">
                  {profile?.warehouse_id ? 'Đã gán kho' : 'Chưa gán kho'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Hệ thống</CardTitle>
            <CardDescription>Thông tin phiên bản và cấu hình</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Phiên bản</span>
                <span className="text-sm font-medium">Phase 1 - v0.1.0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Database</span>
                <Badge variant="secondary">Supabase</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

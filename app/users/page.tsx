'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Shield, User } from 'lucide-react'

interface UserProfile {
  id: string
  full_name: string | null
  role: string
  created_at: string
  email?: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadUsers()
    checkCurrentUserRole()
  }, [])

  const checkCurrentUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      
      if (data) {
        setCurrentUserRole(data.role)
      }
    }
  }

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      // Lấy danh sách user profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (profilesError) throw profilesError

      // Lấy emails từ auth.users (chỉ admin mới có quyền)
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user && profiles) {
        // Thêm email vào profiles
        const usersWithEmail = await Promise.all(
          profiles.map(async (profile) => {
            // Chỉ có thể lấy email của chính mình hoặc nếu là admin
            if (profile.id === user.id) {
              const { data: authUser } = await supabase.auth.getUser()
              return { ...profile, email: authUser.user?.email }
            }
            return profile
          })
        )
        setUsers(usersWithEmail)
      }
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', userId)

      if (error) throw error

      // Reload users
      loadUsers()
    } catch (error) {
      console.error('Error updating role:', error)
      alert('Không thể cập nhật quyền. Bạn cần là admin.')
    }
  }

  if (currentUserRole !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Không có quyền truy cập</CardTitle>
            <CardDescription>
              Chỉ admin mới có thể xem trang này
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Quản lý người dùng</h1>
        <p className="text-muted-foreground">
          Xem và quản lý quyền của người dùng trong hệ thống
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách người dùng</CardTitle>
          <CardDescription>
            Tổng số: {users.length} người dùng
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Đang tải...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.full_name || 'Chưa có tên'}
                    </TableCell>
                    <TableCell>{user.email || '***'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={user.role === 'admin' ? 'default' : 'secondary'}
                        className="gap-1"
                      >
                        {user.role === 'admin' ? (
                          <Shield className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                        {user.role === 'admin' ? 'Admin' : 'Nhân viên'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString('vi-VN')}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(value) => updateUserRole(user.id, value)}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Nhân viên</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  ShoppingCart,
  AlertTriangle,
  Warehouse,
  Settings,
  LogOut,
  ChevronUp,
  User2,
  Users,
  UserCheck,
  Truck,
  CreditCard,
  Tags,
} from 'lucide-react'
import Link from 'next/link'

const navItems = [
  {
    title: 'Tổng quan',
    url: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Danh mục',
    url: '/categories',
    icon: Tags,
  },
  {
    title: 'Sản phẩm',
    url: '/products',
    icon: Package,
  },
  {
    title: 'Nhập kho',
    url: '/stock-in',
    icon: PackagePlus,
  },
  {
    title: 'Xuất kho',
    url: '/sales',
    icon: ShoppingCart,
  },
  {
    title: 'Hao hụt',
    url: '/loss',
    icon: AlertTriangle,
  },
  {
    title: 'Tồn kho',
    url: '/inventory',
    icon: Warehouse,
  },
  {
    title: 'Khách hàng',
    url: '/customers',
    icon: UserCheck,
  },
  {
    title: 'Nhà cung cấp',
    url: '/suppliers',
    icon: Truck,
  },
  {
    title: 'Thanh toán',
    url: '/payments',
    icon: CreditCard,
  },
]

const settingsItems = [
  {
    title: 'Người dùng',
    url: '/users',
    icon: Users,
    adminOnly: true,
  },
  {
    title: 'Cài đặt',
    url: '/settings',
    icon: Settings,
  },
]

interface AppSidebarProps {
  userEmail?: string
  userFullName?: string
  userRole?: string
}

export function AppSidebar({ userEmail, userFullName, userRole }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // Lọc menu items dựa trên role
  const filteredSettingsItems = settingsItems.filter(
    (item) => !item.adminOnly || userRole === 'admin'
  )

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Package className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight font-sans">StockFlowQT</span>
            <span className="text-[11px] text-muted-foreground leading-none">Quản lý kho thực phẩm</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Quản lý</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Hệ thống</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredSettingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <User2 className="h-4 w-4" />
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium truncate max-w-[140px]">
                      {userFullName || 'Người dùng'}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                      {userEmail}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="w-[--radix-popper-anchor-width]"
              >
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Đăng xuất</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

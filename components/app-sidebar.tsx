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
} from 'lucide-react'
import Link from 'next/link'

const navItems = [
  {
    title: 'Tong quan',
    url: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'San pham',
    url: '/products',
    icon: Package,
  },
  {
    title: 'Nhap kho',
    url: '/stock-in',
    icon: PackagePlus,
  },
  {
    title: 'Ban hang',
    url: '/sales',
    icon: ShoppingCart,
  },
  {
    title: 'Hao hut',
    url: '/loss',
    icon: AlertTriangle,
  },
  {
    title: 'Ton kho',
    url: '/inventory',
    icon: Warehouse,
  },
]

const settingsItems = [
  {
    title: 'Cai dat',
    url: '/settings',
    icon: Settings,
  },
]

interface AppSidebarProps {
  userEmail?: string
  userFullName?: string
}

export function AppSidebar({ userEmail, userFullName }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Package className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight font-sans">StockFlowQT</span>
            <span className="text-[11px] text-muted-foreground leading-none">Quan ly kho thuc pham</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Quan ly</SidebarGroupLabel>
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
          <SidebarGroupLabel>He thong</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
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
                      {userFullName || 'Nguoi dung'}
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
                  <span>Dang xuat</span>
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

import { DashboardLayout } from '@/components/dashboard-layout'

export default function CategoriesLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Danh mục sản phẩm">{children}</DashboardLayout>
}

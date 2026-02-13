import { DashboardLayout } from '@/components/dashboard-layout'

export default function SuppliersLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Nhà cung cấp">{children}</DashboardLayout>
}

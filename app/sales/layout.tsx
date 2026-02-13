import { DashboardLayout } from '@/components/dashboard-layout'

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Bán hàng">{children}</DashboardLayout>
}

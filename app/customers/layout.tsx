import { DashboardLayout } from '@/components/dashboard-layout'

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Khách hàng">{children}</DashboardLayout>
}

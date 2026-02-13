import { DashboardLayout } from '@/components/dashboard-layout'

export default function StockInLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Nhập kho">{children}</DashboardLayout>
}

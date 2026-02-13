import { DashboardLayout } from '@/components/dashboard-layout'

export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Thanh toán">{children}</DashboardLayout>
}

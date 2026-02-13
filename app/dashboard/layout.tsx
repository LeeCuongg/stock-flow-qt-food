import { DashboardLayout } from '@/components/dashboard-layout'

export default function DashboardPageLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Tổng quan">{children}</DashboardLayout>
}

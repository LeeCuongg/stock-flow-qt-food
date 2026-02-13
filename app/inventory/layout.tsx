import { DashboardLayout } from '@/components/dashboard-layout'

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Tồn kho">{children}</DashboardLayout>
}

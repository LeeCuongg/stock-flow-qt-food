import { DashboardLayout } from '@/components/dashboard-layout'

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Chi phí vận hành">{children}</DashboardLayout>
}

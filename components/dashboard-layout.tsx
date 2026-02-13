import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/server'

export async function DashboardLayout({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let fullName = user?.email || 'Nguoi dung'
  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
    if (profile?.full_name) {
      fullName = profile.full_name
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar userEmail={user?.email} userFullName={fullName} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          {title && (
            <h1 className="text-sm font-semibold">{title}</h1>
          )}
        </header>
        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

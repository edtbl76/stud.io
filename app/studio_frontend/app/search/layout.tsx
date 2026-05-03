import { SidebarShell } from '@/components/layout/SidebarShell'

export default function SearchLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <SidebarShell subtitle="Search Results">{null}</SidebarShell>
      <main className="flex-1 ml-56 overflow-auto bg-background">{children}</main>
    </div>
  )
}

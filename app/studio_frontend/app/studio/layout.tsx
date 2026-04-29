import { UsersSidebar } from '@/components/layout/UsersSidebar'

export default function StudioLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <UsersSidebar />
      <main className="flex-1 ml-56 overflow-auto bg-background">{children}</main>
    </div>
  )
}

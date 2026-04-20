import { UsersSidebar } from '@/components/layout/UsersSidebar'

export default function UsersLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-screen">
      <UsersSidebar />
      <main className="flex-1 ml-56 overflow-auto bg-background">{children}</main>
    </div>
  )
}

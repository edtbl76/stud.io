import { Sidebar } from '@/components/layout/Sidebar'

export default function SearchLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <Sidebar />
      <main className="flex-1 ml-56 overflow-auto bg-background">{children}</main>
    </div>
  )
}

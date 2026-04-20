import { Sidebar } from '@/components/layout/Sidebar'

export default function ControlRoomLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 overflow-auto bg-background">{children}</main>
    </div>
  )
}

import { GearListSidebar } from '@/components/layout/GearListSidebar'

export default function GearListLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <GearListSidebar />
      <main className="flex-1 ml-56 overflow-auto bg-background">{children}</main>
    </div>
  )
}

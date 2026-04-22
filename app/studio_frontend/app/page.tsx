import Link from 'next/link'
import { StudioIllustration } from '@/components/StudioIllustration'
import { SlidersHorizontal, Users } from 'lucide-react'

const modules = [
  {
    href: '/controlroom/catalog/brands',
    icon: SlidersHorizontal,
    title: 'ControlRoom',
    description: 'Manage sessions, libraries, and tools.',
  },
  {
    href: '/studio/admin/users',
    icon: Users,
    title: 'Studio Management',
    description: 'Manage gear catalog, config, users, and administration.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl">
        <div className="mb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase">
          STUD.io
        </div>
        <h1 className="text-3xl font-semibold text-foreground mb-2">Welcome back.</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Your local studio management platform. Where do you want to go?
        </p>

        <div className="grid grid-cols-2 gap-4 mb-12">
          {modules.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-foreground">{title}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            </Link>
          ))}
        </div>

        <StudioIllustration className="w-full rounded-xl opacity-80" />
      </div>
    </div>
  )
}

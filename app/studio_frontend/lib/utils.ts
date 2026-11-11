import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSlug(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Built once: toLocaleDateString(locale, options) constructs a new Intl.DateTimeFormat on every call, and formatDate
// runs for every date cell in every table. Under Lighthouse's 4x CPU throttle that was the top self-time function on
// the TablePage pages (2026-11-10, Next 16.4.1). Same locale and options, so the output is identical.
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  // Intl format() throws on an invalid date; toLocaleDateString returned 'Invalid Date'. Keep that.
  return Number.isNaN(date.getTime()) ? 'Invalid Date' : SHORT_DATE.format(date)
}

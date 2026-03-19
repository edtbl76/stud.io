'use client'

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Check, ChevronDown, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { LookupOut } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface MultiSelectProps {
  configSlug: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  singleSelect?: boolean
  hideBadges?: boolean
}

export function MultiSelect({
  configSlug,
  value,
  onChange,
  placeholder = 'Select...',
  singleSelect = false,
  hideBadges = false,
}: Readonly<MultiSelectProps>) {
  const [open, setOpen] = React.useState(false)

  const { data: options = [], isLoading } = useQuery({
    queryKey: ['config', configSlug],
    queryFn: () => api.list<LookupOut>(`/config/${configSlug}`),
    staleTime: 60_000,
  })

  const selectedOptions = options.filter(opt => value.includes(opt.type_id))

  function toggle(id: string) {
    if (singleSelect) {
      onChange(value.includes(id) ? [] : [id])
      setOpen(false)
      return
    }
    if (value.includes(id)) {
      onChange(value.filter(v => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  function removeTag(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    onChange(value.filter(v => v !== id))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-9 w-full items-center justify-between rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground',
              'hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <span className={value.length === 0 ? 'text-muted-foreground' : ''}>
              {(() => {
                if (isLoading) return 'Loading...'
                if (value.length === 0) return placeholder
                return `${value.length} selected`
              })()}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            className={cn(
              'z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-border bg-card shadow-xl',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'max-h-60 overflow-y-auto'
            )}
            sideOffset={4}
            align="start"
          >
            {(() => {
              if (isLoading) return (
                <div className="p-3 text-sm text-muted-foreground">Loading options...</div>
              )
              if (options.length === 0) return (
                <div className="p-3 text-sm text-muted-foreground">No options available</div>
              )
              return (
              <div className="p-1">
                {options.map(opt => {
                  const isSelected = value.includes(opt.type_id)
                  return (
                    <button
                      key={opt.type_id}
                      type="button"
                      onClick={() => toggle(opt.type_id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left',
                        'hover:bg-muted transition-colors',
                        isSelected && 'text-primary'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border border-border flex-shrink-0',
                          isSelected && 'bg-primary border-primary'
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      {opt.type_name}
                    </button>
                  )
                })}
              </div>
              )
            })()}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      {!hideBadges && selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map(opt => (
            <Badge key={opt.type_id} variant="secondary" className="gap-1 pr-1">
              {opt.type_name}
              {!singleSelect && (
                <button
                  type="button"
                  onClick={(e) => removeTag(opt.type_id, e)}
                  className="rounded hover:bg-border ml-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

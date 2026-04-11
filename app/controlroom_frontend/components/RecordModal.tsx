'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { RecordNavigationValue } from '@/lib/useRecordNavigation'

// Context for injecting a leading footer action (e.g. "Go to [Table]" from search).
// Consumed by RecordModal so callers don't need to thread it through every modal component.
export const RecordModalLeadingAction = React.createContext<React.ReactNode>(null)

// Context for ← → record navigation. Provided by TablePage / SearchContent.
// null means navigation is unavailable (e.g. creating a new record).
export const RecordModalNavigation = React.createContext<RecordNavigationValue | null>(null)

// Tag names of form controls where arrow keys should not trigger navigation.
const FORM_ELEMENT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

// Returns true when the keyboard event originated from a form control or editable
// element — arrow keys should not trigger record navigation in those contexts.
function isFocusedInFormElement(e: KeyboardEvent): boolean {
  const el = e.target instanceof Element ? e.target : document.activeElement
  if (!(el instanceof HTMLElement)) return false
  return FORM_ELEMENT_TAGS.has(el.tagName) || el.contentEditable === 'true'
}

// Renders the ← N of M → navigation strip inside the dialog header.
function RecordNavigationHeader() {
  const nav = React.useContext(RecordModalNavigation)
  if (!nav) return null
  return (
    <div className="flex items-center gap-1 ml-auto">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={nav.onPrev}
        disabled={!nav.hasPrev}
        aria-label="Previous record"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-xs text-muted-foreground tabular-nums">
        {nav.index + 1} of {nav.total}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={nav.onNext}
        disabled={!nav.hasNext}
        aria-label="Next record"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

interface RecordModalProps {
  title: string
  isEditing: boolean
  isAdmin: boolean
  onEdit: () => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
  onHistory?: () => void
  isHistory?: boolean
  isSaving?: boolean
  isDeleting?: boolean
  children: React.ReactNode
}

export function RecordModal({
  title,
  isEditing,
  isAdmin,
  onEdit,
  onSave,
  onDelete,
  onClose,
  onHistory,
  isHistory = false,
  isSaving = false,
  isDeleting = false,
  children,
}: Readonly<RecordModalProps>) {
  const leadingAction = React.useContext(RecordModalLeadingAction)
  const nav = React.useContext(RecordModalNavigation)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  // Arrow-key navigation — blocked while editing or when focus is inside a
  // form element / contentEditable area to avoid clobbering user input.
  React.useEffect(() => {
    if (isEditing) return
    function handleKey(e: KeyboardEvent) {
      if (isFocusedInFormElement(e)) return
      if (e.key === 'ArrowLeft') nav?.onPrev()
      else if (e.key === 'ArrowRight') nav?.onNext()
    }
    globalThis.addEventListener('keydown', handleKey)
    return () => globalThis.removeEventListener('keydown', handleKey)
  }, [isEditing, nav])

  function handleDelete() {
    if (confirmDelete) {
      onDelete()
    } else {
      setConfirmDelete(true)
    }
  }

  function handleCancelDelete() {
    setConfirmDelete(false)
  }

  // Reset confirm state when editing mode or history mode changes
  React.useEffect(() => {
    setConfirmDelete(false)
  }, [isEditing, isHistory])

  function renderDeleteControls(disabled: boolean) {
    if (confirmDelete) {
      return (
        <div className="flex items-center gap-2 mr-auto">
          <span className="text-sm text-destructive">Are you sure?</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Deleting...
              </>
            ) : (
              'Confirm Delete'
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelDelete}
            disabled={isDeleting}
          >
            Cancel
          </Button>
        </div>
      )
    }
    return (
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={disabled}
        className="mr-auto"
      >
        Delete
      </Button>
    )
  }

  function renderFooter() {
    if (isEditing) {
      return (
        <>
          {renderDeleteControls(isSaving)}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSaving || isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={isSaving || isDeleting}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </>
      )
    }
    if (isHistory) {
      return (
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      )
    }
    return (
      <>
        {isAdmin && renderDeleteControls(false)}
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
        )}
        {onHistory && (
          <Button variant="outline" size="sm" onClick={onHistory}>
            History
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader className="flex flex-row items-center">
          <DialogTitle className="flex-1">{title}</DialogTitle>
          <RecordNavigationHeader />
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {children}
        </div>

        <DialogFooter>
          {leadingAction && <div className="mr-auto">{leadingAction}</div>}
          {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

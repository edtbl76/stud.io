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
import { Loader2 } from 'lucide-react'

// Context for injecting a leading footer action (e.g. "Go to [Table]" from search).
// Consumed by RecordModal so callers don't need to thread it through every modal component.
export const RecordModalLeadingAction = React.createContext<React.ReactNode>(null)

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
  const [confirmDelete, setConfirmDelete] = React.useState(false)

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
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
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

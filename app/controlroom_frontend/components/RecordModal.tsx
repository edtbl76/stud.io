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

interface RecordModalProps {
  title: string
  isEditing: boolean
  isAdmin: boolean
  onEdit: () => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
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
  isSaving = false,
  isDeleting = false,
  children,
}: Readonly<RecordModalProps>) {
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

  // Reset confirm state when editing mode changes
  React.useEffect(() => {
    setConfirmDelete(false)
  }, [isEditing])

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
          {isEditing ? (
            <>
              {confirmDelete ? (
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
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="mr-auto"
                >
                  Delete
                </Button>
              )}
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
          ) : (
            <>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  Edit
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

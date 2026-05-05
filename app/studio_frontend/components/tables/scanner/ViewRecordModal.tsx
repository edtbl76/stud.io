import type { MatchMeta } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ViewRecordModalProps {
  match: MatchMeta
  onClose: () => void
}

function Field({ label, value }: Readonly<{ label: string; value: string | null | undefined }>) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm text-foreground font-mono" data-testid={`view-record-field-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        {value ?? '—'}
      </p>
    </div>
  )
}

export function ViewRecordModal({ match, onClose }: Readonly<ViewRecordModalProps>) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="view-record-modal">
        <DialogHeader>
          <DialogTitle>Catalog Record</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Field label="Name" value={match.record_name} />
          <Field label="Vendor" value={match.record_vendor} />
          <Field label="Version" value={match.record_version} />
          <Field label="Table" value={match.record_table} />
          <Field label="Record ID" value={match.record_id} />

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-3 py-1.5 text-sm"
              data-testid="view-record-close-button"
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

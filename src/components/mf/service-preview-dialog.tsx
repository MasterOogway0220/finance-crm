'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ServicePreviewData {
  clientCode: string
  clientName: string
  employeeName: string
  description: string
}

interface ServicePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: ServicePreviewData | null
  onSubmit: () => void
  submitting: boolean
}

export function ServicePreviewDialog({ open, onOpenChange, data, onSubmit, submitting }: ServicePreviewDialogProps) {
  if (!data) return null

  const rows: [string, string][] = [
    ['Client Code', data.clientCode],
    ['Client Name', data.clientName],
    ['MF Employee', data.employeeName],
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Service Record Preview</DialogTitle>
        </DialogHeader>
        <div className="border rounded-lg overflow-hidden">
          {rows.map(([label, val], idx) => (
            <div key={label} className={`flex justify-between px-4 py-2.5 text-sm ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
              <span className="font-medium text-gray-600">{label}</span>
              <span className="text-gray-900 font-semibold">{val}</span>
            </div>
          ))}
          <div className={`px-4 py-2.5 text-sm ${rows.length % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
            <span className="font-medium text-gray-600">Description</span>
            <p className="text-gray-900 mt-1 whitespace-pre-wrap">{data.description}</p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

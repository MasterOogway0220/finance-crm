'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'

interface PreviewData {
  clientCode: string
  clientName: string
  employeeName: string
  referredByName: string | null
  productName: string
  subProduct: string | null
  investmentType: string
  sipAmount: number | null
  yearlyContribution: number
  commissionPercent: number
  commissionAmount: number
}

interface BusinessPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: PreviewData | null
  onSubmit: () => void
  submitting: boolean
}

export function BusinessPreviewDialog({ open, onOpenChange, data, onSubmit, submitting }: BusinessPreviewDialogProps) {
  if (!data) return null

  const rows: [string, string][] = [
    ['Client Code', data.clientCode],
    ['Client Name', data.clientName],
    ['MF Employee', data.employeeName],
    ['Referred By', data.referredByName || 'None (Own Business)'],
    ['Product', data.productName],
    ['Sub-Product', data.subProduct || '—'],
    ['Investment Type', data.investmentType],
    ...(data.investmentType === 'SIP' ? [['SIP Amount', formatCurrency(data.sipAmount ?? 0)] as [string, string]] : []),
    ['Yearly Contribution', formatCurrency(data.yearlyContribution)],
    ['Commission %', `${data.commissionPercent}%`],
    ['Commission Amount', formatCurrency(data.commissionAmount)],
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Business Record Preview</DialogTitle>
        </DialogHeader>
        <div className="border rounded-lg overflow-hidden">
          {rows.map(([label, val], idx) => (
            <div key={label} className={`flex justify-between px-4 py-2.5 text-sm ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
              <span className="font-medium text-gray-600">{label}</span>
              <span className="text-gray-900 font-semibold">{val}</span>
            </div>
          ))}
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

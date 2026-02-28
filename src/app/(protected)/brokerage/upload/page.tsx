'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadZone } from '@/components/brokerage/upload-zone'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CalendarIcon, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

interface UploadSummary {
  operatorSummary: Array<{ operatorName: string; clientCount: number; totalAmount: number }>
  totalClients: number
  totalAmount: number
  unmappedCodes: string[]
  duplicatesConsolidated: number
  dateExists: boolean
}

export default function BrokerageUploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [date, setDate] = useState<Date>(new Date())
  const [step, setStep] = useState<'upload' | 'preview' | 'success'>('upload')
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [processing, setProcessing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const handleProcessFile = async () => {
    if (!file || !date) return
    setProcessing(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('date', date.toISOString())
    formData.append('preview', 'true')
    try {
      const res = await fetch('/api/brokerage/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        setSummary(data.data)
        setStep('preview')
      } else {
        toast.error(data.error || 'Failed to process file')
      }
    } finally {
      setProcessing(false)
    }
  }

  const handleConfirmUpload = async () => {
    if (!file || !date) return
    setConfirming(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('date', date.toISOString())
    formData.append('preview', 'false')
    try {
      const res = await fetch('/api/brokerage/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        setStep('success')
        toast.success(`Brokerage for ${format(date, 'd MMM yyyy')} uploaded successfully`)
        setTimeout(() => router.push('/brokerage'), 2000)
      } else {
        toast.error(data.error || 'Upload failed')
      }
    } finally {
      setConfirming(false)
    }
  }

  if (step === 'success') {
    return (
      <div className="p-6 flex justify-center">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-10 pb-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800">Upload Successful!</h2>
            <p className="text-sm text-gray-500 mt-2">Redirecting to brokerage dashboard...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload Brokerage</h1>
        <p className="text-sm text-gray-500">Upload daily brokerage data from SNAP ERP</p>
      </div>

      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 1: Select File & Date</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Brokerage Date</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {format(date, 'd MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-gray-400 mt-1">Select the date for which brokerage is being uploaded</p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Brokerage File</p>
              <UploadZone onFile={setFile} />
            </div>

            <Button onClick={handleProcessFile} disabled={!file || processing} className="w-full" size="lg">
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Process File
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 2: Preview & Confirm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.dateExists && (
              <Alert className="border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 text-sm">
                  ⚠️ Brokerage for {format(date, 'd MMM yyyy')} already exists. Uploading will overwrite existing data.
                </AlertDescription>
              </Alert>
            )}

            {summary.unmappedCodes.length > 0 && (
              <Alert className="border-yellow-300 bg-yellow-50">
                <AlertDescription className="text-yellow-700 text-sm">
                  {summary.unmappedCodes.length} client codes not found in Client Master (skipped): {summary.unmappedCodes.slice(0, 5).join(', ')}{summary.unmappedCodes.length > 5 ? ` +${summary.unmappedCodes.length - 5} more` : ''}
                </AlertDescription>
              </Alert>
            )}

            {summary.duplicatesConsolidated > 0 && (
              <Alert className="border-blue-300 bg-blue-50">
                <AlertDescription className="text-blue-700 text-sm">
                  {summary.duplicatesConsolidated} duplicate entries consolidated (summed)
                </AlertDescription>
              </Alert>
            )}

            {/* Summary Table */}
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Operator</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-600">Clients</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-600">Total Brokerage</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.operatorSummary.map((row) => (
                    <tr key={row.operatorName} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-800">{row.operatorName}</td>
                      <td className="px-4 py-2 text-center text-gray-600">{row.clientCount}</td>
                      <td className="px-4 py-2 text-right text-gray-700 font-medium">{formatCurrency(row.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-bold bg-gray-50">
                    <td className="px-4 py-2">TOTAL</td>
                    <td className="px-4 py-2 text-center">{summary.totalClients}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(summary.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep('upload')} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleConfirmUpload} disabled={confirming} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                {confirming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Upload
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

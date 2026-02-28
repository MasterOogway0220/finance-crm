'use client'
import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, getDaysInMonth } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

interface BrokerageData {
  operatorPerformance: Array<{
    operatorId: string
    operatorName: string
    totalClients: number
    tradedClients: number
    notTraded: number
    tradedPercentage: number
    tradedAmountPercent: number
    didNotAnswer: number
    monthlyTotal: number
    dailyBreakdown: Record<number, number>
  }>
  brokerageChartData: Array<{ name: string; [key: string]: string | number }>
  brokerageMonths: string[]
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(0, i).toLocaleString('default', { month: 'long' }) }))
const YEARS = [2024, 2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) }))
const TH = 'px-3 py-2.5 text-white font-semibold text-center text-xs whitespace-nowrap'
const TD = 'px-3 py-2.5 text-center text-sm'

export default function BrokeragePage() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [data, setData] = useState<BrokerageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadLog, setUploadLog] = useState<Array<{ id: string; uploadDate: string; fileName: string; totalAmount: number; uploadedBy: string; createdAt: string }>>([])
  const [reverseTarget, setReverseTarget] = useState<string | null>(null)
  const [reversing, setReversing] = useState(false)

  const fetchData = () => {
    setLoading(true)
    fetch(`/api/brokerage?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }

  const fetchLog = () => {
    fetch(`/api/brokerage/log?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setUploadLog(d.data) })
  }

  useEffect(() => { fetchData(); fetchLog() }, [month, year])

  const handleReverse = async () => {
    if (!reverseTarget) return
    setReversing(true)
    const res = await fetch('/api/brokerage/reverse', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId: reverseTarget }),
    })
    const d = await res.json()
    if (d.success) {
      toast.success('Brokerage upload reversed')
      setReverseTarget(null)
      fetchData()
      fetchLog()
    } else {
      toast.error(d.error || 'Reversal failed')
    }
    setReversing(false)
  }

  const daysInMonth = getDaysInMonth(parseInt(year), parseInt(month))
  const currentDay = now.getMonth() + 1 === parseInt(month) && now.getFullYear() === parseInt(year) ? now.getDate() : daysInMonth
  const days = Array.from({ length: currentDay }, (_, i) => i + 1)

  const totalMonthly = data?.operatorPerformance.reduce((s, r) => s + r.monthlyTotal, 0) ?? 0

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brokerage Dashboard</h1>
          <p className="text-sm text-gray-500">Equity brokerage performance</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
          </Select>
          <Link href="/brokerage/upload">
            <Button className="gap-2 h-9">
              <Upload className="h-4 w-4" />Upload Brokerage
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
          <Skeleton className="h-48 rounded-lg" />
        </div>
      ) : data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-gray-500">Month Brokerage</p>
                <p className="text-lg font-bold text-green-700 mt-1">{formatCurrency(totalMonthly)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-gray-500">Operators</p>
                <p className="text-lg font-bold text-gray-800 mt-1">{data.operatorPerformance.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Operator Performance Summary (no day columns, always fits) ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Operator Performance</h2>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: '#2E7D32' }}>
                    <th className="px-3 py-2.5 text-left text-white font-semibold text-xs">Operator</th>
                    <th className={TH}>Clients</th>
                    <th className={TH}>Traded</th>
                    <th className={cn(TH, 'hidden sm:table-cell')}>Not Traded</th>
                    <th className={cn(TH, 'hidden sm:table-cell')}>Traded %</th>
                    <th className={TH}>Monthly (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.operatorPerformance.map((row, idx) => (
                    <tr key={row.operatorId} className={cn('border-b border-gray-100', idx % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                      <td className="px-3 py-2.5 font-semibold text-gray-800 text-sm">{row.operatorName}</td>
                      <td className={TD}>{row.totalClients}</td>
                      <td className={cn(TD, 'text-green-700 font-medium')}>{row.tradedClients}</td>
                      <td className={cn(TD, 'text-red-600 hidden sm:table-cell')}>{row.notTraded}</td>
                      <td className={cn(TD, 'hidden sm:table-cell')}>{row.tradedPercentage.toFixed(1)}%</td>
                      <td className={cn(TD, 'font-semibold')}>{formatCurrency(row.monthlyTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t-2 border-green-300" style={{ backgroundColor: '#e8f5e9' }}>
                    <td className="px-3 py-2.5 text-sm">TOTAL</td>
                    <td className={TD}>{data.operatorPerformance.reduce((s, r) => s + r.totalClients, 0)}</td>
                    <td className={cn(TD, 'text-green-800')}>{data.operatorPerformance.reduce((s, r) => s + r.tradedClients, 0)}</td>
                    <td className={cn(TD, 'text-red-700 hidden sm:table-cell')}>{data.operatorPerformance.reduce((s, r) => s + r.notTraded, 0)}</td>
                    <td className={cn(TD, 'hidden sm:table-cell')}>—</td>
                    <td className={cn(TD, 'font-bold text-green-800')}>{formatCurrency(totalMonthly)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Brokerage Upload Log ── */}
          {uploadLog.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Brokerage Upload Log</h2>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs">Date</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs">File Name</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-600 text-xs">Total Amount</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs">Uploaded By</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-xs">Uploaded At</th>
                      <th className="px-3 py-2.5 text-center font-semibold text-gray-600 text-xs">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadLog.map((log, idx) => (
                      <tr key={log.id} className={cn('border-b border-gray-100', idx % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                        <td className="px-3 py-2.5 text-sm text-gray-800">{format(new Date(log.uploadDate), 'd MMM yyyy')}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-600">{log.fileName}</td>
                        <td className="px-3 py-2.5 text-sm text-right font-medium">{formatCurrency(log.totalAmount)}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-600">{log.uploadedBy}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{format(new Date(log.createdAt), 'd MMM yyyy, h:mm a')}</td>
                        <td className="px-3 py-2.5 text-center">
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setReverseTarget(log.id)}>
                            Reverse
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reverse Confirmation Dialog */}
          <Dialog open={!!reverseTarget} onOpenChange={() => setReverseTarget(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Reverse Brokerage Upload</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Are you sure you want to reverse this brokerage upload? This will permanently delete all brokerage records for this upload.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setReverseTarget(null)}>Cancel</Button>
                  <Button variant="destructive" className="flex-1" onClick={handleReverse} disabled={reversing}>
                    {reversing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {reversing ? 'Reversing…' : 'Confirm Reverse'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Daily Breakdown (own horizontal scroll, hidden on mobile) ── */}
          <div className="hidden md:block">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Daily Breakdown</h2>
            <div className="rounded-lg border border-gray-200 overflow-x-auto">
              <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
                <thead>
                  <tr style={{ backgroundColor: '#1565C0' }}>
                    <th className="sticky left-0 z-10 px-3 py-2.5 text-left text-white font-semibold text-xs min-w-[130px]" style={{ backgroundColor: '#1565C0' }}>Operator</th>
                    {days.map((d) => (
                      <th key={d} className="px-2 py-2.5 text-white font-semibold text-center text-xs min-w-[60px]">{d}</th>
                    ))}
                    <th className="px-3 py-2.5 text-white font-semibold text-center text-xs min-w-[90px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.operatorPerformance.map((row, idx) => (
                    <tr key={row.operatorId} className={cn('border-b border-gray-100', idx % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                      <td className={cn('sticky left-0 z-10 px-3 py-2 font-semibold text-xs', idx % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>{row.operatorName}</td>
                      {days.map((d) => (
                        <td key={d} className="px-2 py-2 text-center text-xs text-gray-600">
                          {row.dailyBreakdown[d] ? formatCurrency(row.dailyBreakdown[d]) : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center text-xs font-semibold text-green-700">{formatCurrency(row.monthlyTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t-2 border-blue-300" style={{ backgroundColor: '#e3f2fd' }}>
                    <td className="sticky left-0 z-10 px-3 py-2 text-xs" style={{ backgroundColor: '#e3f2fd' }}>TOTAL</td>
                    {days.map((d) => {
                      const dayTotal = data.operatorPerformance.reduce((s, r) => s + (r.dailyBreakdown[d] || 0), 0)
                      return (
                        <td key={d} className="px-2 py-2 text-center text-xs">
                          {dayTotal > 0 ? formatCurrency(dayTotal) : <span className="text-gray-300">—</span>}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-center text-xs font-bold text-blue-800">{formatCurrency(totalMonthly)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Scroll right to see all days →</p>
          </div>

        </>
      )}
    </div>
  )
}

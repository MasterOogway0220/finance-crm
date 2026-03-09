'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import type { MFBusinessRecord } from '@/types'

const MONTHS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
  { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
  { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' },
]
const YEARS = ['2024', '2025', '2026']

export default function BusinessLogPage() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [myBusinessOnly, setMyBusinessOnly] = useState(false)
  const [records, setRecords] = useState<MFBusinessRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchRecords = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ month, year })
    if (myBusinessOnly) params.set('myBusinessOnly', 'true')
    fetch(`/api/mf-business?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setRecords(d.data) })
      .finally(() => setLoading(false))
  }, [month, year, myBusinessOnly])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/mf-business/${deleteId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('Entry deleted')
        setRecords((prev) => prev.filter((r) => r.id !== deleteId))
      } else {
        toast.error(data.error || 'Failed to delete entry')
      }
    } catch {
      toast.error('Failed to delete entry')
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  const totalSales = records.reduce((s, r) => s + r.yearlyContribution, 0)
  const totalCommission = records.reduce((s, r) => s + r.commissionAmount, 0)

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Log</h1>
          <p className="text-sm text-gray-500">Your recorded MF business entries</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Checkbox
              id="myBiz"
              checked={myBusinessOnly}
              onCheckedChange={(c) => setMyBusinessOnly(c === true)}
            />
            <label htmlFor="myBiz" className="text-sm cursor-pointer">My Business Only</label>
          </div>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Subtotals */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Records</p><p className="text-xl font-bold mt-1">{records.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Total Sales</p><p className="text-xl font-bold text-green-700 mt-1">{formatCurrency(totalSales)}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Total Commission</p><p className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(totalCommission)}</p></CardContent></Card>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : records.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">No business records for this period</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                <th className="px-3 py-2.5 text-left font-semibold">Client Code</th>
                <th className="px-3 py-2.5 text-left font-semibold">Client Name</th>
                <th className="px-3 py-2.5 text-left font-semibold">Referred By</th>
                <th className="px-3 py-2.5 text-left font-semibold">Product</th>
                <th className="px-3 py-2.5 text-left font-semibold">Type</th>
                <th className="px-3 py-2.5 text-right font-semibold">SIP Amt</th>
                <th className="px-3 py-2.5 text-right font-semibold">Yearly</th>
                <th className="px-3 py-2.5 text-right font-semibold">Comm %</th>
                <th className="px-3 py-2.5 text-right font-semibold">Comm Amt</th>
                <th className="px-3 py-2.5 text-center font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => (
                <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{new Date(r.businessDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.clientCode}</td>
                  <td className="px-3 py-2 text-gray-700">{r.clientName}</td>
                  <td className="px-3 py-2 text-gray-600">{r.referredByName || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{r.productName}</td>
                  <td className="px-3 py-2 text-gray-600">{r.investmentType}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{r.sipAmount ? formatCurrency(r.sipAmount) : '—'}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-800">{formatCurrency(r.yearlyContribution)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{r.commissionPercent}%</td>
                  <td className="px-3 py-2 text-right font-medium text-green-700">{formatCurrency(r.commissionAmount)}</td>
                  <td className="px-3 py-2 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteId(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this business entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

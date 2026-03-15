'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import type { MFBusinessRecord } from '@/types'

const MONTHS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
  { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
  { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' },
]
const YEARS = ['2024', '2025', '2026']

export default function EquityMFLogPage() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [records, setRecords] = useState<MFBusinessRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ month, year })
    fetch(`/api/mf-business?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setRecords(d.data) })
      .finally(() => setLoading(false))
  }, [month, year])

  const totalSales = records.reduce((s, r) => s + r.yearlyContribution, 0)
  const totalCommission = records.reduce((s, r) => s + r.commissionAmount, 0)

  return (
    <div className="page-container space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Mutual Fund Log</h1>
          <p className="text-sm text-gray-500">MF business entries referred by you</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
        <Card><CardContent className="py-12 text-center text-gray-400">No MF business entries referred by you for this period</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                <th className="px-3 py-2.5 text-left font-semibold">Client Code</th>
                <th className="px-3 py-2.5 text-left font-semibold">Client Name</th>
                <th className="px-3 py-2.5 text-left font-semibold">Recorded By</th>
                <th className="px-3 py-2.5 text-left font-semibold">Product</th>
                <th className="px-3 py-2.5 text-left font-semibold">Type</th>
                <th className="px-3 py-2.5 text-right font-semibold">SIP Amt</th>
                <th className="px-3 py-2.5 text-right font-semibold">Yearly</th>
                <th className="px-3 py-2.5 text-right font-semibold">Comm %</th>
                <th className="px-3 py-2.5 text-right font-semibold">Comm Amt</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => (
                <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{new Date(r.businessDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.clientCode}</td>
                  <td className="px-3 py-2 text-gray-700">{r.clientName}</td>
                  <td className="px-3 py-2 text-gray-600">{r.employeeName}</td>
                  <td className="px-3 py-2 text-gray-700">{r.productName}</td>
                  <td className="px-3 py-2 text-gray-600">{r.investmentType}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{r.sipAmount ? formatCurrency(r.sipAmount) : '—'}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-800">{formatCurrency(r.yearlyContribution)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{r.commissionPercent}%</td>
                  <td className="px-3 py-2 text-right font-medium text-green-700">{formatCurrency(r.commissionAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

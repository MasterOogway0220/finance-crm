'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { MFServiceRecord } from '@/types'

const MONTHS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
  { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
  { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' },
]
const YEARS = ['2024', '2025', '2026']

export default function ServiceLogPage() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [records, setRecords] = useState<MFServiceRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ month, year })
    fetch(`/api/mf-service?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setRecords(d.data) })
      .finally(() => setLoading(false))
  }, [month, year])

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Log</h1>
          <p className="text-sm text-gray-500">Your recorded MF service entries</p>
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

      {/* Summary */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Total Services</p><p className="text-xl font-bold mt-1">{records.length}</p></CardContent></Card>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : records.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">No service records for this period</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                <th className="px-3 py-2.5 text-left font-semibold">Client Code</th>
                <th className="px-3 py-2.5 text-left font-semibold">Client Name</th>
                <th className="px-3 py-2.5 text-left font-semibold">Description</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => (
                <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{new Date(r.serviceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.clientCode}</td>
                  <td className="px-3 py-2 text-gray-700">{r.clientName}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-md">
                    <p className="whitespace-pre-wrap line-clamp-2">{r.description}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

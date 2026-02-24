'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import { Download, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const YEARS = ['2024', '2025', '2026']

export default function BrokerageReportPage() {
  const { data: session } = useSession()
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [data, setData] = useState<{ matrix: Record<string, Record<string, number>>; months: string[]; operators: string[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports/brokerage?year=${year}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [year])

  const handleExport = async () => {
    const res = await fetch('/api/reports/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'brokerage', year }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `brokerage_report_${year}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const chartData = data?.operators.map((op) => ({
    name: op.split(' ')[0],
    ...data.months.reduce((acc, m) => ({ ...acc, [m]: data.matrix[op]?.[m] || 0 }), {}),
  })) || []

  const COLORS = ['#3b82f6', '#ef4444', '#a855f7', '#f59e0b', '#10b981', '#6b7280', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#14b8a6', '#8b5cf6']

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brokerage Report</h1>
          <p className="text-sm text-gray-500">Monthly operator performance</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5 h-9">
            <Download className="h-3.5 w-3.5" />Export Excel
          </Button>
          <Link href="/reports">
            <Button size="sm" variant="secondary" className="gap-1.5 h-9">
              <ArrowLeft className="h-3.5 w-3.5" />Back to Reports
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Operators</p><p className="text-xl font-bold mt-1">{data.operators.length}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Annual Total</p><p className="text-xl font-bold text-green-700 mt-1">{formatCurrency(Object.values(data.matrix).reduce((s, row) => s + Object.values(row).reduce((a, b) => a + b, 0), 0))}</p></CardContent></Card>
          </div>

          {/* Chart */}
          <div className="bg-white rounded-lg border p-4">
            <h2 className="text-base font-semibold text-gray-700 mb-4">Monthly Brokerage by Operator</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number | undefined, name: string | undefined) => [formatCurrency(v ?? 0), name ?? '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(data.months || []).map((m, i) => (
                  <Bar key={m} dataKey={m} fill={COLORS[i % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: '#2E7D32' }}>
                <tr>
                  <th className="px-3 py-3 text-white text-left font-semibold">Operator</th>
                  {data.months.map((m) => <th key={m} className="px-3 py-3 text-white text-center font-semibold whitespace-nowrap">{m}</th>)}
                  <th className="px-3 py-3 text-white text-center font-semibold">Annual Total</th>
                </tr>
              </thead>
              <tbody>
                {data.operators.map((op, idx) => {
                  const annualTotal = Object.values(data.matrix[op] || {}).reduce((a, b) => a + b, 0)
                  return (
                    <tr key={op} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2.5 font-medium text-gray-800">{op}</td>
                      {data.months.map((m) => (
                        <td key={m} className="px-3 py-2.5 text-center text-gray-700 text-xs">
                          {data.matrix[op]?.[m] ? formatCurrency(data.matrix[op][m]) : '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center font-semibold text-gray-800">{formatCurrency(annualTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

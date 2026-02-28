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

const MONTH_RANGES = [
  { label: 'Full Year', value: 'full', indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { label: 'Quarter 1', value: 'q1', indices: [0, 1, 2] },
  { label: 'Quarter 2', value: 'q2', indices: [3, 4, 5] },
  { label: 'Quarter 3', value: 'q3', indices: [6, 7, 8] },
  { label: 'Quarter 4', value: 'q4', indices: [9, 10, 11] },
  { label: '1st Half', value: 'h1', indices: [0, 1, 2, 3, 4, 5] },
  { label: '2nd Half', value: 'h2', indices: [6, 7, 8, 9, 10, 11] },
]

const Y_TICKS = [0, 50000, 100000, 150000, 200000, 250000, 300000, 350000, 400000]

const formatYAxis = (v: number) => {
  if (v === 0) return '0'
  if (v < 100000) return `${v / 1000}k`
  const lakhs = v / 100000
  return `${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(1)}L`
}

const BAR_COLORS = ['#3b82f6', '#ef4444', '#a855f7', '#f59e0b', '#10b981', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#14b8a6', '#8b5cf6', '#6b7280']

export default function BrokerageReportPage() {
  const { data: session } = useSession()
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [monthRange, setMonthRange] = useState('full')
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

  // Filter months based on selected range
  const selectedRange = MONTH_RANGES.find((r) => r.value === monthRange) || MONTH_RANGES[0]
  const filteredMonths = data ? selectedRange.indices.filter((i) => i < data.months.length).map((i) => data.months[i]) : []

  // Restructured: months on X-axis, operators as separate bars
  const chartData = filteredMonths.map((month) => ({
    month,
    ...data?.operators.reduce((acc, op) => ({ ...acc, [op]: data.matrix[op]?.[month] || 0 }), {}),
  })) || []

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
          <Select value={monthRange} onValueChange={setMonthRange}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
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
            <h2 className="text-base font-semibold text-gray-700 mb-4">My Monthly Brokerage</h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ left: 10, right: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  domain={[0, 400000]}
                  ticks={Y_TICKS}
                  tickFormatter={formatYAxis}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v: number | undefined, name: string | undefined) => [formatCurrency(v ?? 0), name ?? '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(data.operators || []).map((op, i) => (
                  <Bar key={op} dataKey={op} fill={BAR_COLORS[i % BAR_COLORS.length]} />
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

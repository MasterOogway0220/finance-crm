'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import { Download, ArrowLeft } from 'lucide-react'
import { getEffectiveRole } from '@/lib/roles'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

const YEARS = ['2024', '2025', '2026']
const TIME_RANGES = [
  { value: 'FULL', label: 'Full Year' },
  { value: 'Q1', label: 'Q1 (Jan-Mar)' },
  { value: 'Q2', label: 'Q2 (Apr-Jun)' },
  { value: 'Q3', label: 'Q3 (Jul-Sep)' },
  { value: 'Q4', label: 'Q4 (Oct-Dec)' },
  { value: 'H1', label: '1st Half (Jan-Jun)' },
  { value: 'H2', label: '2nd Half (Jul-Dec)' },
]

const RANGE_HEADING_LABELS: Record<string, string> = {
  FULL: 'Full Year',
  Q1: 'Q1(Jan-Mar)',
  Q2: 'Q2(Apr-Jun)',
  Q3: 'Q3(Jul-Sep)',
  Q4: 'Q4(Oct-Dec)',
  H1: 'H1(Jan-Jun)',
  H2: 'H2(Jul-Dec)',
}

const BAR_COLORS = ['#3b82f6', '#ef4444', '#a855f7', '#f59e0b', '#10b981', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#14b8a6', '#8b5cf6', '#6b7280']

interface Operator { id: string; name: string }

const formatYAxis = (v: number) => {
  if (v === 0) return '₹0'
  if (v >= 100000) return `₹${(v / 100000) % 1 === 0 ? (v / 100000).toFixed(0) : (v / 100000).toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`
  return `₹${v}`
}

export default function BrokerageReportPage() {
  const { data: session } = useSession()
  const role = session?.user ? getEffectiveRole(session.user) : undefined
  const isEquityDealer = role === 'EQUITY_DEALER'
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'

  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [range, setRange] = useState('FULL')
  const [operatorId, setOperatorId] = useState('all')
  const [operators, setOperators] = useState<Operator[]>([])
  const [data, setData] = useState<{ matrix: Record<string, Record<string, number>>; months: string[]; operators: string[] } | null>(null)
  const [loading, setLoading] = useState(true)

  // Only fetch operators list for admins
  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/employees?department=EQUITY&isActive=true')
      .then((r) => r.json())
      .then((d) => { if (d.success) setOperators(d.data) })
  }, [isAdmin])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ year, range })
    if (isAdmin && operatorId !== 'all') params.set('operatorId', operatorId)
    fetch(`/api/reports/brokerage?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [year, range, operatorId, isAdmin])

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

  const singleOperator = data?.operators.length === 1

  // Chart data: for single operator (equity dealer), show months on X-axis
  // For multiple operators (admin view), show operators on X-axis
  const chartData = singleOperator
    ? (data?.months || []).map((m) => ({
        name: m,
        amount: data?.matrix[data.operators[0]]?.[m] || 0,
      }))
    : (data?.operators || []).map((op) => ({
        name: op.split(' ')[0],
        amount: Object.values(data?.matrix[op] || {}).reduce((a, b) => a + b, 0),
      }))

  const totalAmount = data ? Object.values(data.matrix).reduce((s, row) => s + Object.values(row).reduce((a, b) => a + b, 0), 0) : 0

  // Calculate a reasonable Y-axis max based on data
  const maxAmount = Math.max(...chartData.map((d) => d.amount), 0)
  const yAxisMax = maxAmount === 0 ? 10000 : Math.ceil(maxAmount * 1.2 / 10000) * 10000

  // Chart heading: for equity dealer use "Employee Name – Q1(Jan-Mar)" format
  const chartHeading = singleOperator
    ? `${data?.operators[0]} – ${RANGE_HEADING_LABELS[range] || range}`
    : 'Brokerage by Operator'

  // Page title for equity dealer
  const pageTitle = isEquityDealer ? 'Annual Report' : 'Brokerage Report'
  const pageSubtitle = isEquityDealer ? 'Your annual brokerage performance' : 'Monthly operator performance'

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-sm text-gray-500">{pageSubtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Operator selector: only for admins */}
          {isAdmin && (
            <Select value={operatorId} onValueChange={setOperatorId}>
              <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Select Operator" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operators</SelectItem>
                {operators.map((op) => <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{TIME_RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5 h-9">
            <Download className="h-3.5 w-3.5" />Export Excel
          </Button>
          {/* Back to Reports: only for admins */}
          {isAdmin && (
            <Link href="/reports">
              <Button size="sm" variant="secondary" className="gap-1.5 h-9">
                <ArrowLeft className="h-3.5 w-3.5" />Back to Reports
              </Button>
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {!isEquityDealer && (
              <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Operators</p><p className="text-xl font-bold mt-1">{data.operators.length}</p></CardContent></Card>
            )}
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">{range === 'FULL' ? 'Annual' : RANGE_HEADING_LABELS[range] || range} Total</p><p className="text-xl font-bold text-green-700 mt-1">{formatCurrency(totalAmount)}</p></CardContent></Card>
          </div>

          {/* Chart */}
          <div className="bg-white rounded-lg border p-4">
            <h2 className="text-base font-semibold text-gray-700 mb-4">
              {chartHeading}
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={formatYAxis}
                  tick={{ fontSize: 11 }}
                  domain={[0, yAxisMax]}
                  allowDecimals={false}
                />
                <Tooltip formatter={(v: number | undefined) => [formatCurrency(v ?? 0), 'Brokerage']} />
                <Bar dataKey="amount" name="Brokerage" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, idx) => (
                    <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: '#2E7D32' }}>
                <tr>
                  <th className="px-3 py-3 text-white text-left font-semibold">{isEquityDealer ? 'Name' : 'Operator'}</th>
                  {data.months.map((m) => <th key={m} className="px-3 py-3 text-white text-center font-semibold whitespace-nowrap">{m}</th>)}
                  <th className="px-3 py-3 text-white text-center font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.operators.map((op, idx) => {
                  const opTotal = Object.values(data.matrix[op] || {}).reduce((a, b) => a + b, 0)
                  return (
                    <tr key={op} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2.5 font-medium text-gray-800">{op}</td>
                      {data.months.map((m) => (
                        <td key={m} className="px-3 py-2.5 text-center text-gray-700 text-xs">
                          {data.matrix[op]?.[m] ? formatCurrency(data.matrix[op][m]) : '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center font-semibold text-gray-800">{formatCurrency(opTotal)}</td>
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

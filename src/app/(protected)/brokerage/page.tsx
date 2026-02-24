'use client'
import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, getDaysInMonth } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
const MONTH_COLORS = ['#3b82f6', '#ef4444', '#a855f7', '#f59e0b', '#10b981', '#6b7280', '#06b6d4', '#ec4899']

export default function BrokeragePage() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [data, setData] = useState<BrokerageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/brokerage?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [month, year])

  const daysInMonth = getDaysInMonth(parseInt(year), parseInt(month))
  const currentDay = now.getMonth() + 1 === parseInt(month) && now.getFullYear() === parseInt(year) ? now.getDate() : daysInMonth

  const totalMonthly = data?.operatorPerformance.reduce((s, r) => s + r.monthlyTotal, 0) ?? 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brokerage Dashboard</h1>
          <p className="text-sm text-gray-500">Equity brokerage performance</p>
        </div>
        <div className="flex gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Total Month Brokerage</p><p className="text-xl font-bold text-green-700 mt-1">{formatCurrency(totalMonthly)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Operators</p><p className="text-xl font-bold text-gray-800 mt-1">{data.operatorPerformance.length}</p></CardContent></Card>
          </div>

          {/* Main Table */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Operator Performance</h2>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: '#2E7D32' }}>
                    <th className="sticky left-0 z-10 text-left px-3 py-3 text-white font-semibold min-w-[150px]" style={{ backgroundColor: '#2E7D32' }}>Operator</th>
                    <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">Clients</th>
                    <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">Traded</th>
                    <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">Not Traded</th>
                    <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">Traded %</th>
                    <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">Amount %</th>
                    <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">DNA</th>
                    <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap min-w-[100px]">Monthly (₹)</th>
                    {Array.from({ length: currentDay }, (_, i) => i + 1).map((d) => (
                      <th key={d} className="px-2 py-3 text-white font-semibold text-center whitespace-nowrap min-w-[70px]">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.operatorPerformance.map((row, idx) => (
                    <tr key={row.operatorId} className={cn('border-b border-gray-100', idx % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                      <td className={cn('sticky left-0 z-10 px-3 py-2.5 font-semibold', idx % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>{row.operatorName}</td>
                      <td className="px-3 py-2.5 text-center">{row.totalClients}</td>
                      <td className="px-3 py-2.5 text-center text-green-700 font-medium">{row.tradedClients}</td>
                      <td className="px-3 py-2.5 text-center text-red-600">{row.notTraded}</td>
                      <td className="px-3 py-2.5 text-center">{row.tradedPercentage.toFixed(2)}%</td>
                      <td className="px-3 py-2.5 text-center">{row.tradedAmountPercent.toFixed(2)}%</td>
                      <td className="px-3 py-2.5 text-center text-amber-700">{row.didNotAnswer}</td>
                      <td className="px-3 py-2.5 text-center font-semibold">{formatCurrency(row.monthlyTotal)}</td>
                      {Array.from({ length: currentDay }, (_, i) => i + 1).map((d) => (
                        <td key={d} className="px-2 py-2.5 text-center text-xs">{row.dailyBreakdown[d] ? formatCurrency(row.dailyBreakdown[d]) : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold" style={{ backgroundColor: '#e8f5e9' }}>
                    <td className="sticky left-0 z-10 px-3 py-3" style={{ backgroundColor: '#e8f5e9' }}>TOTAL</td>
                    <td className="px-3 py-3 text-center">{data.operatorPerformance.reduce((s, r) => s + r.totalClients, 0)}</td>
                    <td className="px-3 py-3 text-center text-green-800">{data.operatorPerformance.reduce((s, r) => s + r.tradedClients, 0)}</td>
                    <td className="px-3 py-3 text-center text-red-700">{data.operatorPerformance.reduce((s, r) => s + r.notTraded, 0)}</td>
                    <td className="px-3 py-3 text-center">—</td>
                    <td className="px-3 py-3 text-center">100%</td>
                    <td className="px-3 py-3 text-center">{data.operatorPerformance.reduce((s, r) => s + r.didNotAnswer, 0)}</td>
                    <td className="px-3 py-3 text-center">{formatCurrency(totalMonthly)}</td>
                    {Array.from({ length: currentDay }, (_, i) => i + 1).map((d) => {
                      const dayTotal = data.operatorPerformance.reduce((s, r) => s + (r.dailyBreakdown[d] || 0), 0)
                      return <td key={d} className="px-2 py-3 text-center text-xs">{dayTotal > 0 ? formatCurrency(dayTotal) : '—'}</td>
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Chart */}
          {data.brokerageChartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Equity All Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.brokerageChartData} layout="vertical" margin={{ left: 20, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number | undefined, name: string | undefined) => [formatCurrency(v ?? 0), name ?? '']} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    {data.brokerageMonths.map((m, i) => (
                      <Bar key={m} dataKey={m} stackId="a" fill={MONTH_COLORS[i % MONTH_COLORS.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

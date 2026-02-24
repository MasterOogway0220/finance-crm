'use client'
import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, getDaysInMonth } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Upload } from 'lucide-react'
import Link from 'next/link'
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

const TH = 'px-3 py-2.5 text-white font-semibold text-center text-xs whitespace-nowrap'
const TD = 'px-3 py-2.5 text-center text-sm'

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
                    <th className={cn(TH, 'hidden md:table-cell')}>Amount %</th>
                    <th className={cn(TH, 'hidden md:table-cell')}>DNA</th>
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
                      <td className={cn(TD, 'hidden md:table-cell')}>{row.tradedAmountPercent.toFixed(1)}%</td>
                      <td className={cn(TD, 'text-amber-700 hidden md:table-cell')}>{row.didNotAnswer}</td>
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
                    <td className={cn(TD, 'hidden md:table-cell')}>100%</td>
                    <td className={cn(TD, 'hidden md:table-cell')}>{data.operatorPerformance.reduce((s, r) => s + r.didNotAnswer, 0)}</td>
                    <td className={cn(TD, 'font-bold text-green-800')}>{formatCurrency(totalMonthly)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

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

          {/* ── Chart ── */}
          {data.brokerageChartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Equity All Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.brokerageChartData} layout="vertical" margin={{ left: 10, right: 20, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number | undefined, name: string | undefined) => [formatCurrency(v ?? 0), name ?? '']} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
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

'use client'
import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { IndianRupee } from 'lucide-react'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(0, i).toLocaleString('default', { month: 'long' }) }))
const YEARS = ['2024', '2025', '2026'].map((y) => ({ value: y, label: y }))

interface DailyBrokerage { date: string; amount: number; day: number }

export default function EquityBrokeragePage() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [data, setData] = useState<DailyBrokerage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/brokerage/daily?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [month, year])

  const totalMTD = data.reduce((s, d) => s + d.amount, 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Brokerage</h1>
          <p className="text-sm text-gray-500">Your daily brokerage performance</p>
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
        <Skeleton className="h-48 rounded-lg" />
      ) : (
        <>
          {/* MTD Summary */}
          <Card className="border-l-4 border-l-green-500 max-w-xs">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-green-100">
                <IndianRupee className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Total MTD Brokerage</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(totalMTD)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{MONTHS.find((m) => m.value === month)?.label} {year}</p>
              </div>
            </CardContent>
          </Card>

          {/* Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Daily Brokerage — {MONTHS.find((m) => m.value === month)?.label} {year}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number | undefined) => [formatCurrency(v ?? 0), 'Brokerage']} />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase">Date</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 text-xs uppercase">Brokerage Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.filter((d) => d.amount > 0).map((row, idx) => (
                  <tr key={row.date} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2.5 text-gray-700">{new Date(row.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
                {data.filter((d) => d.amount > 0).length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-8 text-center text-gray-400 text-sm">No brokerage data for this period</td></tr>
                )}
              </tbody>
              {totalMTD > 0 && (
                <tfoot>
                  <tr className="bg-green-50 font-bold border-t-2">
                    <td className="px-4 py-3 text-gray-800">Total</td>
                    <td className="px-4 py-3 text-right text-green-700">{formatCurrency(totalMTD)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  )
}

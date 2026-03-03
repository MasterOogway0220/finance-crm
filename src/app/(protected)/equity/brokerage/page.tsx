'use client'
import { useState, useEffect, useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { formatCurrency } from '@/lib/utils'
import { IndianRupee } from 'lucide-react'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(0, i).toLocaleString('default', { month: 'long' }) }))
const YEARS = ['2024', '2025', '2026'].map((y) => ({ value: y, label: y }))

interface DailyBrokerage { date: string; amount: number; day: number }
interface ClientBrokerage { clientCode: string; clientName: string; totalBrokerage: number }

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate()
}

export default function EquityBrokeragePage() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [data, setData] = useState<DailyBrokerage[]>([])
  const [loading, setLoading] = useState(true)

  // Client-wise brokerage state
  const [cwDay, setCwDay] = useState('monthly')
  const [cwFilter, setCwFilter] = useState('none')
  const [cwNoZero, setCwNoZero] = useState(false)
  const [cwClients, setCwClients] = useState<ClientBrokerage[]>([])
  const [cwLoading, setCwLoading] = useState(true)

  // Fetch daily brokerage for MTD summary and table
  useEffect(() => {
    setLoading(true)
    fetch(`/api/brokerage/daily?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data.daily) })
      .finally(() => setLoading(false))
  }, [month, year])

  // Fetch client-wise brokerage
  useEffect(() => {
    setCwLoading(true)
    const params = new URLSearchParams({ month, year: year })
    if (cwDay !== 'monthly') params.set('day', cwDay)
    fetch(`/api/brokerage/client-wise?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setCwClients(d.data.clients) })
      .finally(() => setCwLoading(false))
  }, [month, year, cwDay])

  const totalMTD = data.reduce((s, d) => s + d.amount, 0)

  const daysInMonth = getDaysInMonth(parseInt(month), parseInt(year))
  const dayOptions = Array.from({ length: daysInMonth }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  }))

  // Apply filters and sorting to client-wise data
  const filteredClients = useMemo(() => {
    let list = [...cwClients]

    // Toggle: hide zero brokerage clients
    if (cwNoZero) {
      list = list.filter((c) => c.totalBrokerage > 0)
    }

    // Filter dropdown
    if (cwFilter === 'high-low') {
      list.sort((a, b) => b.totalBrokerage - a.totalBrokerage)
    } else if (cwFilter === 'low-high') {
      list.sort((a, b) => a.totalBrokerage - b.totalBrokerage)
    } else if (cwFilter === 'zero') {
      list = list.filter((c) => c.totalBrokerage === 0)
    }

    return list
  }, [cwClients, cwFilter, cwNoZero])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Brokerage</h1>
          <p className="text-sm text-gray-500">Your brokerage performance</p>
        </div>
        <div className="flex gap-2">
          <Select value={month} onValueChange={(v) => { setMonth(v); setCwDay('monthly') }}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={year} onValueChange={(v) => { setYear(v); setCwDay('monthly') }}>
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

          {/* Client Wise Brokerage Box */}
          <Card className="bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-800">Client Wise Brokerage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Controls Row */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 font-medium">Month:</span>
                  <Select value={month} onValueChange={(v) => { setMonth(v); setCwDay('monthly') }}>
                    <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 font-medium">Date:</span>
                  <Select value={cwDay} onValueChange={setCwDay}>
                    <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      {dayOptions.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 font-medium">Sort:</span>
                  <Select value={cwFilter} onValueChange={setCwFilter}>
                    <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default</SelectItem>
                      <SelectItem value="high-low">High - Low</SelectItem>
                      <SelectItem value="low-high">Low - High</SelectItem>
                      <SelectItem value="zero">Zero Brokerage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Switch
                    checked={cwNoZero}
                    onCheckedChange={setCwNoZero}
                    id="no-zero"
                  />
                  <label htmlFor="no-zero" className="text-sm text-gray-600 font-medium cursor-pointer select-none">
                    No Zero Brokerage
                  </label>
                </div>
              </div>

              {/* Viewing label */}
              <p className="text-xs text-gray-400">
                Showing client-wise brokerage for{' '}
                {cwDay === 'monthly'
                  ? `${MONTHS.find((m) => m.value === month)?.label} ${year}`
                  : `${cwDay} ${MONTHS.find((m) => m.value === month)?.label} ${year}`}
              </p>

              {/* Client Table */}
              {cwLoading ? (
                <Skeleton className="h-32 rounded-lg" />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase w-12">#</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase">Client Code</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase">Client Name</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600 text-xs uppercase">Brokerage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClients.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">
                            No client brokerage data for this period
                          </td>
                        </tr>
                      ) : (
                        filteredClients.map((client, idx) => (
                          <tr key={client.clientCode} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{idx + 1}</td>
                            <td className="px-4 py-2.5 text-gray-700 font-medium">{client.clientCode}</td>
                            <td className="px-4 py-2.5 text-gray-700">{client.clientName}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                              {formatCurrency(client.totalBrokerage)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredClients.length > 0 && (
                      <tfoot>
                        <tr className="bg-green-50 font-bold border-t-2">
                          <td className="px-4 py-3" colSpan={3}>Total</td>
                          <td className="px-4 py-3 text-right text-green-700">
                            {formatCurrency(filteredClients.reduce((s, c) => s + c.totalBrokerage, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Daily Brokerage Table (kept for reference) */}
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

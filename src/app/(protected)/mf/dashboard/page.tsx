'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Users, Activity, UserX, IndianRupee, TrendingUp, AlertTriangle } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { formatCurrency } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(0, i).toLocaleString('default', { month: 'long' }) }))
const YEARS  = ['2024', '2025', '2026', '2027'].map((y) => ({ value: y, label: y }))

interface MFDashData {
  totalClients: number
  activeClients: number
  inactiveClients: number
  totalSales: number
  totalCommission: number
}

interface NotTraded2mClient {
  id: string
  clientCode: string
  name: string
  phone: string
  operatorName: string
}

export default function MFDashboardPage() {
  const { data: session } = useSession()
  const [data, setData] = useState<MFDashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [myBusinessOnly, setMyBusinessOnly] = useState(false)
  const [notTraded2m, setNotTraded2m] = useState<NotTraded2mClient[]>([])
  const [notTraded2mLoading, setNotTraded2mLoading] = useState(true)
  const [showNotTraded2mTable, setShowNotTraded2mTable] = useState(false)
  const today = new Date()
  const [month, setMonth] = useState(String(today.getMonth() + 1))
  const [year, setYear]   = useState(String(today.getFullYear()))

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    const params = new URLSearchParams({ month, year })
    if (myBusinessOnly) params.set('myBusinessOnly', 'true')
    fetch(`/api/dashboard/mf?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .catch((e) => { if (e.name !== 'AbortError') console.error(e) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [month, year, myBusinessOnly])

  useEffect(() => {
    setNotTraded2mLoading(true)
    fetch('/api/dashboard/mf/not-traded-2months')
      .then((r) => r.json())
      .then((d) => { if (d.success) setNotTraded2m(d.data.clients) })
      .catch((e) => console.error(e))
      .finally(() => setNotTraded2mLoading(false))
  }, [])

  return (
    <div className="page-container space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here&apos;s your work overview for today</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="myBizDash"
              checked={myBusinessOnly}
              onCheckedChange={(c) => setMyBusinessOnly(c === true)}
            />
            <label htmlFor="myBizDash" className="text-sm cursor-pointer text-gray-600">My Business Only</label>
          </div>
          <div className="flex items-center gap-2">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{YEARS.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard title="Total Clients" value={data.totalClients} subtitle="Assigned to you" icon={Users} accent="blue" />
          <KpiCard title="Active Clients" value={data.activeClients} subtitle="Investment done / interested" icon={Activity} accent="green" />
          <KpiCard title="Inactive Clients" value={data.inactiveClients} subtitle="Needs follow-up" icon={UserX} accent="red" />
          <KpiCard title="Total Sales" value={formatCurrency(data.totalSales)} subtitle="This month" icon={TrendingUp} accent="emerald" />
          <KpiCard title="Total Commission" value={formatCurrency(data.totalCommission)} subtitle="This month" icon={IndianRupee} accent="indigo" />
        </div>
      )}

      {notTraded2mLoading ? (
        <Skeleton className="h-28 w-full max-w-xs rounded-lg" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            title="Not Traded (2 Months)"
            value={notTraded2m.length}
            subtitle="Equity clients inactive 2 consecutive months"
            icon={AlertTriangle}
            accent="amber"
            actionLabel={showNotTraded2mTable ? 'Hide list' : 'View list'}
            onAction={() => setShowNotTraded2mTable((v) => !v)}
          />
        </div>
      )}

      {showNotTraded2mTable && notTraded2m.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Code', 'Name', 'Phone', 'Operator'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notTraded2m.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{c.clientCode}</td>
                  <td className="px-4 py-3 text-gray-800">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.phone}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.operatorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNotTraded2mTable && notTraded2m.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">No clients inactive for 2 consecutive months.</p>
      )}
    </div>
  )
}

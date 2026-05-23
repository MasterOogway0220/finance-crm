'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Users, TrendingUp, TrendingDown, Percent, IndianRupee, ShoppingBag } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(0, i).toLocaleString('default', { month: 'long' }) }))
const YEARS  = ['2024', '2025', '2026', '2027'].map((y) => ({ value: y, label: y }))

interface EquityDashData {
  totalClients: number
  tradedClients: number
  notTraded: number
  mtdBrokerage: number
}

interface MFStats {
  totalSales: number
  totalCommission: number
}

export default function EquityDashboardPage() {
  const { data: session } = useSession()
  const [data, setData] = useState<EquityDashData | null>(null)
  const [mfStats, setMfStats] = useState<MFStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [mfLoading, setMfLoading] = useState(true)
  const today = new Date()
  const [month, setMonth] = useState(String(today.getMonth() + 1))
  const [year, setYear]   = useState(String(today.getFullYear()))

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setMfLoading(true)
    fetch(`/api/dashboard/equity?month=${month}&year=${year}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .catch((e) => { if (e.name !== 'AbortError') console.error(e) })
      .finally(() => setLoading(false))

    fetch(`/api/mf-business/stats?month=${month}&year=${year}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => { if (d.success) setMfStats(d.data) })
      .catch((e) => { if (e.name !== 'AbortError') console.error(e) })
      .finally(() => setMfLoading(false))

    return () => controller.abort()
  }, [month, year])

  return (
    <div className="page-container space-y-6">
      {/* Welcome Banner */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here&apos;s your work overview for today</p>
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

      {/* Equity KPIs */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : data && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <KpiCard title="Total Clients" value={data.totalClients} subtitle="Assigned to you" icon={Users} accent="blue" />
          <KpiCard title="Traded Clients" value={data.tradedClients} subtitle="Active trading" icon={TrendingUp} accent="green" />
          <KpiCard title="Not Traded" value={data.notTraded} subtitle="Pending activation" icon={TrendingDown} accent="red" />
          <KpiCard title="% Traded" value={data.totalClients > 0 ? ((data.tradedClients / data.totalClients) * 100).toFixed(1) + '%' : '0%'} subtitle="Traded ratio" icon={Percent} accent="amber" />
          <KpiCard title="Total Brokerage" value={formatCurrency(data.mtdBrokerage)} subtitle="This month" icon={IndianRupee} accent="green" />
        </div>
      )}

      {/* My Mutual Fund Business */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-800">My Mutual Fund Business</h2>
          <span className="text-xs text-gray-400 ml-1">— this month</span>
        </div>

        {mfLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KpiCard
              title="Total Sales"
              value={formatCurrency(mfStats?.totalSales ?? 0)}
              subtitle="Yearly contribution from your referrals"
              icon={IndianRupee}
              accent="indigo"
            />
            <KpiCard
              title="Total Commission"
              value={formatCurrency(mfStats?.totalCommission ?? 0)}
              subtitle="Commission earned on referred MF business"
              icon={IndianRupee}
              accent="green"
            />
          </div>
        )}
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Users, TrendingUp, TrendingDown, Percent, IndianRupee } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDateLong } from '@/lib/utils'

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
  const currentMonth = today.getMonth() + 1
  const currentYear = today.getFullYear()

  useEffect(() => {
    fetch('/api/dashboard/equity')
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))

    fetch(`/api/mf-business/stats?month=${currentMonth}&year=${currentYear}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setMfStats(d.data) })
      .finally(() => setMfLoading(false))
  }, [currentMonth, currentYear])

  return (
    <div className="dash-scope page-container space-y-6">
      <nav aria-label="Breadcrumb" className="dash-breadcrumb">
        <a href="/equity/dashboard">Home</a>
        <span className="dash-breadcrumb__sep">›</span>
        <span className="dash-breadcrumb__current">Equity Dashboard</span>
      </nav>

      {/* Welcome Banner */}
      <div className="flex items-start justify-between">
        <div>
          <h1>Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--dash-muted, #6b7280)' }}>
            Here&apos;s your work overview for today
          </p>
        </div>
        <p
          className="text-sm hidden md:block"
          style={{ color: 'var(--dash-muted, #6b7280)' }}
        >
          {formatDateLong(today)}
        </p>
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
          <h2 className="dash-section-title">My Mutual Fund Business</h2>
          <span className="dash-pill dash-pill--primary-soft ml-1">this month</span>
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

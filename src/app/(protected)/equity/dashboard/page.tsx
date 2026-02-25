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

export default function EquityDashboardPage() {
  const { data: session } = useSession()
  const [data, setData] = useState<EquityDashData | null>(null)
  const [loading, setLoading] = useState(true)
  const today = new Date()

  useEffect(() => {
    fetch('/api/dashboard/equity')
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Banner */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here's your work overview for today</p>
        </div>
        <p className="text-sm text-gray-500 hidden md:block">{formatDateLong(today)}</p>
      </div>

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
    </div>
  )
}

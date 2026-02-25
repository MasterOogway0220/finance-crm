'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Users, Activity, UserX } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateLong } from '@/lib/utils'

interface MFDashData {
  totalClients: number
  activeClients: number
  inactiveClients: number
}

export default function MFDashboardPage() {
  const { data: session } = useSession()
  const [data, setData] = useState<MFDashData | null>(null)
  const [loading, setLoading] = useState(true)
  const today = new Date()

  useEffect(() => {
    fetch('/api/dashboard/mf')
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here's your work overview for today</p>
        </div>
        <p className="text-sm text-gray-500 hidden md:block">{formatDateLong(today)}</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard title="Total Clients" value={data.totalClients} subtitle="Assigned to you" icon={Users} accent="blue" />
          <KpiCard title="Active Clients" value={data.activeClients} subtitle="Investment done / interested" icon={Activity} accent="green" />
          <KpiCard title="Inactive Clients" value={data.inactiveClients} subtitle="Needs follow-up" icon={UserX} accent="red" />
        </div>
      )}
    </div>
  )
}

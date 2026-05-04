'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Users, Activity, UserX, IndianRupee, TrendingUp } from 'lucide-react'
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

export default function MFDashboardPage() {
  const { data: session } = useSession()
  const [data, setData] = useState<MFDashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [myBusinessOnly, setMyBusinessOnly] = useState(false)
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
    </div>
  )
}

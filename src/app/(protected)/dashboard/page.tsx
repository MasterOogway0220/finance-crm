'use client'
import { useState, useEffect } from 'react'
import {
  Users, Briefcase, IndianRupee, TrendingUp, Clock, AlertTriangle,
} from 'lucide-react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { BrokerageChart } from '@/components/dashboard/brokerage-chart'
import { TaskPieChart } from '@/components/dashboard/task-pie-chart'
import { OperatorTable } from '@/components/dashboard/operator-table'
import { EmployeeStatusTable } from '@/components/dashboard/employee-status-table'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDateLong, getDaysInMonth } from '@/lib/utils'
import { useActiveRoleStore, getDashboardForRole } from '@/stores/active-role-store'

interface DashboardData {
  totalEmployees: number
  totalClients: number
  equityClients: number
  mfClients: number
  monthlyBrokerage: number
  lastMonthBrokerage: number
  tradedClients: number
  totalEquityClients: number
  pendingTasks: number
  overdueTasks: number
  taskStats: { pending: number; completed: number; expired: number }
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
  brokerageChartData: Array<{ name: string; [month: string]: string | number }>
  brokerageMonths: string[]
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const today = new Date()
  const currentDay = today.getDate()
  const daysInMonth = getDaysInMonth(today.getFullYear(), today.getMonth() + 1)
  const { activeRole } = useActiveRoleStore()

  // If the user's active role doesn't belong on this dashboard, send them to the right one
  useEffect(() => {
    if (!activeRole) return
    const target = getDashboardForRole(activeRole)
    if (target !== '/dashboard') {
      window.location.replace(target)
    }
  }, [activeRole])

  useEffect(() => {
    fetch('/api/dashboard/admin')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d.data)
      })
      .finally(() => setLoading(false))
  }, [])

  const brokerageTrend = data && data.lastMonthBrokerage > 0
    ? { value: `${Math.abs(((data.monthlyBrokerage - data.lastMonthBrokerage) / data.lastMonthBrokerage) * 100).toFixed(1)}% from last month`, positive: data.monthlyBrokerage >= data.lastMonthBrokerage }
    : undefined

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatDateLong(today)}</p>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            title="Total Employees"
            value={data.totalEmployees}
            subtitle="Across 3 departments"
            icon={Users}
            accent="blue"
          />
          <KpiCard
            title="Total Clients"
            value={data.totalClients}
            subtitle={`Equity: ${data.equityClients} | MF: ${data.mfClients}`}
            icon={Briefcase}
            accent="indigo"
          />
          <KpiCard
            title="Monthly Brokerage"
            value={formatCurrency(data.monthlyBrokerage)}
            subtitle="Current month"
            icon={IndianRupee}
            accent="green"
            trend={brokerageTrend}
          />
          <KpiCard
            title="Traded Clients"
            value={`${data.totalEquityClients > 0 ? ((data.tradedClients / data.totalEquityClients) * 100).toFixed(1) : 0}%`}
            subtitle={`${data.tradedClients} of ${data.totalEquityClients} clients`}
            icon={TrendingUp}
            accent="emerald"
          />
          <KpiCard
            title="Pending Tasks"
            value={data.pendingTasks}
            subtitle="Across all departments"
            icon={Clock}
            accent="amber"
          />
          <KpiCard
            title="Overdue Tasks"
            value={data.overdueTasks}
            subtitle="Requires attention"
            icon={AlertTriangle}
            accent="red"
          />
        </div>
      )}

      {/* Charts Row */}
      {!loading && data && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <BrokerageChart data={data.brokerageChartData} months={data.brokerageMonths} />
          </div>
          <div className="lg:col-span-2">
            <TaskPieChart
              pending={data.taskStats?.pending ?? 0}
              completed={data.taskStats?.completed ?? 0}
              expired={data.taskStats?.expired ?? 0}
            />
          </div>
        </div>
      )}

      {/* Operator Performance Table */}
      {!loading && data && data.operatorPerformance.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Operator Performance</h2>
          <OperatorTable
            data={data.operatorPerformance}
            daysInMonth={daysInMonth}
            currentDay={currentDay}
          />
        </div>
      )}

      {/* Employee Login/Logout Status */}
      <EmployeeStatusTable />

    </div>
  )
}

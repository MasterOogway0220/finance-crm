'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  Users, Briefcase, IndianRupee, TrendingUp, Clock, AlertTriangle, UserCheck,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { KpiCard } from '@/components/dashboard/kpi-card'
const BrokerageChart = dynamic(() => import('@/components/dashboard/brokerage-chart').then(m => ({ default: m.BrokerageChart })), { ssr: false, loading: () => <Skeleton className="h-[340px] rounded-lg" /> })
const TaskPieChart = dynamic(() => import('@/components/dashboard/task-pie-chart').then(m => ({ default: m.TaskPieChart })), { ssr: false, loading: () => <Skeleton className="h-[340px] rounded-lg" /> })
const OperatorTable = dynamic(() => import('@/components/dashboard/operator-table').then(m => ({ default: m.OperatorTable })), { loading: () => <Skeleton className="h-48 rounded-lg" /> })
const EmployeeStatusTable = dynamic(() => import('@/components/dashboard/employee-status-table').then(m => ({ default: m.EmployeeStatusTable })), { loading: () => <Skeleton className="h-48 rounded-lg" /> })
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDateLong, getDaysInMonth } from '@/lib/utils'
import { useActiveRoleStore, getDashboardForRole } from '@/stores/active-role-store'

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(0, i).toLocaleString('default', { month: 'long' }) }))
const YEARS = ['2024', '2025', '2026', '2027'].map((y) => ({ value: y, label: y }))

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
  mfTotalSales: number
  mfTotalCommission: number
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

interface EquityEmployee { id: string; name: string }
interface ClientBrokerage { clientCode: string; clientName: string; totalBrokerage: number }

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const today = new Date()
  const currentDay = today.getDate()
  const daysInMonth = getDaysInMonth(today.getFullYear(), today.getMonth() + 1)
  const { activeRole } = useActiveRoleStore()

  // Client-wise brokerage state
  const [equityEmployees, setEquityEmployees] = useState<EquityEmployee[]>([])
  const [cwEmployee, setCwEmployee] = useState('')
  const [cwMonth, setCwMonth] = useState(String(today.getMonth() + 1))
  const [cwYear, setCwYear] = useState(String(today.getFullYear()))
  const [cwDay, setCwDay] = useState('monthly')
  const [cwFilter, setCwFilter] = useState('none')
  const [cwNoZero, setCwNoZero] = useState(false)
  const [cwClients, setCwClients] = useState<ClientBrokerage[]>([])
  const [cwLoading, setCwLoading] = useState(false)

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
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [])

  // Fetch equity employees for dropdown
  useEffect(() => {
    fetch('/api/employees?department=EQUITY&isActive=true')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const employees: EquityEmployee[] = d.data.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name }))
          setEquityEmployees(employees)
          if (employees.length > 0) setCwEmployee(employees[0].id)
        }
      })
  }, [])

  // Fetch client-wise brokerage when employee/month/year/day changes
  useEffect(() => {
    if (!cwEmployee) return
    setCwLoading(true)
    const params = new URLSearchParams({ operatorId: cwEmployee, month: cwMonth, year: cwYear })
    if (cwDay !== 'monthly') params.set('day', cwDay)
    fetch(`/api/brokerage/client-wise?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setCwClients(d.data.clients) })
      .finally(() => setCwLoading(false))
  }, [cwEmployee, cwMonth, cwYear, cwDay])

  const cwDaysInMonth = getDaysInMonth(parseInt(cwYear), parseInt(cwMonth))
  const cwDayOptions = Array.from({ length: cwDaysInMonth }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

  const filteredClients = useMemo(() => {
    let list = [...cwClients]
    if (cwNoZero) list = list.filter((c) => c.totalBrokerage > 0)
    if (cwFilter === 'high-low') list.sort((a, b) => b.totalBrokerage - a.totalBrokerage)
    else if (cwFilter === 'low-high') list.sort((a, b) => a.totalBrokerage - b.totalBrokerage)
    else if (cwFilter === 'zero') list = list.filter((c) => c.totalBrokerage === 0)
    return list
  }, [cwClients, cwFilter, cwNoZero])

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            title="Total Clients Traded"
            value={data.tradedClients}
            subtitle={`${data.totalEquityClients > 0 ? ((data.tradedClients / data.totalEquityClients) * 100).toFixed(1) : 0}% of ${data.totalEquityClients} equity clients`}
            icon={UserCheck}
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
          <KpiCard
            title="MF Total Sales"
            value={formatCurrency(data.mfTotalSales)}
            subtitle="Current month"
            icon={TrendingUp}
            accent="emerald"
          />
          <KpiCard
            title="MF Total Commission"
            value={formatCurrency(data.mfTotalCommission)}
            subtitle="Current month"
            icon={IndianRupee}
            accent="indigo"
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

      {/* Client Wise Brokerage (Admin View) */}
      <Card className="bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-800">Client Wise Brokerage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Controls Row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">Employee:</span>
              <Select value={cwEmployee} onValueChange={setCwEmployee}>
                <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {equityEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">Month:</span>
              <Select value={cwMonth} onValueChange={(v) => { setCwMonth(v); setCwDay('monthly') }}>
                <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">Year:</span>
              <Select value={cwYear} onValueChange={(v) => { setCwYear(v); setCwDay('monthly') }}>
                <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">Date:</span>
              <Select value={cwDay} onValueChange={setCwDay}>
                <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  {cwDayOptions.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
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
              <Switch checked={cwNoZero} onCheckedChange={setCwNoZero} id="admin-no-zero" />
              <label htmlFor="admin-no-zero" className="text-sm text-gray-600 font-medium cursor-pointer select-none">
                No Zero Brokerage
              </label>
            </div>
          </div>

          {/* Viewing label */}
          <p className="text-xs text-gray-400">
            Showing client-wise brokerage for{' '}
            {cwDay === 'monthly'
              ? `${MONTHS.find((m) => m.value === cwMonth)?.label} ${cwYear}`
              : `${cwDay} ${MONTHS.find((m) => m.value === cwMonth)?.label} ${cwYear}`}
            {cwEmployee && equityEmployees.length > 0 && ` — ${equityEmployees.find((e) => e.id === cwEmployee)?.name}`}
          </p>

          {/* Client Table */}
          {cwLoading ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : !cwEmployee ? (
            <p className="text-sm text-gray-400 py-6 text-center">Select an employee to view client brokerage</p>
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

      {/* Employee Login/Logout Status */}
      <EmployeeStatusTable />

    </div>
  )
}

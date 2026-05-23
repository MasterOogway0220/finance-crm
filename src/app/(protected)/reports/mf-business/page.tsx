'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import type { MFBusinessRecord } from '@/types'

const MFBusinessBarChart = dynamic(
  () => import('@/components/reports/mf-business-bar-chart').then((m) => ({ default: m.MFBusinessBarChart })),
  { ssr: false, loading: () => <Skeleton className="h-[320px] rounded-lg" /> }
)
const MFDepartmentPieChart = dynamic(
  () => import('@/components/reports/mf-department-pie-chart').then((m) => ({ default: m.MFDepartmentPieChart })),
  { ssr: false, loading: () => <Skeleton className="h-[320px] rounded-lg" /> }
)
const ServiceBusinessSplitChart = dynamic(
  () => import('@/components/reports/service-business-split-chart').then((m) => ({ default: m.ServiceBusinessSplitChart })),
  { ssr: false, loading: () => <Skeleton className="h-[320px] rounded-lg" /> }
)

const MONTHS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
  { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
  { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' },
]
const YEARS = ['2024', '2025', '2026']

interface EmployeeStat { name: string; totalSales: number; totalCommission: number }
interface ReportData {
  equityStats: EmployeeStat[]
  mfStats: EmployeeStat[]
  distribution: {
    sales: { equity: number; mf: number }
    commission: { equity: number; mf: number }
  }
}
interface Employee { id: string; name: string }

export default function MFBusinessReportPage() {
  const now = new Date()
  const [activeTab, setActiveTab] = useState<'charts' | 'log'>('charts')

  // Shared filters
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [range, setRange] = useState('MONTH')

  // Charts tab state
  const [metric, setMetric] = useState<'sales' | 'commission'>('commission')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  // Log tab state
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filterEmployeeId, setFilterEmployeeId] = useState('all')
  const [grouped, setGrouped] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [logRecords, setLogRecords] = useState<MFBusinessRecord[]>([])
  const [logLoading, setLogLoading] = useState(false)

  // Fetch employee list once for the filter dropdown
  useEffect(() => {
    fetch('/api/employees?isActive=true')
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmployees(d.data) })
  }, [])

  // Charts tab: fetch aggregate data
  useEffect(() => {
    if (activeTab !== 'charts') return
    setLoading(true)
    const params = new URLSearchParams({ year, range })
    if (range === 'MONTH') params.set('month', month)
    fetch(`/api/reports/mf-business?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [month, year, range, activeTab])

  // Log tab: fetch individual records
  useEffect(() => {
    if (activeTab !== 'log') return
    setLogLoading(true)
    const params = new URLSearchParams({ year, range, limit: '500' })
    if (range === 'MONTH') params.set('month', month)
    if (filterEmployeeId !== 'all') params.set('employeeId', filterEmployeeId)
    fetch(`/api/mf-business?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setLogRecords(d.data) })
      .finally(() => setLogLoading(false))
  }, [month, year, range, filterEmployeeId, activeTab])

  const handleExport = async () => {
    const body: Record<string, unknown> = { type: 'mf-business-log', year: parseInt(year), range }
    if (range === 'MONTH') body.month = parseInt(month)
    if (filterEmployeeId !== 'all') body.employeeId = filterEmployeeId
    const res = await fetch('/api/reports/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const period = range === 'MONTH' ? `${year}-${String(month).padStart(2, '0')}` : year
      a.href = url
      a.download = `mf-business-log-${period}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      toast.error('Export failed')
    }
  }

  const toggleGroup = (empId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(empId)) next.delete(empId)
      else next.add(empId)
      return next
    })
  }

  // Group logRecords by employee for grouped view
  const groupedData = employees
    .filter((e) => filterEmployeeId === 'all' || e.id === filterEmployeeId)
    .map((e) => ({
      employee: e,
      records: logRecords.filter((r) => r.employeeId === e.id),
    }))
    .filter((g) => g.records.length > 0)

  // Charts computed values
  const equityChartData = data?.equityStats.map((e) => ({
    name: e.name.split(' ')[0],
    value: metric === 'sales' ? e.totalSales : e.totalCommission,
  })) || []
  const mfChartData = data?.mfStats.map((e) => ({
    name: e.name.split(' ')[0],
    value: metric === 'sales' ? e.totalSales : e.totalCommission,
  })) || []
  const pieEquity = data ? (metric === 'sales' ? data.distribution.sales.equity : data.distribution.commission.equity) : 0
  const pieMF = data ? (metric === 'sales' ? data.distribution.sales.mf : data.distribution.commission.mf) : 0
  const metricLabel = metric === 'sales' ? 'Total Sales' : 'Total Commission'
  const periodLabel = range === 'FULL_YEAR' ? `Full Year ${year}` : `${MONTHS[parseInt(month) - 1]?.label} ${year}`

  return (
    <div className="page-container space-y-6">
      {/* Header + shared filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">MF Business Report</h1>
          <p className="text-sm text-gray-500">Mutual fund sales and commission analysis</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === 'charts' && (
            <Select value={metric} onValueChange={(v) => setMetric(v as 'sales' | 'commission')}>
              <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="commission">Total Commission</SelectItem>
                <SelectItem value="sales">Total Sales</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MONTH">Monthly</SelectItem>
              <SelectItem value="FULL_YEAR">Full Year</SelectItem>
            </SelectContent>
          </Select>
          {range === 'MONTH' && (
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Link href="/reports">
            <Button size="sm" variant="secondary" className="gap-1.5 h-9">
              <ArrowLeft className="h-3.5 w-3.5" />Back
            </Button>
          </Link>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-200">
        {(['charts', 'log'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-slate-800 text-slate-800'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'charts' ? 'Charts' : 'Business Log'}
          </button>
        ))}
      </div>

      {/* Charts tab content */}
      {activeTab === 'charts' && (
        loading ? (
          <div className="space-y-4">
            <Skeleton className="h-[320px] rounded-lg" />
            <Skeleton className="h-[320px] rounded-lg" />
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <MFBusinessBarChart
                title={`Equity Department - ${metricLabel} (${periodLabel})`}
                data={equityChartData}
                valueLabel={metricLabel}
              />
              <MFBusinessBarChart
                title={`MF Department - ${metricLabel} (${periodLabel})`}
                data={mfChartData}
                valueLabel={metricLabel}
              />
            </div>
            <ServiceBusinessSplitChart month={month} year={year} />
            <div className="max-w-lg mx-auto">
              <MFDepartmentPieChart
                title={`Business Distribution - ${metricLabel} (${periodLabel})`}
                equity={pieEquity}
                mf={pieMF}
                valueLabel={metricLabel}
              />
            </div>
          </>
        ) : null
      )}

      {/* Business Log tab content */}
      {activeTab === 'log' && (
        <div className="space-y-4">
          {/* Log toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
                <SelectTrigger className="w-48 h-9 text-sm"><SelectValue placeholder="All Employees" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant={grouped ? 'default' : 'outline'}
                className="h-9"
                onClick={() => setGrouped((g) => !g)}
              >
                Group by Employee
              </Button>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />Export Excel
            </Button>
          </div>

          {/* Summary cards */}
          {!logLoading && logRecords.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-gray-500">Records</p>
                  <p className="text-xl font-bold mt-1">{logRecords.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-gray-500">Total Sales</p>
                  <p className="text-xl font-bold text-green-700 mt-1">
                    {formatCurrency(logRecords.reduce((s, r) => s + r.yearlyContribution, 0))}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-gray-500">Total Commission</p>
                  <p className="text-xl font-bold text-blue-700 mt-1">
                    {formatCurrency(logRecords.reduce((s, r) => s + r.commissionAmount, 0))}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table area */}
          {logLoading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : logRecords.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-400">
                No business records for this period
              </CardContent>
            </Card>
          ) : grouped ? (
            <div className="space-y-3">
              {groupedData.map((group) => {
                const isCollapsed = collapsedGroups.has(group.employee.id)
                const groupSales = group.records.reduce((s, r) => s + r.yearlyContribution, 0)
                const groupComm = group.records.reduce((s, r) => s + r.commissionAmount, 0)
                return (
                  <div key={group.employee.id} className="border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 hover:bg-slate-200 transition-colors text-left"
                      onClick={() => toggleGroup(group.employee.id)}
                    >
                      <div className="flex items-center gap-3">
                        {isCollapsed
                          ? <ChevronRight className="h-4 w-4 text-gray-500" />
                          : <ChevronDown className="h-4 w-4 text-gray-500" />}
                        <span className="font-semibold text-sm">{group.employee.name}</span>
                        <span className="text-xs text-gray-500">{group.records.length} records</span>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="text-green-700 font-medium">{formatCurrency(groupSales)}</span>
                        <span className="text-blue-700 font-medium">{formatCurrency(groupComm)}</span>
                      </div>
                    </button>
                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-800 text-white">
                            <tr>
                              <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Client Code</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Client Name</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Referred By</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Product</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Type</th>
                              <th className="px-3 py-2.5 text-right font-semibold">SIP Amt</th>
                              <th className="px-3 py-2.5 text-right font-semibold">Yearly</th>
                              <th className="px-3 py-2.5 text-right font-semibold">Comm %</th>
                              <th className="px-3 py-2.5 text-right font-semibold">Comm Amt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.records.map((r, idx) => (
                              <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                  {new Date(r.businessDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </td>
                                <td className="px-3 py-2 font-medium text-gray-800">{r.clientCode}</td>
                                <td className="px-3 py-2 text-gray-700">{r.clientName}</td>
                                <td className="px-3 py-2 text-gray-600">{r.referredByName || '—'}</td>
                                <td className="px-3 py-2 text-gray-700">{r.productName}</td>
                                <td className="px-3 py-2 text-gray-600">{r.investmentType}</td>
                                <td className="px-3 py-2 text-right text-gray-700">{r.sipAmount ? formatCurrency(r.sipAmount) : '—'}</td>
                                <td className="px-3 py-2 text-right font-medium text-gray-800">{formatCurrency(r.yearlyContribution)}</td>
                                <td className="px-3 py-2 text-right text-gray-600">{r.commissionPercent}%</td>
                                <td className="px-3 py-2 text-right font-medium text-green-700">{formatCurrency(r.commissionAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Employee</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Client Code</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Client Name</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Referred By</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Product</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Type</th>
                    <th className="px-3 py-2.5 text-right font-semibold">SIP Amt</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Yearly</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Comm %</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Comm Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {logRecords.map((r, idx) => (
                    <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {new Date(r.businessDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.employeeName}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{r.clientCode}</td>
                      <td className="px-3 py-2 text-gray-700">{r.clientName}</td>
                      <td className="px-3 py-2 text-gray-600">{r.referredByName || '—'}</td>
                      <td className="px-3 py-2 text-gray-700">{r.productName}</td>
                      <td className="px-3 py-2 text-gray-600">{r.investmentType}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{r.sipAmount ? formatCurrency(r.sipAmount) : '—'}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-800">{formatCurrency(r.yearlyContribution)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{r.commissionPercent}%</td>
                      <td className="px-3 py-2 text-right font-medium text-green-700">{formatCurrency(r.commissionAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

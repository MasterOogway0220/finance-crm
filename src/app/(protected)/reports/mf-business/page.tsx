'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'
import dynamic from 'next/dynamic'

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

export default function MFBusinessReportPage() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [range, setRange] = useState('MONTH')
  const [metric, setMetric] = useState<'sales' | 'commission'>('commission')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ year, range })
    if (range === 'MONTH') params.set('month', month)
    fetch(`/api/reports/mf-business?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [month, year, range])

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">MF Business Report</h1>
          <p className="text-sm text-gray-500">Mutual fund sales and commission analysis</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={metric} onValueChange={(v) => setMetric(v as 'sales' | 'commission')}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="commission">Total Commission</SelectItem>
              <SelectItem value="sales">Total Sales</SelectItem>
            </SelectContent>
          </Select>
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
              <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Link href="/reports">
            <Button size="sm" variant="secondary" className="gap-1.5 h-9">
              <ArrowLeft className="h-3.5 w-3.5" />Back
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-[320px] rounded-lg" />
          <Skeleton className="h-[320px] rounded-lg" />
        </div>
      ) : data && (
        <>
          {/* Bar Charts Row */}
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

          {/* Service-Business Split */}
          <ServiceBusinessSplitChart month={month} year={year} />

          {/* Pie Chart */}
          <div className="max-w-lg mx-auto">
            <MFDepartmentPieChart
              title={`Business Distribution - ${metricLabel} (${periodLabel})`}
              equity={pieEquity}
              mf={pieMF}
              valueLabel={metricLabel}
            />
          </div>
        </>
      )}
    </div>
  )
}

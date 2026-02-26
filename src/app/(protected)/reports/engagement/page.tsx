'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Users, TrendingUp, CalendarClock, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const REMARK_LABELS: Record<string, string> = {
  SUCCESSFULLY_TRADED: 'Traded',
  NOT_TRADED: 'Not Traded',
  NO_FUNDS_FOR_TRADING: 'No Funds',
  DID_NOT_ANSWER: 'No Answer',
  SELF_TRADING: 'Self Trading',
}

const REMARK_COLORS: Record<string, string> = {
  SUCCESSFULLY_TRADED: 'bg-green-500',
  NOT_TRADED: 'bg-red-400',
  NO_FUNDS_FOR_TRADING: 'bg-orange-400',
  DID_NOT_ANSWER: 'bg-gray-400',
  SELF_TRADING: 'bg-blue-400',
}

interface OperatorStat {
  operatorId: string
  operatorName: string
  total: number
  traded: number
  notTraded: number
  tradedPercent: number
  followUpCount: number
  remarks: Record<string, number>
}

interface ReportData {
  operators: OperatorStat[]
  totals: { total: number; traded: number; notTraded: number; tradedPercent: number; followUpCount: number }
}

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color: string
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function RemarkBar({ remarks, total }: { remarks: Record<string, number>; total: number }) {
  const allRemarks = ['SUCCESSFULLY_TRADED', 'NOT_TRADED', 'NO_FUNDS_FOR_TRADING', 'DID_NOT_ANSWER', 'SELF_TRADING']
  if (total === 0) return <span className="text-xs text-gray-400">No clients</span>
  return (
    <div className="space-y-1.5 w-full">
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 w-full">
        {allRemarks.map((r) => {
          const count = remarks[r] ?? 0
          const pct = total > 0 ? (count / total) * 100 : 0
          if (pct === 0) return null
          return (
            <div
              key={r}
              className={REMARK_COLORS[r]}
              style={{ width: `${pct}%` }}
              title={`${REMARK_LABELS[r]}: ${count}`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {allRemarks.map((r) => {
          const count = remarks[r] ?? 0
          if (count === 0) return null
          return (
            <span key={r} className="flex items-center gap-1 text-xs text-gray-500">
              <span className={`inline-block h-2 w-2 rounded-full ${REMARK_COLORS[r]}`} />
              {REMARK_LABELS[r]} ({count})
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function EngagementReportPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    setLoading(true)
    fetch('/api/reports/engagement')
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Client Engagement Report</h1>
            <p className="text-sm text-gray-500">Trading status and follow-up data per operator</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard icon={Users} label="Total Clients" value={data.totals.total} sub="across all operators" color="bg-purple-500" />
          <KpiCard icon={TrendingUp} label="Traded This Month" value={`${data.totals.traded} (${data.totals.tradedPercent}%)`} sub={`${data.totals.notTraded} not traded`} color="bg-green-500" />
          <KpiCard icon={CalendarClock} label="Follow-ups Scheduled" value={data.totals.followUpCount} sub="upcoming follow-up dates" color="bg-amber-500" />
        </div>
      ) : null}

      {/* Per-operator table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">Operator Breakdown</span>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-5 py-4">
                <Skeleton className="h-4 w-32 mb-3" />
                <Skeleton className="h-2 w-full mb-2" />
                <Skeleton className="h-3 w-48" />
              </div>
            ))}
          </div>
        ) : !data || data.operators.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">No data available</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.operators.map((op) => (
              <div key={op.operatorId} className="px-5 py-4 space-y-3">
                {/* Operator name + top stats */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-gray-800">{op.operatorName}</span>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span><span className="font-medium text-gray-700">{op.total}</span> clients</span>
                    <span>
                      <span className="font-medium text-green-600">{op.traded}</span> traded
                      <span className="ml-1 text-gray-400">({op.tradedPercent}%)</span>
                    </span>
                    {op.followUpCount > 0 && (
                      <span className="text-amber-600 font-medium">
                        {op.followUpCount} follow-up{op.followUpCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Traded progress bar */}
                <div className="space-y-1">
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
                    <div
                      className="bg-green-500 transition-all"
                      style={{ width: `${op.tradedPercent}%` }}
                    />
                  </div>
                </div>

                {/* Remark breakdown */}
                <RemarkBar remarks={op.remarks} total={op.total} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

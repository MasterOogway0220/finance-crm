'use client'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface OperatorRow {
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
}

interface OperatorTableProps {
  data: OperatorRow[]
  daysInMonth: number
  currentDay: number
}

export function OperatorTable({ data, daysInMonth, currentDay }: OperatorTableProps) {
  const totals = data.reduce(
    (acc, row) => {
      acc.totalClients += row.totalClients
      acc.tradedClients += row.tradedClients
      acc.notTraded += row.notTraded
      acc.didNotAnswer += row.didNotAnswer
      acc.monthlyTotal += row.monthlyTotal
      for (let d = 1; d <= daysInMonth; d++) {
        acc.dailyBreakdown[d] = (acc.dailyBreakdown[d] || 0) + (row.dailyBreakdown[d] || 0)
      }
      return acc
    },
    {
      totalClients: 0,
      tradedClients: 0,
      notTraded: 0,
      didNotAnswer: 0,
      monthlyTotal: 0,
      dailyBreakdown: {} as Record<number, number>,
    }
  )

  const totalTradedPct = totals.totalClients > 0
    ? ((totals.tradedClients / totals.totalClients) * 100).toFixed(2) + '%'
    : '0%'

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-800">
            <th className="sticky left-0 z-10 text-left px-4 py-3 text-white text-xs font-semibold uppercase tracking-wider min-w-[150px] bg-slate-800">
              Operator
            </th>
            {['Clients', 'Traded', 'Not Traded', 'Traded %', 'Amount %', 'DNA', 'Monthly (₹)'].map((h) => (
              <th key={h} className="px-3 py-3 text-white text-xs font-semibold uppercase tracking-wider text-center whitespace-nowrap">{h}</th>
            ))}
            {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
              <th key={day} className="px-2 py-3 text-white text-xs font-semibold text-center whitespace-nowrap min-w-[72px]">
                Day {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={row.operatorId}
              className={cn(
                'border-b border-border/50 hover:bg-accent/50 transition-colors',
                idx % 2 === 0 ? 'bg-card' : 'bg-muted/30'
              )}
            >
              <td className={cn('sticky left-0 z-10 px-4 py-3 font-semibold text-foreground', idx % 2 === 0 ? 'bg-card' : 'bg-muted/30')}>
                {row.operatorName}
              </td>
              <td className="px-3 py-3 text-center text-foreground tabular-nums">{row.totalClients}</td>
              <td className="px-3 py-3 text-center text-emerald-600 font-semibold tabular-nums">{row.tradedClients}</td>
              <td className="px-3 py-3 text-center text-red-600 tabular-nums">{row.notTraded}</td>
              <td className="px-3 py-3 text-center text-foreground tabular-nums">{row.tradedPercentage.toFixed(2)}%</td>
              <td className="px-3 py-3 text-center text-foreground tabular-nums">{row.tradedAmountPercent.toFixed(2)}%</td>
              <td className="px-3 py-3 text-center text-amber-600 tabular-nums">{row.didNotAnswer}</td>
              <td className="px-3 py-3 text-center font-semibold text-foreground tabular-nums">{formatCurrency(row.monthlyTotal)}</td>
              {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
                <td key={day} className="px-2 py-3 text-center text-muted-foreground text-xs tabular-nums">
                  {row.dailyBreakdown[day] ? formatCurrency(row.dailyBreakdown[day]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-blue-50 border-t-2 border-blue-200">
            <td className="sticky left-0 z-10 px-4 py-3 text-foreground bg-blue-50 uppercase text-xs tracking-wider">
              Total
            </td>
            <td className="px-3 py-3 text-center text-foreground tabular-nums">{totals.totalClients}</td>
            <td className="px-3 py-3 text-center text-emerald-700 tabular-nums">{totals.tradedClients}</td>
            <td className="px-3 py-3 text-center text-red-700 tabular-nums">{totals.notTraded}</td>
            <td className="px-3 py-3 text-center text-foreground tabular-nums">{totalTradedPct}</td>
            <td className="px-3 py-3 text-center text-foreground tabular-nums">100%</td>
            <td className="px-3 py-3 text-center text-amber-700 tabular-nums">{totals.didNotAnswer}</td>
            <td className="px-3 py-3 text-center text-foreground tabular-nums">{formatCurrency(totals.monthlyTotal)}</td>
            {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
              <td key={day} className="px-2 py-3 text-center text-foreground text-xs tabular-nums">
                {totals.dailyBreakdown[day] ? formatCurrency(totals.dailyBreakdown[day]) : '—'}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

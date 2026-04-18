'use client'
import { formatCurrency } from '@/lib/utils'

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
  /** Retained for backward compatibility with existing call sites;
   *  the table is bounded by `currentDay`, not `daysInMonth`. */
  daysInMonth: number
  currentDay: number
}

export function OperatorTable({ data, currentDay }: OperatorTableProps) {
  const totals = data.reduce(
    (acc, row) => {
      acc.totalClients += row.totalClients
      acc.tradedClients += row.tradedClients
      acc.notTraded += row.notTraded
      acc.didNotAnswer += row.didNotAnswer
      acc.monthlyTotal += row.monthlyTotal
      for (let d = 1; d <= currentDay; d++) {
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

  const stickyBg = 'var(--dash-surface, #ffffff)'

  return (
    <div
      className="overflow-x-auto dash-card dash-card--flush"
      style={{ borderRadius: 14 }}
    >
      <table className="dash-table">
        <thead>
          <tr>
            <th
              className="sticky left-0 z-10"
              style={{
                background: '#f7f8fb',
                minWidth: 150,
                textAlign: 'left',
              }}
            >
              Operator
            </th>
            {['Clients', 'Traded', 'Not Traded', 'Traded %', 'Amount %', 'DNA', 'Monthly (₹)'].map((h) => (
              <th key={h} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
            {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
              <th key={day} style={{ textAlign: 'center', whiteSpace: 'nowrap', minWidth: 72 }}>
                Day {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.operatorId}>
              <td
                className="sticky left-0 z-10 font-semibold"
                style={{ background: stickyBg, color: 'var(--dash-ink, #0b0b0f)' }}
              >
                {row.operatorName}
              </td>
              <td className="dash-num" style={{ textAlign: 'center' }}>{row.totalClients}</td>
              <td
                className="dash-num"
                style={{ textAlign: 'center', color: 'var(--dash-success, #009966)', fontWeight: 600 }}
              >
                {row.tradedClients}
              </td>
              <td
                className="dash-num"
                style={{ textAlign: 'center', color: 'var(--dash-accent, #e31e24)' }}
              >
                {row.notTraded}
              </td>
              <td className="dash-num" style={{ textAlign: 'center' }}>{row.tradedPercentage.toFixed(2)}%</td>
              <td className="dash-num" style={{ textAlign: 'center' }}>{row.tradedAmountPercent.toFixed(2)}%</td>
              <td
                className="dash-num"
                style={{ textAlign: 'center', color: 'var(--dash-warning, #f5a70d)' }}
              >
                {row.didNotAnswer}
              </td>
              <td
                className="dash-num"
                style={{ textAlign: 'center', fontWeight: 600 }}
              >
                {formatCurrency(row.monthlyTotal)}
              </td>
              {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
                <td
                  key={day}
                  className="dash-num"
                  style={{ textAlign: 'center', color: 'var(--dash-muted, #6b7280)', fontSize: 12 }}
                >
                  {row.dailyBreakdown[day] ? formatCurrency(row.dailyBreakdown[day]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td
              className="sticky left-0 z-10"
              style={{ background: stickyBg, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.02em' }}
            >
              Total
            </td>
            <td className="dash-num" style={{ textAlign: 'center' }}>{totals.totalClients}</td>
            <td
              className="dash-num dash-total-amount"
              style={{ textAlign: 'center' }}
            >
              {totals.tradedClients}
            </td>
            <td
              className="dash-num"
              style={{ textAlign: 'center', color: 'var(--dash-accent, #e31e24)' }}
            >
              {totals.notTraded}
            </td>
            <td className="dash-num" style={{ textAlign: 'center' }}>{totalTradedPct}</td>
            <td className="dash-num" style={{ textAlign: 'center' }}>100%</td>
            <td
              className="dash-num"
              style={{ textAlign: 'center', color: 'var(--dash-warning, #f5a70d)' }}
            >
              {totals.didNotAnswer}
            </td>
            <td className="dash-num" style={{ textAlign: 'center' }}>{formatCurrency(totals.monthlyTotal)}</td>
            {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
              <td key={day} className="dash-num" style={{ textAlign: 'center', fontSize: 12 }}>
                {totals.dailyBreakdown[day] ? formatCurrency(totals.dailyBreakdown[day]) : '—'}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

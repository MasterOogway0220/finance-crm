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
  // Compute totals row
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
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ backgroundColor: '#2E7D32' }}>
            <th className="sticky left-0 z-10 text-left px-3 py-3 text-white font-semibold min-w-[150px]" style={{ backgroundColor: '#2E7D32' }}>
              Operator
            </th>
            <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">Clients</th>
            <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">Traded</th>
            <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">Not Traded</th>
            <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">Traded %</th>
            <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">Amount %</th>
            <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap">DNA</th>
            <th className="px-3 py-3 text-white font-semibold text-center whitespace-nowrap min-w-[100px]">Monthly (₹)</th>
            {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
              <th key={day} className="px-2 py-3 text-white font-semibold text-center whitespace-nowrap min-w-[70px]">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={row.operatorId}
              className={cn('border-b border-gray-100 hover:bg-blue-50 transition-colors', idx % 2 === 0 ? 'bg-white' : 'bg-gray-50')}
            >
              <td className={cn('sticky left-0 z-10 px-3 py-2.5 font-semibold text-gray-800', idx % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                {row.operatorName}
              </td>
              <td className="px-3 py-2.5 text-center text-gray-700">{row.totalClients}</td>
              <td className="px-3 py-2.5 text-center text-green-700 font-medium">{row.tradedClients}</td>
              <td className="px-3 py-2.5 text-center text-red-600">{row.notTraded}</td>
              <td className="px-3 py-2.5 text-center text-gray-700">{row.tradedPercentage.toFixed(2)}%</td>
              <td className="px-3 py-2.5 text-center text-gray-700">{row.tradedAmountPercent.toFixed(2)}%</td>
              <td className="px-3 py-2.5 text-center text-amber-700">{row.didNotAnswer}</td>
              <td className="px-3 py-2.5 text-center font-semibold text-gray-800">{formatCurrency(row.monthlyTotal)}</td>
              {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
                <td key={day} className="px-2 py-2.5 text-center text-gray-600 text-xs">
                  {row.dailyBreakdown[day] ? formatCurrency(row.dailyBreakdown[day]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold" style={{ backgroundColor: '#e8f5e9' }}>
            <td className="sticky left-0 z-10 px-3 py-3 text-gray-900" style={{ backgroundColor: '#e8f5e9' }}>
              TOTAL
            </td>
            <td className="px-3 py-3 text-center text-gray-900">{totals.totalClients}</td>
            <td className="px-3 py-3 text-center text-green-800">{totals.tradedClients}</td>
            <td className="px-3 py-3 text-center text-red-700">{totals.notTraded}</td>
            <td className="px-3 py-3 text-center text-gray-900">{totalTradedPct}</td>
            <td className="px-3 py-3 text-center text-gray-900">100%</td>
            <td className="px-3 py-3 text-center text-amber-800">{totals.didNotAnswer}</td>
            <td className="px-3 py-3 text-center text-gray-900">{formatCurrency(totals.monthlyTotal)}</td>
            {Array.from({ length: currentDay }, (_, i) => i + 1).map((day) => (
              <td key={day} className="px-2 py-3 text-center text-gray-800 text-xs">
                {totals.dailyBreakdown[day] ? formatCurrency(totals.dailyBreakdown[day]) : '—'}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

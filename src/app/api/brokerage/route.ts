import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))

    const userRole = getEffectiveRole(session.user)

    // Build date range for the requested month
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)

    // Build last 6 months + current for brokerage chart
    const months: Array<{ label: string; start: Date; end: Date }> = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1)
      const s = new Date(d.getFullYear(), d.getMonth(), 1)
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' })
      months.push({ label, start: s, end: e })
    }
    const brokerageMonths = months.map((m) => m.label)

    // Fetch all equity dealers
    const equityDealerWhere: Record<string, unknown> = {
      role: 'EQUITY_DEALER',
      isActive: true,
    }

    if (userRole === 'EQUITY_DEALER') {
      equityDealerWhere.id = session.user.id
    }

    const operators = await prisma.employee.findMany({
      where: equityDealerWhere,
      select: { id: true, name: true },
    })

    // Fetch brokerage uploads for the month
    const uploads = await prisma.brokerageUpload.findMany({
      where: { uploadDate: { gte: monthStart, lte: monthEnd } },
      include: {
        details: { select: { operatorId: true, amount: true } },
      },
    })

    // Flatten details with dates
    type DetailEntry = { operatorId: string; amount: number; day: number }
    const allDetails: DetailEntry[] = []
    for (const upload of uploads) {
      const day = new Date(upload.uploadDate).getDate()
      for (const detail of upload.details) {
        allDetails.push({ operatorId: detail.operatorId, amount: detail.amount, day })
      }
    }

    // Total monthly brokerage across all operators (for tradedAmountPercent)
    const totalMonthlyBrokerage = allDetails.reduce((sum, d) => sum + d.amount, 0)

    // Build performance data per operator
    const operatorPerformance = await Promise.all(
      operators.map(async (op) => {
        const opDetails = allDetails.filter((d) => d.operatorId === op.id)
        const monthlyTotal = opDetails.reduce((sum, d) => sum + d.amount, 0)

        // Daily breakdown with number keys
        const dailyBreakdown: Record<number, number> = {}
        for (const d of opDetails) {
          dailyBreakdown[d.day] = (dailyBreakdown[d.day] ?? 0) + d.amount
        }

        // Client stats
        const [totalClients, tradedClients, didNotAnswer] = await Promise.all([
          prisma.client.count({ where: { operatorId: op.id } }),
          prisma.client.count({ where: { operatorId: op.id, status: 'TRADED' } }),
          prisma.client.count({ where: { operatorId: op.id, remark: 'DID_NOT_ANSWER' } }),
        ])

        const notTraded = totalClients - tradedClients
        const tradedPercentage = totalClients > 0 ? (tradedClients / totalClients) * 100 : 0
        const tradedAmountPercent = totalMonthlyBrokerage > 0 ? (monthlyTotal / totalMonthlyBrokerage) * 100 : 0

        // Monthly history for chart (last 7 months)
        const monthlyHistoryRaw = await Promise.all(
          months.map((m) =>
            prisma.brokerageDetail.aggregate({
              _sum: { amount: true },
              where: { operatorId: op.id, brokerage: { uploadDate: { gte: m.start, lte: m.end } } },
            })
          )
        )
        const monthlyHistory: Record<string, number> = {}
        for (let i = 0; i < months.length; i++) {
          monthlyHistory[months[i].label] = monthlyHistoryRaw[i]._sum.amount ?? 0
        }

        return {
          operatorId: op.id,
          operatorName: op.name,
          totalClients,
          tradedClients,
          notTraded,
          tradedPercentage,
          tradedAmountPercent,
          didNotAnswer,
          monthlyTotal,
          dailyBreakdown,
          monthlyHistory,
        }
      })
    )

    // Build brokerage chart data — one row per operator
    const brokerageChartData = operatorPerformance.map((op) => ({
      name: op.operatorName,
      ...op.monthlyHistory,
    }))

    // Strip monthlyHistory before returning operatorPerformance
    const operatorPerformanceOut = operatorPerformance.map(
      ({ monthlyHistory: _mh, ...rest }) => rest
    )

    return NextResponse.json({
      success: true,
      data: { month, year, operatorPerformance: operatorPerformanceOut, brokerageChartData, brokerageMonths },
    })
  } catch (error) {
    console.error('[GET /api/brokerage]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

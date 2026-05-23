import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isCurrentMonth } from '@/lib/utils'

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

    const userRole = (await getActiveRole(session.user))

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

    // Window covering all 7 months for history query
    const historyStart = months[0].start
    const historyEnd = months[months.length - 1].end

    // Fetch all equity dealers
    const equityDealerWhere: Record<string, unknown> = { role: 'EQUITY_DEALER', isActive: true }
    if (userRole === 'EQUITY_DEALER') equityDealerWhere.id = session.user.id

    const operators = await prisma.employee.findMany({
      where: equityDealerWhere,
      select: { id: true, name: true },
    })

    const operatorIds = operators.map((o) => o.id)

    // Hybrid attribution requires two queries:
    //   - history (covers all 7 months including current): snapshot for past, current-owner
    //     for the current month. Split into two queries and union.
    //   - current month details: same logic.
    // We fetch current-month rows once and reuse them for both the month summary and the
    // current-month bucket of the history chart, to avoid a third round-trip.
    const isCurrentRequested = isCurrentMonth(month, year)

    // Past-month range = historyStart..(monthStart - 1ms) when current month is in the window,
    // or historyStart..historyEnd if no overlap. Computed via `lt: monthStart` to keep ranges disjoint.
    const pastHistoryEnd = isCurrentRequested ? new Date(monthStart.getTime() - 1) : historyEnd

    const [
      curMonthDetails,           // current-month rows under current-owner attribution
      pastHistoryDetails,        // past-month rows under snapshot attribution (within the 7-month window)
      allClientCounts, dnaCounts,
    ] = await Promise.all([
      // Current-month details (only fetched if the requested month is the current calendar month;
      // otherwise this returns []) — used for both this-month KPIs and the current-month bar in history chart.
      isCurrentRequested
        ? prisma.brokerageDetail.findMany({
            where: {
              clientId: { not: null },
              client: { operatorId: { in: operatorIds } },
              brokerage: { isActive: true, uploadDate: { gte: monthStart, lte: monthEnd } },
            },
            select: {
              amount: true,
              clientId: true,
              client: { select: { operatorId: true } },
              brokerage: { select: { uploadDate: true } },
            },
          })
        : prisma.brokerageDetail.findMany({
            // Requested month is a closed month → snapshot attribution.
            where: {
              clientId: { not: null },
              operatorId: { in: operatorIds },
              brokerage: { isActive: true, uploadDate: { gte: monthStart, lte: monthEnd } },
            },
            select: {
              amount: true,
              clientId: true,
              operatorId: true,
              brokerage: { select: { uploadDate: true } },
            },
          }),

      // Past-month history within the 7-month window, snapshot attribution.
      pastHistoryEnd >= historyStart
        ? prisma.brokerageDetail.findMany({
            where: {
              clientId: { not: null },
              operatorId: { in: operatorIds },
              brokerage: { isActive: true, uploadDate: { gte: historyStart, lte: pastHistoryEnd } },
            },
            select: {
              amount: true,
              operatorId: true,
              brokerage: { select: { uploadDate: true } },
            },
          })
        : Promise.resolve([] as Array<{ amount: number; operatorId: string; brokerage: { uploadDate: Date } }>),

      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds } }, _count: { id: true } }),
      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds }, remark: 'DID_NOT_ANSWER' }, _count: { id: true } }),
    ])

    // Build O(1) lookup maps for client counts
    const totalMap = new Map(allClientCounts.map((r) => [r.operatorId, r._count.id]))
    const dnaMap   = new Map(dnaCounts.map((r) => [r.operatorId, r._count.id]))

    // Flatten current-month details, taking operator from the right field based on which
    // attribution applies to the requested month.
    type DetailEntry = { operatorId: string; clientId: string | null; amount: number; day: number }
    const allDetails: DetailEntry[] = []
    for (const d of curMonthDetails) {
      const day = new Date(d.brokerage.uploadDate).getDate()
      const ownerId = isCurrentRequested
        ? (d as { client: { operatorId: string } }).client.operatorId
        : (d as { operatorId: string }).operatorId
      allDetails.push({ operatorId: ownerId, clientId: d.clientId, amount: d.amount, day })
    }
    const totalMonthlyBrokerage = allDetails.reduce((sum, d) => sum + d.amount, 0)

    // Derive traded clients from brokerage records for the selected month
    // (distinct clients per current-owner who appear in any upload within monthStart..monthEnd)
    const tradedSets = new Map<string, Set<string>>()
    for (const d of allDetails) {
      if (d.clientId) {
        if (!tradedSets.has(d.operatorId)) tradedSets.set(d.operatorId, new Set())
        tradedSets.get(d.operatorId)!.add(d.clientId)
      }
    }
    const tradedMap = new Map([...tradedSets.entries()].map(([id, set]) => [id, set.size]))

    // Group monthly total + daily breakdown per current-owner
    const monthlyTotalMap = new Map<string, number>()
    const dailyMap        = new Map<string, Record<number, number>>()
    for (const d of allDetails) {
      monthlyTotalMap.set(d.operatorId, (monthlyTotalMap.get(d.operatorId) ?? 0) + d.amount)
      const daily = dailyMap.get(d.operatorId) ?? {}
      daily[d.day] = (daily[d.day] ?? 0) + d.amount
      dailyMap.set(d.operatorId, daily)
    }

    // Group 7-month history per operator + month label. Past months come from
    // pastHistoryDetails (snapshot attribution); the current month bucket comes from
    // curMonthDetails (current-owner attribution if the requested month is current,
    // otherwise the request is for a past month and curMonthDetails uses snapshot).
    const historyMap = new Map<string, Record<string, number>>()
    for (const d of pastHistoryDetails) {
      const label = new Date(d.brokerage.uploadDate).toLocaleString('default', { month: 'short', year: '2-digit' })
      const opHist = historyMap.get(d.operatorId) ?? {}
      opHist[label] = (opHist[label] ?? 0) + d.amount
      historyMap.set(d.operatorId, opHist)
    }
    for (const d of allDetails) {
      // allDetails already has the correct attributed operatorId (from Step 3).
      const label = new Date(year, month - 1, d.day).toLocaleString('default', { month: 'short', year: '2-digit' })
      const opHist = historyMap.get(d.operatorId) ?? {}
      opHist[label] = (opHist[label] ?? 0) + d.amount
      historyMap.set(d.operatorId, opHist)
    }

    // Assemble per-operator performance from maps
    const operatorPerformance = operators.map((op) => {
      const totalClients  = totalMap.get(op.id)  ?? 0
      const tradedClients = tradedMap.get(op.id) ?? 0
      const didNotAnswer  = dnaMap.get(op.id)    ?? 0
      const monthlyTotal  = monthlyTotalMap.get(op.id) ?? 0
      const dailyBreakdown = dailyMap.get(op.id) ?? {}
      const opHist        = historyMap.get(op.id) ?? {}
      const monthlyHistory: Record<string, number> = {}
      for (const m of months) monthlyHistory[m.label] = opHist[m.label] ?? 0

      return {
        operatorId: op.id,
        operatorName: op.name,
        totalClients,
        tradedClients,
        notTraded: totalClients - tradedClients,
        tradedPercentage: totalClients > 0 ? (tradedClients / totalClients) * 100 : 0,
        tradedAmountPercent: totalMonthlyBrokerage > 0 ? (monthlyTotal / totalMonthlyBrokerage) * 100 : 0,
        didNotAnswer,
        monthlyTotal,
        dailyBreakdown,
        monthlyHistory,
      }
    })

    // Build brokerage chart data — one row per operator
    const brokerageChartData = operatorPerformance.map((op) => ({ name: op.operatorName, ...op.monthlyHistory }))

    // Strip monthlyHistory before returning operatorPerformance
    const operatorPerformanceOut = operatorPerformance.map(({ monthlyHistory: _mh, ...rest }) => rest)

    return NextResponse.json({
      success: true,
      data: { month, year, operatorPerformance: operatorPerformanceOut, brokerageChartData, brokerageMonths },
    })
  } catch (error) {
    console.error('[GET /api/brokerage]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

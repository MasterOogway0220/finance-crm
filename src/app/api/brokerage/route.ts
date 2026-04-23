import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    // ── Batch all data in one parallel round-trip ──────────────────────────
    const [
      uploads,
      allClientCounts, dnaCounts,
      historyDetails,
    ] = await Promise.all([
      // Current month brokerage uploads (for monthly total + daily breakdown + traded clients)
      prisma.brokerageUpload.findMany({
        where: { uploadDate: { gte: monthStart, lte: monthEnd } },
        include: {
          details: { where: { clientId: { not: null } }, select: { operatorId: true, clientId: true, amount: true } },
        },
      }),
      // Total clients per operator (current assignment — used as denominator)
      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds } }, _count: { id: true } }),
      // DID_NOT_ANSWER per operator (live call-status, separate from traded)
      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds }, remark: 'DID_NOT_ANSWER' }, _count: { id: true } }),
      // Full 7-month history (one query replaces N×7 aggregates)
      prisma.brokerageDetail.findMany({
        where: { operatorId: { in: operatorIds }, clientId: { not: null }, brokerage: { uploadDate: { gte: historyStart, lte: historyEnd } } },
        select: { operatorId: true, amount: true, brokerage: { select: { uploadDate: true } } },
      }),
    ])

    // Build O(1) lookup maps for client counts
    const totalMap = new Map(allClientCounts.map((r) => [r.operatorId, r._count.id]))
    const dnaMap   = new Map(dnaCounts.map((r) => [r.operatorId, r._count.id]))

    // Flatten current-month upload details with day numbers
    // clientId is included so we can derive month-scoped traded counts
    type DetailEntry = { operatorId: string; clientId: string | null; amount: number; day: number }
    const allDetails: DetailEntry[] = []
    for (const upload of uploads) {
      const day = new Date(upload.uploadDate).getDate()
      for (const detail of upload.details) {
        allDetails.push({ operatorId: detail.operatorId, clientId: detail.clientId, amount: detail.amount, day })
      }
    }
    const totalMonthlyBrokerage = allDetails.reduce((sum, d) => sum + d.amount, 0)

    // Derive traded clients from brokerage records for the selected month
    // (distinct clients per operator who appear in any upload within monthStart..monthEnd)
    const tradedSets = new Map<string, Set<string>>()
    for (const d of allDetails) {
      if (d.clientId) {
        if (!tradedSets.has(d.operatorId)) tradedSets.set(d.operatorId, new Set())
        tradedSets.get(d.operatorId)!.add(d.clientId)
      }
    }
    const tradedMap = new Map([...tradedSets.entries()].map(([id, set]) => [id, set.size]))

    // Group monthly total + daily breakdown per operator
    const monthlyTotalMap = new Map<string, number>()
    const dailyMap        = new Map<string, Record<number, number>>()
    for (const d of allDetails) {
      monthlyTotalMap.set(d.operatorId, (monthlyTotalMap.get(d.operatorId) ?? 0) + d.amount)
      const daily = dailyMap.get(d.operatorId) ?? {}
      daily[d.day] = (daily[d.day] ?? 0) + d.amount
      dailyMap.set(d.operatorId, daily)
    }

    // Group 7-month history per operator + month label
    const historyMap = new Map<string, Record<string, number>>()
    for (const d of historyDetails) {
      const label = new Date(d.brokerage.uploadDate).toLocaleString('default', { month: 'short', year: '2-digit' })
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

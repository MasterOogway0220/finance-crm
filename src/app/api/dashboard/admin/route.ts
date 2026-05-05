import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMonthRange, isCurrentMonth } from '@/lib/utils'
import { getCached, setCache } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = getEffectiveRole(session.user)
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))
    if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
      return NextResponse.json({ success: false, error: 'Invalid month/year' }, { status: 400 })
    }
    const currentMonth = isCurrentMonth(month, year)

    const cacheKey = `dashboard:admin:${month}:${year}`
    const cached = getCached<Record<string, unknown>>(cacheKey)
    if (cached) return NextResponse.json({ success: true, data: cached })

    const { start, end } = getMonthRange(month, year)

    // Previous month for brokerage trend comparison
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const { start: lastStart, end: lastEnd } = getMonthRange(prevMonth, prevYear)

    // Build 12-month range for selected year (for brokerage chart)
    const months: Array<{ label: string; start: Date; end: Date }> = []
    for (let m = 0; m < 12; m++) {
      const s = new Date(year, m, 1)
      const e = new Date(year, m + 1, 0, 23, 59, 59)
      months.push({ label: s.toLocaleString('default', { month: 'short', year: '2-digit' }), start: s, end: e })
    }
    const yearStart = new Date(year, 0, 1)
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59)
    const brokerageMonths = months.map((m) => m.label)

    const [
      totalEmployees, equityCount, mfCount,
      pendingTasks, overdueTasks, completedTasks, expiredTasks,
      brokerageSum, lastMonthBrokerageSum, operators, mfBusinessAgg, closedClientsCount,
    ] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.client.count({ where: { department: 'EQUITY' } }),
      prisma.client.count({ where: { department: 'MUTUAL_FUND' } }),
      prisma.task.count({ where: { status: 'PENDING', createdAt: { gte: start, lte: end } } }),
      prisma.task.count({ where: { status: 'PENDING', deadline: { lt: currentMonth ? now : end }, createdAt: { gte: start, lte: end } } }),
      prisma.task.count({ where: { status: 'COMPLETED', createdAt: { gte: start, lte: end } } }),
      prisma.task.count({ where: { status: 'EXPIRED', createdAt: { gte: start, lte: end } } }),
      prisma.brokerageDetail.aggregate({ _sum: { amount: true }, where: { brokerage: { isActive: true, uploadDate: { gte: start, lte: end } } } }),
      prisma.brokerageDetail.aggregate({ _sum: { amount: true }, where: { brokerage: { isActive: true, uploadDate: { gte: lastStart, lte: lastEnd } } } }),
      prisma.employee.findMany({ where: { role: 'EQUITY_DEALER', isActive: true }, select: { id: true, name: true } }),
      prisma.mFBusiness.aggregate({
        _sum: { yearlyContribution: true, commissionAmount: true },
        where: { businessDate: { gte: start, lte: end } },
      }),
      prisma.closedClient.count(),
    ])

    const monthlyBrokerage    = brokerageSum._sum.amount ?? 0
    const lastMonthBrokerage  = lastMonthBrokerageSum._sum.amount ?? 0
    const operatorIds         = operators.map((o) => o.id)

    const [allClientCounts, dnaCounts] = await Promise.all([
      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds } }, _count: { id: true } }),
      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds }, remark: 'DID_NOT_ANSWER' }, _count: { id: true } }),
    ])

    const totalMap = new Map(allClientCounts.map((r) => [r.operatorId, r._count.id]))
    const dnaMap   = new Map(dnaCounts.map((r) => [r.operatorId, r._count.id]))

    // Always derive traded counts from BrokerageDetail — Client.status accumulates across
    // uploads and is not reliably reset, so it diverges from actual brokerage data.
    const monthlyTotalMap = new Map<string, number>()
    const dailyMap        = new Map<string, Record<number, number>>()

    const monthDetails = await prisma.brokerageDetail.findMany({
      where: { operatorId: { in: operatorIds }, clientId: { not: null }, brokerage: { isActive: true, uploadDate: { gte: start, lte: end } } },
      select: { operatorId: true, clientId: true, amount: true, brokerage: { select: { uploadDate: true } } },
    })
    const tradedSets = new Map<string, Set<string>>()
    const allTradedIds = new Set<string>()
    for (const d of monthDetails) {
      if (d.clientId) {
        if (!tradedSets.has(d.operatorId)) tradedSets.set(d.operatorId, new Set())
        tradedSets.get(d.operatorId)!.add(d.clientId)
        allTradedIds.add(d.clientId)
      }
      monthlyTotalMap.set(d.operatorId, (monthlyTotalMap.get(d.operatorId) ?? 0) + d.amount)
      const daily = dailyMap.get(d.operatorId) ?? {}
      const day   = new Date(d.brokerage.uploadDate).getDate()
      daily[day]  = (daily[day] ?? 0) + d.amount
      dailyMap.set(d.operatorId, daily)
    }
    const tradedMap     = new Map([...tradedSets.entries()].map(([id, set]) => [id, set.size]))
    const tradedClients = allTradedIds.size

    const yearDetails = await prisma.brokerageDetail.findMany({
      where: { operatorId: { in: operatorIds }, clientId: { not: null }, brokerage: { isActive: true, uploadDate: { gte: yearStart, lte: yearEnd } } },
      select: { operatorId: true, amount: true, brokerage: { select: { uploadDate: true } } },
    })

    const historyMap = new Map<string, Record<string, number>>()
    for (const d of yearDetails) {
      const label = new Date(d.brokerage.uploadDate).toLocaleString('default', { month: 'short', year: '2-digit' })
      const opHist = historyMap.get(d.operatorId) ?? {}
      opHist[label] = (opHist[label] ?? 0) + d.amount
      historyMap.set(d.operatorId, opHist)
    }

    const operatorPerformance = operators.map((op) => {
      const opTotal        = totalMap.get(op.id)  ?? 0
      const opTraded       = tradedMap.get(op.id) ?? 0
      const opDNA          = dnaMap.get(op.id)    ?? 0
      const monthlyTotal   = monthlyTotalMap.get(op.id) ?? 0
      const dailyBreakdown = dailyMap.get(op.id)  ?? {}
      const opHistory      = historyMap.get(op.id) ?? {}
      const monthlyHistory: Record<string, number> = {}
      for (const m of months) monthlyHistory[m.label] = opHistory[m.label] ?? 0

      return {
        operatorId: op.id,
        operatorName: op.name,
        totalClients: opTotal,
        tradedClients: opTraded,
        notTraded: opTotal - opTraded,
        tradedPercentage: opTotal > 0 ? (opTraded / opTotal) * 100 : 0,
        tradedAmountPercent: monthlyBrokerage > 0 ? (monthlyTotal / monthlyBrokerage) * 100 : 0,
        didNotAnswer: opDNA,
        monthlyTotal,
        dailyBreakdown,
        monthlyHistory,
      }
    })

    const brokerageChartData = operatorPerformance.map((op) => ({ name: op.operatorName, ...op.monthlyHistory }))

    const responseData = {
      totalEmployees,
      totalClients: equityCount + mfCount,
      equityClients: equityCount,
      mfClients: mfCount,
      closedClients: closedClientsCount,
      monthlyBrokerage,
      lastMonthBrokerage,
      tradedClients,
      totalEquityClients: equityCount,
      pendingTasks,
      overdueTasks,
      mfTotalSales: mfBusinessAgg._sum.yearlyContribution ?? 0,
      mfTotalCommission: mfBusinessAgg._sum.commissionAmount ?? 0,
      taskStats: { pending: pendingTasks, completed: completedTasks, expired: expiredTasks },
      operatorPerformance: operatorPerformance.map(({ monthlyHistory: _mh, ...rest }) => rest),
      brokerageChartData,
      brokerageMonths,
    }

    // Short TTL for current month (reflects client changes quickly); longer for past months
    setCache(cacheKey, responseData, currentMonth ? 10 : 300)

    return NextResponse.json({ success: true, data: responseData })
  } catch (error) {
    console.error('[GET /api/dashboard/admin]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

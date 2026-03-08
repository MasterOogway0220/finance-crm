import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentMonthRange, getLastMonthRange } from '@/lib/utils'
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

    const cacheKey = 'dashboard:admin'
    const cached = getCached<Record<string, unknown>>(cacheKey)
    if (cached) return NextResponse.json({ success: true, data: cached })

    const { start, end } = getCurrentMonthRange()
    const { start: lastStart, end: lastEnd } = getLastMonthRange()
    const now = new Date()

    // ── Build 12-month range for the current year ──────────────────────────
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const yearEnd   = new Date(now.getFullYear(), 11, 31, 23, 59, 59)
    const months: Array<{ label: string; start: Date; end: Date }> = []
    for (let m = 0; m < 12; m++) {
      const s = new Date(now.getFullYear(), m, 1)
      const e = new Date(now.getFullYear(), m + 1, 0, 23, 59, 59)
      months.push({ label: s.toLocaleString('default', { month: 'short', year: '2-digit' }), start: s, end: e })
    }
    const brokerageMonths = months.map((m) => m.label)

    // ── All top-level stats + operators in one parallel batch ──────────────
    const [
      totalEmployees, equityCount, mfCount, tradedClients,
      pendingTasks, overdueTasks, completedTasks, expiredTasks,
      brokerageSum, lastMonthBrokerageSum, operators, mfBusinessAgg,
    ] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.client.count({ where: { department: 'EQUITY' } }),
      prisma.client.count({ where: { department: 'MUTUAL_FUND' } }),
      prisma.client.count({ where: { status: 'TRADED' } }),
      prisma.task.count({ where: { status: 'PENDING' } }),
      prisma.task.count({ where: { status: 'PENDING', deadline: { lt: now } } }),
      prisma.task.count({ where: { status: 'COMPLETED' } }),
      prisma.task.count({ where: { status: 'EXPIRED' } }),
      prisma.brokerageDetail.aggregate({ _sum: { amount: true }, where: { brokerage: { uploadDate: { gte: start, lte: end } } } }),
      prisma.brokerageDetail.aggregate({ _sum: { amount: true }, where: { brokerage: { uploadDate: { gte: lastStart, lte: lastEnd } } } }),
      prisma.employee.findMany({ where: { role: 'EQUITY_DEALER', isActive: true }, select: { id: true, name: true } }),
      prisma.mFBusiness.aggregate({
        _sum: { yearlyContribution: true, commissionAmount: true },
        where: { businessDate: { gte: start, lte: end } },
      }),
    ])

    const monthlyBrokerage    = brokerageSum._sum.amount ?? 0
    const lastMonthBrokerage  = lastMonthBrokerageSum._sum.amount ?? 0
    const operatorIds         = operators.map((o) => o.id)

    // ── Batch all per-operator data — 5 queries instead of N×16 ───────────
    const [
      allClientCounts, tradedCounts, dnaCounts,
      currentMonthDetails, yearDetails,
    ] = await Promise.all([
      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds } }, _count: { id: true } }),
      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds }, status: 'TRADED' }, _count: { id: true } }),
      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds }, remark: 'DID_NOT_ANSWER' }, _count: { id: true } }),
      prisma.brokerageDetail.findMany({
        where: { operatorId: { in: operatorIds }, clientId: { not: null }, brokerage: { uploadDate: { gte: start, lte: end } } },
        select: { operatorId: true, amount: true, brokerage: { select: { uploadDate: true } } },
      }),
      prisma.brokerageDetail.findMany({
        where: { operatorId: { in: operatorIds }, clientId: { not: null }, brokerage: { uploadDate: { gte: yearStart, lte: yearEnd } } },
        select: { operatorId: true, amount: true, brokerage: { select: { uploadDate: true } } },
      }),
    ])

    // Build O(1) lookup maps
    const totalMap   = new Map(allClientCounts.map((r) => [r.operatorId, r._count.id]))
    const tradedMap  = new Map(tradedCounts.map((r) => [r.operatorId, r._count.id]))
    const dnaMap     = new Map(dnaCounts.map((r) => [r.operatorId, r._count.id]))

    const monthlyTotalMap = new Map<string, number>()
    const dailyMap        = new Map<string, Record<number, number>>()
    for (const d of currentMonthDetails) {
      monthlyTotalMap.set(d.operatorId, (monthlyTotalMap.get(d.operatorId) ?? 0) + d.amount)
      const daily = dailyMap.get(d.operatorId) ?? {}
      const day   = new Date(d.brokerage.uploadDate).getDate()
      daily[day]  = (daily[day] ?? 0) + d.amount
      dailyMap.set(d.operatorId, daily)
    }

    const historyMap = new Map<string, Record<string, number>>()
    for (const d of yearDetails) {
      const label = new Date(d.brokerage.uploadDate).toLocaleString('default', { month: 'short', year: '2-digit' })
      const opHist = historyMap.get(d.operatorId) ?? {}
      opHist[label] = (opHist[label] ?? 0) + d.amount
      historyMap.set(d.operatorId, opHist)
    }

    const operatorPerformance = operators.map((op) => {
      const opTotal       = totalMap.get(op.id)   ?? 0
      const opTraded      = tradedMap.get(op.id)  ?? 0
      const opDNA         = dnaMap.get(op.id)     ?? 0
      const monthlyTotal  = monthlyTotalMap.get(op.id) ?? 0
      const dailyBreakdown = dailyMap.get(op.id)  ?? {}
      const opHistory     = historyMap.get(op.id) ?? {}
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

    setCache(cacheKey, responseData, 60)

    return NextResponse.json({ success: true, data: responseData })
  } catch (error) {
    console.error('[GET /api/dashboard/admin]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

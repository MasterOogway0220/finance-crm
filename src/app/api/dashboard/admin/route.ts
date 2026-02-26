import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentMonthRange, getLastMonthRange } from '@/lib/utils'
import { Role } from '@prisma/client'

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

    const { start, end } = getCurrentMonthRange()
    const { start: lastStart, end: lastEnd } = getLastMonthRange()
    const now = new Date()

    const [
      totalEmployees,
      equityCount,
      mfCount,
      tradedClients,
      pendingTasks,
      overdueTasks,
      completedTasks,
      expiredTasks,
      brokerageSum,
      lastMonthBrokerageSum,
      operators,
    ] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.client.count({ where: { department: 'EQUITY' } }),
      prisma.client.count({ where: { department: 'MUTUAL_FUND' } }),
      prisma.client.count({ where: { status: 'TRADED' } }),
      prisma.task.count({ where: { status: 'PENDING' } }),
      prisma.task.count({ where: { status: 'PENDING', deadline: { lt: now } } }),
      prisma.task.count({ where: { status: 'COMPLETED' } }),
      prisma.task.count({ where: { status: 'EXPIRED' } }),
      prisma.brokerageDetail.aggregate({
        _sum: { amount: true },
        where: { brokerage: { uploadDate: { gte: start, lte: end } } },
      }),
      prisma.brokerageDetail.aggregate({
        _sum: { amount: true },
        where: { brokerage: { uploadDate: { gte: lastStart, lte: lastEnd } } },
      }),
      prisma.employee.findMany({
        where: { role: 'EQUITY_DEALER', isActive: true },
        select: { id: true, name: true },
      }),
    ])

    const monthlyBrokerage = brokerageSum._sum.amount ?? 0
    const lastMonthBrokerage = lastMonthBrokerageSum._sum.amount ?? 0

    // Build last 6 months + current for brokerage chart
    const months: Array<{ label: string; start: Date; end: Date }> = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const s = new Date(d.getFullYear(), d.getMonth(), 1)
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' })
      months.push({ label, start: s, end: e })
    }
    const brokerageMonths = months.map((m) => m.label)

    // Operator performance with daily breakdown and brokerage chart data
    const operatorPerformance = await Promise.all(
      operators.map(async (op) => {
        const [opTotal, opTraded, opDNA, opBrokerage, opDailyBrokerage, opMonthlyBrokerageHistory] = await Promise.all([
          prisma.client.count({ where: { operatorId: op.id } }),
          prisma.client.count({ where: { operatorId: op.id, status: 'TRADED' } }),
          prisma.client.count({ where: { operatorId: op.id, remark: 'DID_NOT_ANSWER' } }),
          prisma.brokerageDetail.aggregate({
            _sum: { amount: true },
            where: { operatorId: op.id, brokerage: { uploadDate: { gte: start, lte: end } } },
          }),
          prisma.brokerageDetail.findMany({
            where: { operatorId: op.id, brokerage: { uploadDate: { gte: start, lte: end } } },
            include: { brokerage: { select: { uploadDate: true } } },
          }),
          Promise.all(
            months.map((m) =>
              prisma.brokerageDetail.aggregate({
                _sum: { amount: true },
                where: { operatorId: op.id, brokerage: { uploadDate: { gte: m.start, lte: m.end } } },
              })
            )
          ),
        ])

        const monthlyTotal = opBrokerage._sum.amount ?? 0

        // Daily breakdown
        const dailyBreakdown: Record<number, number> = {}
        for (const detail of opDailyBrokerage) {
          const day = new Date(detail.brokerage.uploadDate).getDate()
          dailyBreakdown[day] = (dailyBreakdown[day] ?? 0) + detail.amount
        }

        // Monthly history for chart
        const monthlyHistory: Record<string, number> = {}
        for (let i = 0; i < months.length; i++) {
          monthlyHistory[months[i].label] = opMonthlyBrokerageHistory[i]._sum.amount ?? 0
        }

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
    )

    // Build brokerage chart data — one row per operator
    const brokerageChartData = operatorPerformance.map((op) => ({
      name: op.operatorName,
      ...op.monthlyHistory,
    }))

    return NextResponse.json({
      success: true,
      data: {
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
        taskStats: { pending: pendingTasks, completed: completedTasks, expired: expiredTasks },
        operatorPerformance,
        brokerageChartData,
        brokerageMonths,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/admin]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

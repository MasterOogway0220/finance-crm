import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentMonthRange } from '@/lib/utils'
import { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = session.user.role as Role
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { start, end } = getCurrentMonthRange()
    const now = new Date()

    const [
      totalEmployees,
      equityCount,
      mfCount,
      tradedClients,
      totalClients,
      pendingTasks,
      overdueTasks,
      brokerageSum,
      operators,
    ] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.client.count({ where: { department: 'EQUITY' } }),
      prisma.client.count({ where: { department: 'MUTUAL_FUND' } }),
      prisma.client.count({ where: { status: 'TRADED' } }),
      prisma.client.count(),
      prisma.task.count({ where: { status: 'PENDING' } }),
      prisma.task.count({ where: { status: 'PENDING', deadline: { lt: now } } }),
      prisma.brokerageDetail.aggregate({
        _sum: { amount: true },
        where: {
          brokerage: { uploadDate: { gte: start, lte: end } },
        },
      }),
      prisma.employee.findMany({
        where: { role: 'EQUITY_DEALER', isActive: true },
        select: { id: true, name: true },
      }),
    ])

    const monthlyBrokerage = brokerageSum._sum.amount ?? 0
    const tradedPercentage = totalClients > 0 ? Math.round((tradedClients / totalClients) * 100) : 0

    // Operator performance table
    const operatorPerformance = await Promise.all(
      operators.map(async (op) => {
        const [opTotalClients, opTradedClients, opDidNotAnswer, opBrokerage] = await Promise.all([
          prisma.client.count({ where: { operatorId: op.id } }),
          prisma.client.count({ where: { operatorId: op.id, status: 'TRADED' } }),
          prisma.client.count({ where: { operatorId: op.id, remark: 'DID_NOT_ANSWER' } }),
          prisma.brokerageDetail.aggregate({
            _sum: { amount: true },
            where: {
              operatorId: op.id,
              brokerage: { uploadDate: { gte: start, lte: end } },
            },
          }),
        ])

        return {
          operatorId: op.id,
          operatorName: op.name,
          totalClients: opTotalClients,
          tradedClients: opTradedClients,
          notTraded: opTotalClients - opTradedClients,
          tradedPercentage:
            opTotalClients > 0 ? Math.round((opTradedClients / opTotalClients) * 100) : 0,
          didNotAnswer: opDidNotAnswer,
          monthlyBrokerage: opBrokerage._sum.amount ?? 0,
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: {
        totalEmployees,
        totalClients: { total: equityCount + mfCount, equityCount, mfCount },
        monthlyBrokerage,
        tradedClients: { count: tradedClients, percentage: tradedPercentage },
        pendingTasks,
        overdueTasks,
        operatorPerformance,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/admin]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

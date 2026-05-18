import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMonthRange } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = (await getActiveRole(session.user))
    const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'
    const isEquityDealer = userRole === 'EQUITY_DEALER'
    if (!isAdmin && !isEquityDealer) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const operatorFilter = searchParams.get('operatorId')

    const equityDealers = await prisma.employee.findMany({
      where: {
        role: 'EQUITY_DEALER',
        isActive: true,
        ...(isEquityDealer ? { id: session.user.id } : operatorFilter ? { id: operatorFilter } : {}),
      },
      select: { id: true, name: true },
    })

    const now = new Date()
    const { start, end } = getMonthRange(now.getMonth() + 1, now.getFullYear())

    // Pre-fetch current month's traded clients per operator from BrokerageDetail
    const operatorIds = equityDealers.map((op) => op.id)
    const monthDetails = await prisma.brokerageDetail.findMany({
      where: { operatorId: { in: operatorIds }, clientId: { not: null }, brokerage: { isActive: true, uploadDate: { gte: start, lte: end } } },
      select: { operatorId: true, clientId: true },
    })
    const tradedSets = new Map<string, Set<string>>()
    for (const d of monthDetails) {
      if (d.clientId) {
        if (!tradedSets.has(d.operatorId)) tradedSets.set(d.operatorId, new Set())
        tradedSets.get(d.operatorId)!.add(d.clientId)
      }
    }

    const operators = await Promise.all(
      equityDealers.map(async (op) => {
        const [total, followUpCount, remarkRows] = await Promise.all([
          prisma.client.count({ where: { operatorId: op.id } }),
          prisma.client.count({
            where: { operatorId: op.id, followUpDate: { gte: now } },
          }),
          prisma.client.groupBy({
            by: ['remark'],
            where: { operatorId: op.id },
            _count: { remark: true },
          }),
        ])
        const traded = tradedSets.get(op.id)?.size ?? 0

        const remarks: Record<string, number> = {}
        for (const r of remarkRows) {
          remarks[r.remark] = r._count.remark
        }

        return {
          operatorId: op.id,
          operatorName: op.name,
          total,
          traded,
          notTraded: total - traded,
          tradedPercent: total > 0 ? Math.round((traded / total) * 100) : 0,
          followUpCount,
          remarks,
        }
      })
    )

    const totals = operators.reduce(
      (acc, op) => ({
        total: acc.total + op.total,
        traded: acc.traded + op.traded,
        notTraded: acc.notTraded + op.notTraded,
        followUpCount: acc.followUpCount + op.followUpCount,
      }),
      { total: 0, traded: 0, notTraded: 0, followUpCount: 0 }
    )

    return NextResponse.json({
      success: true,
      data: {
        operators,
        totals: {
          ...totals,
          tradedPercent: totals.total > 0 ? Math.round((totals.traded / totals.total) * 100) : 0,
        },
      },
    })
  } catch (error) {
    console.error('[GET /api/reports/engagement]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

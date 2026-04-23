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
    const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()))
    const day   = searchParams.get('day')

    const userRole     = getEffectiveRole(session.user)
    const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'
    const isEquityDealer = session.user.role === 'EQUITY_DEALER' || session.user.secondaryRole === 'EQUITY_DEALER'
    const operatorIdParam = searchParams.get('operatorId')

    let operatorId: string | null = null
    if (userRole === 'EQUITY_DEALER') {
      operatorId = session.user.id
    } else if (operatorIdParam && operatorIdParam !== 'all') {
      operatorId = operatorIdParam
    } else if (isEquityDealer && !isAdmin) {
      operatorId = session.user.id
    } else if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'operatorId is required' }, { status: 400 })
    }
    // isAdmin with no operatorId (or 'all') => operatorId stays null → query all operators

    let dateStart: Date, dateEnd: Date
    if (day) {
      const dayNum = parseInt(day)
      dateStart = new Date(year, month - 1, dayNum)
      dateEnd   = new Date(year, month - 1, dayNum, 23, 59, 59, 999)
    } else {
      dateStart = new Date(year, month - 1, 1)
      dateEnd   = new Date(year, month, 0, 23, 59, 59, 999)
    }

    const dateFilter = { uploadDate: { gte: dateStart, lte: dateEnd } }
    const baseWhere = operatorId
      ? { operatorId, clientId: { not: null }, brokerage: dateFilter }
      : { clientId: { not: null }, brokerage: dateFilter }

    const [grouped, clientRecords] = await Promise.all([
      prisma.brokerageDetail.groupBy({
        by: ['clientCode', 'clientId'],
        where: baseWhere,
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
      prisma.brokerageDetail.findMany({
        where: baseWhere,
        select: { clientId: true, client: { select: { firstName: true, lastName: true } } },
        distinct: ['clientId'],
      }),
    ])

    const nameMap = new Map(
      clientRecords
        .filter((r) => r.clientId && r.client)
        .map((r) => [r.clientId!, `${r.client!.firstName} ${r.client!.lastName}`.trim()])
    )

    const clients = grouped.map((g) => ({
      clientCode: g.clientCode,
      clientName: nameMap.get(g.clientId!) ?? g.clientCode,
      totalBrokerage: g._sum.amount ?? 0,
    }))

    return NextResponse.json({ success: true, data: { operatorId, month, year, day: day ? parseInt(day) : null, clients } })
  } catch (error) {
    console.error('[GET /api/brokerage/client-wise]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

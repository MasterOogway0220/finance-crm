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
    const isEquityDealer = session.user.role === 'EQUITY_DEALER' || session.user.secondaryRole === 'EQUITY_DEALER'

    let operatorId: string
    if (userRole === 'EQUITY_DEALER') {
      operatorId = session.user.id
    } else if (searchParams.get('operatorId')) {
      operatorId = searchParams.get('operatorId')!
    } else if (isEquityDealer) {
      operatorId = session.user.id
    } else {
      return NextResponse.json({ success: false, error: 'operatorId is required' }, { status: 400 })
    }

    let dateStart: Date, dateEnd: Date
    if (day) {
      const dayNum = parseInt(day)
      dateStart = new Date(year, month - 1, dayNum)
      dateEnd   = new Date(year, month - 1, dayNum, 23, 59, 59, 999)
    } else {
      dateStart = new Date(year, month - 1, 1)
      dateEnd   = new Date(year, month, 0, 23, 59, 59, 999)
    }

    // Use groupBy instead of fetching all rows and aggregating in JS
    const [grouped, clientRecords] = await Promise.all([
      prisma.brokerageDetail.groupBy({
        by: ['clientCode', 'clientId'],
        where: { operatorId, clientId: { not: null }, brokerage: { uploadDate: { gte: dateStart, lte: dateEnd } } },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
      // Fetch client names separately in one query
      prisma.brokerageDetail.findMany({
        where: { operatorId, clientId: { not: null }, brokerage: { uploadDate: { gte: dateStart, lte: dateEnd } } },
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

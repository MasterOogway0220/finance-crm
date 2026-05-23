import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMonthRange } from '@/lib/utils'
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRoles = [session.user.role, session.user.secondaryRole].filter(Boolean) as string[]
    if (!userRoles.some(r => r === 'EQUITY_DEALER' || r === 'SUPER_ADMIN' || r === 'ADMIN')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()))

    if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
      return NextResponse.json({ success: false, error: 'Invalid month/year' }, { status: 400 })
    }

    const isEquityDealer = userRoles.includes('EQUITY_DEALER')
    const operatorId = isEquityDealer
      ? session.user.id
      : (searchParams.get('operatorId') ?? session.user.id)

    const { start, end } = getMonthRange(month, year)

    const totalClients = await prisma.client.count({ where: { operatorId } })

    // Hybrid attribution: current month → live ownership; past months → snapshot.
    // See src/lib/brokerage-attribution.ts.
    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        ...brokerageOperatorFilter(operatorId, month, year),
        brokerage: { isActive: true, uploadDate: { gte: start, lte: end } },
      },
      select: { clientId: true, amount: true },
    })
    const tradedIds = new Set<string>()
    let mtdBrokerage = 0
    for (const d of details) {
      if (d.clientId) tradedIds.add(d.clientId)
      mtdBrokerage += d.amount
    }
    const tradedClients = tradedIds.size

    const notTraded = totalClients - tradedClients

    return NextResponse.json({
      success: true,
      data: { totalClients, tradedClients, notTraded, mtdBrokerage },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/equity]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

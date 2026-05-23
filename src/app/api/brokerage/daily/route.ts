import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'

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
    const operatorIdParam = searchParams.get('operatorId')

    const userRole = (await getActiveRole(session.user))

    // Determine which operatorId to use
    const isEquityDealer =
      session.user.role === 'EQUITY_DEALER' || session.user.secondaryRole === 'EQUITY_DEALER'

    let operatorId: string
    if (userRole === 'EQUITY_DEALER') {
      operatorId = session.user.id
    } else if (operatorIdParam) {
      operatorId = operatorIdParam
    } else if (isEquityDealer) {
      // Dual-role user in admin view — show their own dealer data
      operatorId = session.user.id
    } else {
      return NextResponse.json({ success: false, error: 'operatorId is required' }, { status: 400 })
    }

    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)

    // Hybrid attribution — see src/lib/brokerage-attribution.ts.
    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        ...brokerageOperatorFilter(operatorId, month, year),
        brokerage: { isActive: true, uploadDate: { gte: monthStart, lte: monthEnd } },
      },
      select: {
        amount: true,
        brokerage: { select: { uploadDate: true } },
      },
    })

    // Group by date
    const dailyMap = new Map<string, number>()
    for (const d of details) {
      const key = d.brokerage.uploadDate.toISOString().split('T')[0]
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + d.amount)
    }
    const daily = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({
        date,
        day: new Date(date).getDate(),
        amount,
      }))

    return NextResponse.json({
      success: true,
      data: { operatorId, month, year, daily },
    })
  } catch (error) {
    console.error('[GET /api/brokerage/daily]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

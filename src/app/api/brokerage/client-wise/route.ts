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
    const day = searchParams.get('day') // null means "Monthly" (full month)

    const userRole = getEffectiveRole(session.user)

    const isEquityDealer =
      session.user.role === 'EQUITY_DEALER' || session.user.secondaryRole === 'EQUITY_DEALER'

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

    let dateStart: Date
    let dateEnd: Date

    if (day) {
      // Specific day
      const dayNum = parseInt(day)
      dateStart = new Date(year, month - 1, dayNum)
      dateEnd = new Date(year, month - 1, dayNum, 23, 59, 59, 999)
    } else {
      // Full month
      dateStart = new Date(year, month - 1, 1)
      dateEnd = new Date(year, month, 0, 23, 59, 59, 999)
    }

    // Get brokerage details grouped by client for this operator
    const details = await prisma.brokerageDetail.findMany({
      where: {
        operatorId,
        clientId: { not: null },
        brokerage: {
          uploadDate: { gte: dateStart, lte: dateEnd },
        },
      },
      select: {
        clientCode: true,
        clientId: true,
        amount: true,
        client: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    // Aggregate by client
    const clientMap = new Map<string, { clientCode: string; clientName: string; totalBrokerage: number }>()

    for (const d of details) {
      const existing = clientMap.get(d.clientCode)
      const clientName = d.client
        ? `${d.client.firstName} ${d.client.lastName}`.trim()
        : d.clientCode
      if (existing) {
        existing.totalBrokerage += d.amount
      } else {
        clientMap.set(d.clientCode, {
          clientCode: d.clientCode,
          clientName,
          totalBrokerage: d.amount,
        })
      }
    }

    const clients = Array.from(clientMap.values())

    return NextResponse.json({
      success: true,
      data: {
        operatorId,
        month,
        year,
        day: day ? parseInt(day) : null,
        clients,
      },
    })
  } catch (error) {
    console.error('[GET /api/brokerage/client-wise]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMonthRange, isCurrentMonth } from '@/lib/utils'

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

    const currentMonth = isCurrentMonth(month, year)

    const isEquityDealer = userRoles.includes('EQUITY_DEALER')
    const operatorId = isEquityDealer
      ? session.user.id
      : (searchParams.get('operatorId') ?? session.user.id)

    const { start, end } = getMonthRange(month, year)

    const totalClients = await prisma.client.count({ where: { operatorId } })

    let tradedClients: number
    let mtdBrokerage: number

    if (currentMonth) {
      // Current month: use Client.status for traded count (reflects manual updates)
      const [tradedCount, brokerageAgg] = await Promise.all([
        prisma.client.count({ where: { operatorId, status: 'TRADED' } }),
        prisma.brokerageDetail.aggregate({
          _sum: { amount: true },
          where: { operatorId, brokerage: { uploadDate: { gte: start, lte: end } } },
        }),
      ])
      tradedClients = tradedCount
      mtdBrokerage  = brokerageAgg._sum.amount ?? 0
    } else {
      // Past month: derive traded from BrokerageDetail
      const uploads = await prisma.brokerageUpload.findMany({
        where: { uploadDate: { gte: start, lte: end } },
        include: {
          details: {
            where: { operatorId },
            select: { clientId: true, amount: true },
          },
        },
      })
      const tradedIds = new Set<string>()
      mtdBrokerage = 0
      for (const u of uploads) {
        for (const d of u.details) {
          if (d.clientId) tradedIds.add(d.clientId)
          mtdBrokerage += d.amount
        }
      }
      tradedClients = tradedIds.size
    }

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

import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentMonthRange } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Check both primary and secondary role — dual-role users must be able to
    // access the dashboard they selected even if their other role has higher priority.
    const userRoles = [session.user.role, session.user.secondaryRole].filter(Boolean) as string[]
    if (!userRoles.some(r => r === 'EQUITY_DEALER' || r === 'SUPER_ADMIN' || r === 'ADMIN')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const isEquityDealer = userRoles.includes('EQUITY_DEALER')
    const operatorId = isEquityDealer ? session.user.id : (new URL(request.url).searchParams.get('operatorId') ?? session.user.id)

    const { start, end } = getCurrentMonthRange()

    const [totalClients, uploads] =
      await Promise.all([
        prisma.client.count({ where: { operatorId } }),
        prisma.brokerageUpload.findMany({
          where: { uploadDate: { gte: start, lte: end } },
          include: {
            details: {
              where: { operatorId },
              select: { clientId: true, amount: true },
            },
          },
        }),
      ])

    const tradedIds = new Set<string>()
    let mtdBrokerage = 0
    for (const u of uploads) {
      for (const d of u.details) {
        if (d.clientId) tradedIds.add(d.clientId)
        mtdBrokerage += d.amount
      }
    }
    const tradedClients = tradedIds.size
    const notTraded = totalClients - tradedClients

    return NextResponse.json({
      success: true,
      data: {
        totalClients,
        tradedClients,
        notTraded,
        mtdBrokerage,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/equity]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

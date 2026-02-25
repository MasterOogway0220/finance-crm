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
    if (userRole !== 'EQUITY_DEALER' && userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const operatorId = userRole === 'EQUITY_DEALER' ? session.user.id : (new URL(request.url).searchParams.get('operatorId') ?? session.user.id)

    const { start, end } = getCurrentMonthRange()

    const [totalClients, tradedClients, recentTasks, uploads] =
      await Promise.all([
        prisma.client.count({ where: { operatorId } }),
        prisma.client.count({ where: { operatorId, status: 'TRADED' } }),
        prisma.task.findMany({
          where: { assignedToId: operatorId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            assignedTo: { select: { id: true, name: true, department: true } },
            assignedBy: { select: { id: true, name: true, department: true } },
          },
        }),
        prisma.brokerageUpload.findMany({
          where: { uploadDate: { gte: start, lte: end } },
          include: {
            details: {
              where: { operatorId },
              select: { amount: true },
            },
          },
        }),
      ])

    const notTraded = totalClients - tradedClients

    const mtdBrokerage = uploads.reduce(
      (sum, u) => sum + u.details.reduce((s, d) => s + d.amount, 0),
      0
    )

    return NextResponse.json({
      success: true,
      data: {
        totalClients,
        tradedClients,
        notTraded,
        mtdBrokerage,
        recentTasks,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/equity]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

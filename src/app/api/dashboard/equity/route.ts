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

    const [totalClients, tradedClients, pendingTasks, completedTasksThisMonth, recentTasks, uploads] =
      await Promise.all([
        prisma.client.count({ where: { operatorId } }),
        prisma.client.count({ where: { operatorId, status: 'TRADED' } }),
        prisma.task.count({ where: { assignedToId: operatorId, status: 'PENDING' } }),
        prisma.task.count({
          where: {
            assignedToId: operatorId,
            status: 'COMPLETED',
            completedAt: { gte: start, lte: end },
          },
        }),
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
          orderBy: { uploadDate: 'asc' },
        }),
      ])

    const notTraded = totalClients - tradedClients

    const dailyBrokerage = uploads
      .filter((u) => u.details.length > 0)
      .map((u) => ({
        day: new Date(u.uploadDate).getDate(),
        amount: u.details.reduce((sum, d) => sum + d.amount, 0),
      }))

    const mtdBrokerage = dailyBrokerage.reduce((sum, d) => sum + d.amount, 0)

    return NextResponse.json({
      success: true,
      data: {
        totalClients,
        tradedClients,
        notTraded,
        pendingTasks,
        completedTasksThisMonth,
        recentTasks,
        dailyBrokerage,
        mtdBrokerage,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/equity]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

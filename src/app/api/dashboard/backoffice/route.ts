import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentMonthRange } from '@/lib/utils'
import { Role } from '@prisma/client'
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = session.user.role as Role
    if (
      userRole !== 'BACK_OFFICE' &&
      userRole !== 'SUPER_ADMIN' &&
      userRole !== 'ADMIN'
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const employeeId = session.user.id
    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') ?? 'month' // day | week | month

    const { start: monthStart, end: monthEnd } = getCurrentMonthRange()
    const now = new Date()

    let filterStart: Date
    let filterEnd: Date

    switch (filter) {
      case 'day':
        filterStart = startOfDay(now)
        filterEnd = endOfDay(now)
        break
      case 'week':
        filterStart = startOfWeek(now, { weekStartsOn: 1 })
        filterEnd = endOfWeek(now, { weekStartsOn: 1 })
        break
      case 'month':
      default:
        filterStart = monthStart
        filterEnd = monthEnd
        break
    }

    const [pendingTasks, completedTasksThisMonth, filteredTasks] = await Promise.all([
      prisma.task.count({
        where: { assignedToId: employeeId, status: 'PENDING' },
      }),
      prisma.task.count({
        where: {
          assignedToId: employeeId,
          status: 'COMPLETED',
          completedAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.task.findMany({
        where: {
          assignedToId: employeeId,
          createdAt: { gte: filterStart, lte: filterEnd },
        },
        include: {
          assignedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        pendingTasks,
        completedTasksThisMonth,
        tasks: filteredTasks,
        filter,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/backoffice]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

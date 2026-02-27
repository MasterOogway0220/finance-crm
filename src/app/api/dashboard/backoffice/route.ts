import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentMonthRange } from '@/lib/utils'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, addDays } from 'date-fns'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Check both primary and secondary role — dual-role users must be able to
    // access the dashboard they selected even if their other role has higher priority.
    const userRoles = [session.user.role, session.user.secondaryRole].filter(Boolean) as string[]
    if (!userRoles.some(r => r === 'BACK_OFFICE' || r === 'SUPER_ADMIN' || r === 'ADMIN')) {
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
      case 'tomorrow':
        filterStart = startOfDay(addDays(now, 1))
        filterEnd = endOfDay(addDays(now, 1))
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

    const [pendingTasks, completedTasksThisMonth, expiredTasks, filteredTasks] = await Promise.all([
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
      prisma.task.count({
        where: { assignedToId: employeeId, status: 'EXPIRED' },
      }),
      prisma.task.findMany({
        where: {
          assignedToId: employeeId,
          status: 'PENDING',
          deadline: { gte: filterStart, lte: filterEnd },
        },
        include: {
          assignedTo: { select: { id: true, name: true, department: true } },
          assignedBy: { select: { id: true, name: true, department: true } },
        },
        orderBy: { deadline: 'asc' },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        pendingTasks,
        completedTasksThisMonth,
        expiredTasks,
        filteredTasks,
        filter,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/backoffice]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

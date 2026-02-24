import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))
    const employeeIdParam = searchParams.get('employeeId')

    const userRole = session.user.role as Role

    const where: Record<string, unknown> = {
      createdAt: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59, 999) },
    }

    if (userRole === 'BACK_OFFICE' || userRole === 'EQUITY_DEALER' || userRole === 'MF_DEALER') {
      where.assignedToId = session.user.id
    } else if (employeeIdParam) {
      where.assignedToId = employeeIdParam
    }

    const tasks = await prisma.task.findMany({
      where,
      select: { id: true, status: true, createdAt: true },
    })

    // Aggregate by month
    const monthMap = new Map<number, { completed: number; pending: number; expired: number }>()
    for (let m = 0; m < 12; m++) {
      monthMap.set(m, { completed: 0, pending: 0, expired: 0 })
    }

    for (const task of tasks) {
      const m = task.createdAt.getMonth()
      const entry = monthMap.get(m)!
      if (task.status === 'COMPLETED') entry.completed++
      else if (task.status === 'PENDING') entry.pending++
      else if (task.status === 'EXPIRED') entry.expired++
    }

    const monthly = Array.from(monthMap.entries()).map(([m, counts]) => {
      const total = counts.completed + counts.pending + counts.expired
      return {
        month: MONTH_LABELS[m],
        completed: counts.completed,
        pending: counts.pending,
        expired: counts.expired,
        total,
        completionRate: total > 0 ? (counts.completed / total) * 100 : 0,
      }
    })

    const totalCompleted = monthly.reduce((s, r) => s + r.completed, 0)
    const totalPending = monthly.reduce((s, r) => s + r.pending, 0)
    const totalExpired = monthly.reduce((s, r) => s + r.expired, 0)
    const totalAll = totalCompleted + totalPending + totalExpired

    const summary = {
      totalCompleted,
      totalPending,
      totalExpired,
      completionRate: totalAll > 0 ? (totalCompleted / totalAll) * 100 : 0,
    }

    return NextResponse.json({
      success: true,
      data: { monthly, summary },
    })
  } catch (error) {
    console.error('[GET /api/reports/tasks]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

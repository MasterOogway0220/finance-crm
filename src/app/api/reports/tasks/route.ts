import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

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

    // Determine scope
    let employeeIds: string[]

    if (userRole === 'BACK_OFFICE' || userRole === 'EQUITY_DEALER' || userRole === 'MF_DEALER') {
      // Non-admin roles can only see their own data
      employeeIds = [session.user.id]
    } else if (employeeIdParam) {
      employeeIds = [employeeIdParam]
    } else {
      // Admins see all employees
      const allEmployees = await prisma.employee.findMany({
        where: { isActive: true },
        select: { id: true },
      })
      employeeIds = allEmployees.map((e) => e.id)
    }

    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

    // Fetch all tasks for the year for the scoped employees
    const tasks = await prisma.task.findMany({
      where: {
        assignedToId: { in: employeeIds },
        createdAt: { gte: yearStart, lte: yearEnd },
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        deadline: true,
        createdAt: true,
        assignedToId: true,
        assignedTo: { select: { id: true, name: true } },
      },
    })

    // Build monthly breakdown per employee
    type MonthlyEntry = {
      employeeId: string
      employeeName: string
      month: number
      completed: number
      pending: number
      expired: number
    }

    const breakdown = new Map<string, MonthlyEntry>()

    for (const task of tasks) {
      const taskMonth = task.createdAt.getMonth() + 1
      const key = `${task.assignedToId}-${taskMonth}`

      if (!breakdown.has(key)) {
        breakdown.set(key, {
          employeeId: task.assignedToId,
          employeeName: task.assignedTo.name,
          month: taskMonth,
          completed: 0,
          pending: 0,
          expired: 0,
        })
      }

      const entry = breakdown.get(key)!
      if (task.status === 'COMPLETED') entry.completed++
      else if (task.status === 'PENDING') entry.pending++
      else if (task.status === 'EXPIRED') entry.expired++
    }

    const result = Array.from(breakdown.values()).sort(
      (a, b) => a.month - b.month || a.employeeName.localeCompare(b.employeeName)
    )

    return NextResponse.json({
      success: true,
      data: { year, breakdown: result },
    })
  } catch (error) {
    console.error('[GET /api/reports/tasks]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

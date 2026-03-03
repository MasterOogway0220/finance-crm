import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = getEffectiveRole(session.user)
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const department = searchParams.get('department')
    const employeeId = searchParams.get('employeeId')
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    // Build employee filter
    const employeeWhere: Record<string, unknown> = { isActive: true }
    if (department) employeeWhere.department = department
    if (employeeId) employeeWhere.id = employeeId

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      select: { id: true, name: true, department: true, designation: true },
      orderBy: { name: 'asc' },
    })

    // Get leave balances for the year (auto-create if missing with 30 days)
    const leaveData = await Promise.all(
      employees.map(async (emp) => {
        let balance = await prisma.leaveBalance.findUnique({
          where: { employeeId_year: { employeeId: emp.id, year } },
        })

        if (!balance) {
          balance = await prisma.leaveBalance.create({
            data: { employeeId: emp.id, year, totalLeaves: 30 },
          })
        }

        // Count approved leave days for this year
        const approvedLeaves = await prisma.leaveApplication.aggregate({
          _sum: { days: true },
          where: {
            employeeId: emp.id,
            status: 'APPROVED',
            fromDate: {
              gte: new Date(year, 0, 1),
              lte: new Date(year, 11, 31, 23, 59, 59),
            },
          },
        })

        const leavesTaken = approvedLeaves._sum.days ?? 0

        return {
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department,
          designation: emp.designation,
          totalLeaves: balance.totalLeaves,
          leavesTaken,
          leavesRemaining: balance.totalLeaves - leavesTaken,
        }
      })
    )

    return NextResponse.json({ success: true, data: leaveData })
  } catch (error) {
    console.error('[GET /api/reports/leave]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

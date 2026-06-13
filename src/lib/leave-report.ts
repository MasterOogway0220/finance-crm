import { prisma } from '@/lib/prisma'

export interface LeaveReportFilters {
  year: number
  department?: string | null
  employeeId?: string | null
}

export interface LeaveReportRow {
  employeeId: string
  employeeName: string
  department: string
  designation: string
  totalLeaves: number
  leavesTaken: number
  leavesRemaining: number
}

/**
 * Per-employee leave summary for a year (total / taken / remaining).
 * Shared by GET /api/reports/leave and the leave Excel export so both report
 * identical numbers. Auto-creates a missing balance with the default 30 days.
 */
export async function getLeaveReport(filters: LeaveReportFilters): Promise<LeaveReportRow[]> {
  const { year, department, employeeId } = filters

  const employeeWhere: Record<string, unknown> = { isActive: true }
  if (department) employeeWhere.department = department
  if (employeeId) employeeWhere.id = employeeId

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    select: { id: true, name: true, department: true, designation: true },
    orderBy: { name: 'asc' },
  })

  return Promise.all(
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
}

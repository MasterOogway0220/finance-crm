import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canViewAdmin, isHrViewer } from '@/lib/roles'
import { closeExpiredLoginLogs } from '@/lib/login-log'
import { groupAttendance } from '@/lib/attendance-summary'

// GET /api/admin/attendance — login/logoff history grouped by employee & date
// ?month=2026-03 (required unless date is provided)
// ?date=2026-03-17 (optional — overrides month, single day)
// ?employeeId=xxx (optional)
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const role = (await getActiveRole(session.user))
    const allowed = canViewAdmin(role) || isHrViewer(session.user.email)
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = request.nextUrl
    const employeeId = searchParams.get('employeeId')
    const date = searchParams.get('date') // YYYY-MM-DD
    const month = searchParams.get('month') // YYYY-MM

    // IST offset
    const istOffsetMs = 5.5 * 60 * 60 * 1000

    let from: Date
    let to: Date

    if (date) {
      // Single date — use IST boundaries
      const [y, m, d] = date.split('-').map(Number)
      const istMidnight = new Date(Date.UTC(y, m - 1, d))
      from = new Date(istMidnight.getTime() - istOffsetMs)
      const istEnd = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
      to = new Date(istEnd.getTime() - istOffsetMs)
    } else if (month) {
      const [y, m] = month.split('-').map(Number)
      const istMonthStart = new Date(Date.UTC(y, m - 1, 1))
      from = new Date(istMonthStart.getTime() - istOffsetMs)
      const istMonthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999))
      to = new Date(istMonthEnd.getTime() - istOffsetMs)
    } else {
      return NextResponse.json({ success: false, error: 'Provide date or month parameter' }, { status: 400 })
    }

    // Close sessions left open past their 6 PM cut-off before reading.
    await closeExpiredLoginLogs()

    const employeeFilter = employeeId ? { employeeId } : {}
    const employeeSelect = { select: { id: true, name: true, department: true, designation: true } }

    const [logs, extras, employees] = await Promise.all([
      prisma.employeeLoginLog.findMany({
        where: { loginAt: { gte: from, lte: to }, ...employeeFilter },
        include: { employee: employeeSelect },
        orderBy: { loginAt: 'asc' },
      }),
      prisma.extraTimeRequest.findMany({
        where: { status: 'APPROVED', startAt: { gte: from, lte: to }, ...employeeFilter },
        include: { employee: employeeSelect },
      }),
      // All active employees for the filter dropdown
      prisma.employee.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ])

    // Grouped by employee + IST date, approved extra time included in the totals
    const data = groupAttendance(logs, extras)

    return NextResponse.json({ success: true, data, employees })
  } catch (error) {
    console.error('[GET /api/admin/attendance]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

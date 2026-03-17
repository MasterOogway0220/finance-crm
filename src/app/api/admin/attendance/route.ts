import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    const role = getEffectiveRole(session.user)
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
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

    const where: Record<string, unknown> = {
      loginAt: { gte: from, lte: to },
    }
    if (employeeId) where.employeeId = employeeId

    const logs = await prisma.employeeLoginLog.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true, department: true, designation: true } },
      },
      orderBy: { loginAt: 'asc' },
    })

    // Fetch all active employees for filter dropdown
    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    // Group by employee + date (IST)
    const grouped: Record<string, {
      date: string
      employeeId: string
      employeeName: string
      department: string
      designation: string
      firstLogin: string
      lastLogout: string | null
      totalDurationMs: number
      sessions: { id: string; loginAt: string; logoutAt: string | null }[]
    }> = {}

    for (const log of logs) {
      // Convert loginAt to IST date string
      const istLogin = new Date(log.loginAt.getTime() + istOffsetMs)
      const dateKey = `${istLogin.getUTCFullYear()}-${String(istLogin.getUTCMonth() + 1).padStart(2, '0')}-${String(istLogin.getUTCDate()).padStart(2, '0')}`
      const key = `${log.employeeId}_${dateKey}`

      if (!grouped[key]) {
        grouped[key] = {
          date: dateKey,
          employeeId: log.employee.id,
          employeeName: log.employee.name,
          department: log.employee.department,
          designation: log.employee.designation,
          firstLogin: log.loginAt.toISOString(),
          lastLogout: log.logoutAt?.toISOString() ?? null,
          totalDurationMs: 0,
          sessions: [],
        }
      }

      const entry = grouped[key]

      // Update last logout (latest logoutAt for the day)
      if (log.logoutAt) {
        if (!entry.lastLogout || new Date(log.logoutAt) > new Date(entry.lastLogout)) {
          entry.lastLogout = log.logoutAt.toISOString()
        }
      } else {
        // If there's an active session (no logout), mark as null (still working)
        entry.lastLogout = null
      }

      // Accumulate duration
      if (log.logoutAt) {
        entry.totalDurationMs += log.logoutAt.getTime() - log.loginAt.getTime()
      }

      entry.sessions.push({
        id: log.id,
        loginAt: log.loginAt.toISOString(),
        logoutAt: log.logoutAt?.toISOString() ?? null,
      })
    }

    // Sort by date desc, then employee name
    const data = Object.values(grouped).sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date)
      if (dateCompare !== 0) return dateCompare
      return a.employeeName.localeCompare(b.employeeName)
    })

    return NextResponse.json({ success: true, data, employees })
  } catch (error) {
    console.error('[GET /api/admin/attendance]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

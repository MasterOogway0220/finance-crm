import { auth, getEffectiveRole } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes

// GET /api/admin/employee-status — admin: all employees with login/logout status
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const role = getEffectiveRole(session.user)
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        department: true,
        designation: true,
        lastSeenAt: true,
        loginLogs: {
          where: {
            loginAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
          orderBy: { loginAt: 'desc' },
          take: 5,
          select: {
            id: true,
            loginAt: true,
            logoutAt: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const now = Date.now()

    const result = employees.map((emp) => {
      const isOnline = emp.lastSeenAt
        ? now - emp.lastSeenAt.getTime() < ONLINE_THRESHOLD_MS
        : false

      // First login of today
      const todayLogs = emp.loginLogs
      const firstLogin = todayLogs.length > 0
        ? todayLogs[todayLogs.length - 1].loginAt
        : null

      // Most recent logout today (if any log has a logoutAt)
      const lastLogout = todayLogs.find((l) => l.logoutAt)?.logoutAt ?? null

      return {
        id: emp.id,
        name: emp.name,
        department: emp.department,
        designation: emp.designation,
        isOnline,
        lastSeenAt: emp.lastSeenAt,
        firstLoginToday: firstLogin,
        lastLogoutToday: lastLogout,
        todaySessionCount: todayLogs.length,
      }
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('[GET /api/admin/employee-status]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/desktop/app-opened
// Called by the Electron desktop app on startup (did-finish-load / did-navigate events).
// Creates a new EmployeeLoginLog when the app opens with an existing session.
// Uses a 30-second dedup window to avoid creating a duplicate log when NextAuth's
// signIn event has just fired (which also creates a log via src/lib/auth.ts:signIn).
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const userId = session.user.id
    const now = new Date()

    // Check for a log created within last 30s (by NextAuth signIn event on first login)
    const recentLog = await prisma.employeeLoginLog.findFirst({
      where: {
        employeeId: userId,
        logoutAt: null,
        loginAt: { gt: new Date(now.getTime() - 30_000) },
      },
    })

    if (!recentLog) {
      // Close any orphaned open logs from crashes / missed logouts
      await prisma.employeeLoginLog.updateMany({
        where: { employeeId: userId, logoutAt: null },
        data: { logoutAt: now },
      })
      // Create new log and update lastSeenAt in parallel (independent operations)
      await Promise.all([
        prisma.employeeLoginLog.create({ data: { employeeId: userId } }),
        prisma.employee.update({ where: { id: userId }, data: { lastSeenAt: now } }),
      ])
    } else {
      await prisma.employee.update({
        where: { id: userId },
        data: { lastSeenAt: now },
      })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

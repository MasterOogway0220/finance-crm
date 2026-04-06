import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const userId = session.user.id
    const now = new Date()

    // If NextAuth's signIn event just created a log (within last 30s), don't duplicate
    const recentLog = await prisma.employeeLoginLog.findFirst({
      where: {
        employeeId: userId,
        logoutAt: null,
        loginAt: { gt: new Date(now.getTime() - 30_000) },
      },
    })

    if (!recentLog) {
      // Close any orphaned open logs from previous crashes / missed logouts
      await prisma.employeeLoginLog.updateMany({
        where: { employeeId: userId, logoutAt: null },
        data: { logoutAt: now },
      })
      await prisma.employeeLoginLog.create({
        data: { employeeId: userId },
      })
    }

    await prisma.employee.update({
      where: { id: userId },
      data: { lastSeenAt: now },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

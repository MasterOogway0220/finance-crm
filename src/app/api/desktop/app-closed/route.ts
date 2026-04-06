// POST /api/desktop/app-closed
// Called by the Electron desktop app's before-quit handler.
// Updates logoutAt on all open EmployeeLoginLog entries for the current user.
// Returns 401 silently if no session (user closed app on login screen — no log to close).

import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    await prisma.employeeLoginLog.updateMany({
      where: { employeeId: session.user.id, logoutAt: null },
      data: { logoutAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

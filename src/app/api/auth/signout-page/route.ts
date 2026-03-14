import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ ok: false })

    // Close all open login logs for this user
    await prisma.employeeLoginLog.updateMany({
      where: { employeeId: session.user.id, logoutAt: null },
      data: { logoutAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[signout-page]', err)
    return NextResponse.json({ ok: false })
  }
}

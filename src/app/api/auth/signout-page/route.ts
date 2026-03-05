import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ ok: false })

  try {
    const openLog = await prisma.employeeLoginLog.findFirst({
      where: { employeeId: session.user.id, logoutAt: null },
      orderBy: { loginAt: 'desc' },
    })
    if (openLog) {
      await prisma.employeeLoginLog.update({
        where: { id: openLog.id },
        data: { logoutAt: new Date() },
      })
    }
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true })
}

import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/heartbeat — update lastSeenAt for the current user
// Called every 5 minutes by the client to indicate active presence
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false }, { status: 401 })
    }

    await prisma.employee.update({
      where: { id: session.user.id },
      data: { lastSeenAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

import { auth, getEffectiveRole } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/leaves/today — admin: who is on approved leave today
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

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayEnd = new Date(today)
    todayEnd.setHours(23, 59, 59, 999)

    const onLeave = await prisma.leaveApplication.findMany({
      where: {
        status: 'APPROVED',
        fromDate: { lte: todayEnd },
        toDate: { gte: today },
      },
      include: {
        employee: { select: { id: true, name: true, department: true, designation: true } },
      },
      orderBy: { employee: { name: 'asc' } },
    })

    return NextResponse.json({ success: true, data: onLeave })
  } catch (error) {
    console.error('[GET /api/leaves/today]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

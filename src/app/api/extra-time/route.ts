import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { parseExtraTime } from '@/lib/work-hours'

const INCLUDE = {
  employee: { select: { id: true, name: true, department: true } },
  reviewedBy: { select: { id: true, name: true } },
} as const

// GET /api/extra-time — Super Admin: all requests; everyone else: their own
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const isSuperAdmin = (await getActiveRole(session.user)) === 'SUPER_ADMIN'

    const requests = await prisma.extraTimeRequest.findMany({
      where: isSuperAdmin ? {} : { employeeId: session.user.id },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json({ success: true, data: requests, isSuperAdmin })
  } catch (error) {
    console.error('[GET /api/extra-time]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/extra-time — request approval for time worked after 6 PM
// body: { date: 'YYYY-MM-DD', from: 'HH:MM', to: 'HH:MM', reason }
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { date, from, to, reason } = await request.json()
    if (typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ success: false, error: 'Reason is required' }, { status: 400 })
    }
    const parsed = parseExtraTime({ date: String(date), from: String(from), to: String(to) }, new Date())
    if ('error' in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    }

    const overlap = await prisma.extraTimeRequest.findFirst({
      where: {
        employeeId: session.user.id,
        status: { in: ['PENDING', 'APPROVED'] },
        startAt: { lt: parsed.endAt },
        endAt: { gt: parsed.startAt },
      },
      select: { id: true },
    })
    if (overlap) {
      return NextResponse.json(
        { success: false, error: 'You already have a request covering part of this time' },
        { status: 409 },
      )
    }

    const created = await prisma.extraTimeRequest.create({
      data: { employeeId: session.user.id, startAt: parsed.startAt, endAt: parsed.endAt, reason: reason.trim() },
      include: INCLUDE,
    })

    const superAdmins = await prisma.employee.findMany({
      where: {
        isActive: true,
        id: { not: session.user.id },
        OR: [{ role: 'SUPER_ADMIN' }, { secondaryRole: 'SUPER_ADMIN' }],
      },
      select: { id: true },
    })
    await Promise.all(
      superAdmins.map((admin) =>
        createNotification({
          userId: admin.id,
          type: 'EXTRA_TIME_REQUESTED',
          title: 'Extra Time Request',
          message: `${created.employee.name} requested extra time on ${date}, ${from}–${to}.`,
          link: '/extra-time',
        }),
      ),
    )

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/extra-time]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canViewAdmin } from '@/lib/roles'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRoles = [session.user.role, session.user.secondaryRole].filter(Boolean) as string[]
    if (!userRoles.some((r) => r === 'MF_DEALER' || canViewAdmin(r))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    // Last archived month = current month - 1
    const m1 = now.getMonth() === 0 ? 12 : now.getMonth()
    const y1 = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    // Month before that = current month - 2
    const m2 = m1 === 1 ? 12 : m1 - 1
    const y2 = m1 === 1 ? y1 - 1 : y1

    // Find equity clients archived as NOT_TRADED in month1 (e.g. April)
    const arch1 = await prisma.monthlyArchive.findMany({
      where: {
        entityType: 'CLIENT_STATUS',
        month: m1,
        year: y1,
        data: { path: 'status', equals: 'NOT_TRADED' },
      },
      select: { entityId: true },
    })

    if (arch1.length === 0) {
      return NextResponse.json({ success: true, data: { clients: [], count: 0 } })
    }

    const ids1 = arch1.map((a) => a.entityId)

    // Of those, find which were also NOT_TRADED in month2 (e.g. March)
    const arch2 = await prisma.monthlyArchive.findMany({
      where: {
        entityType: 'CLIENT_STATUS',
        month: m2,
        year: y2,
        entityId: { in: ids1 },
        data: { path: 'status', equals: 'NOT_TRADED' },
      },
      select: { entityId: true },
    })

    if (arch2.length === 0) {
      return NextResponse.json({ success: true, data: { clients: [], count: 0 } })
    }

    const ids2 = arch2.map((a) => a.entityId)

    // Fetch client details for the intersection
    const clients = await prisma.client.findMany({
      where: { id: { in: ids2 }, department: 'EQUITY' },
      select: {
        id: true,
        clientCode: true,
        firstName: true,
        lastName: true,
        phone: true,
        operator: { select: { name: true } },
      },
      orderBy: { lastName: 'asc' },
    })

    return NextResponse.json({
      success: true,
      data: {
        clients: clients.map((c) => ({
          id: c.id,
          clientCode: c.clientCode,
          name: [c.firstName, c.lastName].filter(Boolean).join(' '),
          phone: c.phone,
          operatorName: c.operator?.name ?? 'Unknown',
        })),
        count: clients.length,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/mf/not-traded-2months]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') ?? '').trim()

    if (q.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Query must be at least 2 characters' },
        { status: 400 }
      )
    }

    const userRole = getEffectiveRole(session.user)

    // Build client filter based on role
    const clientWhere: Record<string, unknown> = {
      OR: [
        { clientCode: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { phone: { contains: q } },
      ],
    }

    if (userRole === 'EQUITY_DEALER') {
      clientWhere.operatorId = session.user.id
    }

    // Task filter
    const taskWhere: Record<string, unknown> = {
      title: { contains: q },
    }

    if (userRole === 'BACK_OFFICE') {
      taskWhere.assignedToId = session.user.id
    }

    const [clients, tasks, employees] = await Promise.all([
      prisma.client.findMany({
        where: clientWhere,
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          department: true,
          operator: { select: { id: true, name: true } },
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          deadline: true,
          assignedTo: { select: { id: true, name: true } },
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'
        ? prisma.employee.findMany({
            where: {
              OR: [
                { name: { contains: q } },
                { email: { contains: q } },
              ],
            },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              department: true,
              isActive: true,
            },
            take: 5,
          })
        : Promise.resolve([]),
    ])

    return NextResponse.json({
      success: true,
      data: { clients, tasks, employees },
    })
  } catch (error) {
    console.error('[GET /api/search]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

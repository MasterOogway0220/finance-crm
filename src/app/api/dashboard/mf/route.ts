import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = session.user.role as Role
    if (
      userRole !== 'MF_DEALER' &&
      userRole !== 'SUPER_ADMIN' &&
      userRole !== 'ADMIN'
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const [totalClients, activeClients, inactiveClients] =
      await Promise.all([
        prisma.client.count({ where: { department: 'MUTUAL_FUND' } }),
        prisma.client.count({ where: { department: 'MUTUAL_FUND', mfStatus: 'ACTIVE' } }),
        prisma.client.count({ where: { department: 'MUTUAL_FUND', mfStatus: 'INACTIVE' } }),
      ])

    return NextResponse.json({
      success: true,
      data: {
        totalClients,
        activeClients,
        inactiveClients,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/mf]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

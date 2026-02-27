import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Check both primary and secondary role — dual-role users must be able to
    // access the dashboard they selected even if their other role has higher priority.
    const userRoles = [session.user.role, session.user.secondaryRole].filter(Boolean) as string[]
    if (!userRoles.some(r => r === 'MF_DEALER' || r === 'SUPER_ADMIN' || r === 'ADMIN')) {
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

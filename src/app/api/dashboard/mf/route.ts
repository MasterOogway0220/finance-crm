import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentMonthRange } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRoles = [session.user.role, session.user.secondaryRole].filter(Boolean) as string[]
    if (!userRoles.some(r => r === 'MF_DEALER' || r === 'SUPER_ADMIN' || r === 'ADMIN')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const myBusinessOnly = searchParams.get('myBusinessOnly') === 'true'

    const { start, end } = getCurrentMonthRange()

    const businessWhere: Record<string, unknown> = {
      employeeId: session.user.id,
      businessDate: { gte: start, lte: end },
    }
    if (myBusinessOnly) {
      businessWhere.referredById = null
    }

    const [totalClients, activeClients, inactiveClients, businessAgg] =
      await Promise.all([
        prisma.client.count({ where: { department: 'MUTUAL_FUND' } }),
        prisma.client.count({ where: { department: 'MUTUAL_FUND', mfStatus: 'ACTIVE' } }),
        prisma.client.count({ where: { department: 'MUTUAL_FUND', mfStatus: 'INACTIVE' } }),
        prisma.mFBusiness.aggregate({
          where: businessWhere,
          _sum: { yearlyContribution: true, commissionAmount: true },
        }),
      ])

    return NextResponse.json({
      success: true,
      data: {
        totalClients,
        activeClients,
        inactiveClients,
        totalSales: businessAgg._sum.yearlyContribution ?? 0,
        totalCommission: businessAgg._sum.commissionAmount ?? 0,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/mf]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

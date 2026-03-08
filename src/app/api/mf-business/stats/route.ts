import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEffectiveRole } from '@/lib/roles'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const myBusinessOnly = searchParams.get('myBusinessOnly') === 'true'
    const employeeId = searchParams.get('employeeId') || undefined

    const role = getEffectiveRole(session.user)

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const where: Record<string, unknown> = {
      businessDate: { gte: startDate, lte: endDate },
    }

    // For MF_DEALER, scope to own records
    if (role === 'MF_DEALER') {
      where.employeeId = session.user.id
      if (myBusinessOnly) {
        where.referredById = null
      }
    } else if (employeeId) {
      // Admin filtering by specific employee
      where.employeeId = employeeId
    }

    const agg = await prisma.mFBusiness.aggregate({
      where,
      _sum: {
        yearlyContribution: true,
        commissionAmount: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        totalSales: agg._sum.yearlyContribution ?? 0,
        totalCommission: agg._sum.commissionAmount ?? 0,
      },
    })
  } catch (error) {
    console.error('[GET /api/mf-business/stats]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

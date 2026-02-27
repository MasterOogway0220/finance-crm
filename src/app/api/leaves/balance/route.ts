import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/leaves/balance — get leave balance for an employee
// ?employeeId= optional (admin only); defaults to current user
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const role = getEffectiveRole(session.user)
    const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'

    const { searchParams } = request.nextUrl
    const targetId = isAdmin && searchParams.get('employeeId')
      ? searchParams.get('employeeId')!
      : session.user.id

    const year = new Date().getFullYear()

    // Total leaves allocated for this year
    const balance = await prisma.leaveBalance.findUnique({
      where: { employeeId_year: { employeeId: targetId, year } },
      select: { totalLeaves: true },
    })

    // Leaves used this year (approved applications)
    const usedAgg = await prisma.leaveApplication.aggregate({
      where: {
        employeeId: targetId,
        status: 'APPROVED',
        fromDate: { gte: new Date(`${year}-01-01`) },
        toDate: { lte: new Date(`${year}-12-31`) },
      },
      _sum: { days: true },
    })

    const totalLeaves = balance?.totalLeaves ?? 0
    const takenLeaves = usedAgg._sum.days ?? 0
    const pendingLeaves = totalLeaves - takenLeaves

    return NextResponse.json({
      success: true,
      data: { totalLeaves, takenLeaves, pendingLeaves: Math.max(pendingLeaves, 0), year },
    })
  } catch (error) {
    console.error('[GET /api/leaves/balance]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/leaves/balance — admin sets leave balance for an employee
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const role = getEffectiveRole(session.user)
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { employeeId, year, totalLeaves } = body

    if (!employeeId || !year || totalLeaves === undefined || totalLeaves < 0) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const record = await prisma.leaveBalance.upsert({
      where: { employeeId_year: { employeeId, year } },
      update: { totalLeaves },
      create: { employeeId, year, totalLeaves },
    })

    return NextResponse.json({ success: true, data: record })
  } catch (error) {
    console.error('[POST /api/leaves/balance]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

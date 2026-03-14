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

    const role = getEffectiveRole(session.user)
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    if (!employeeId) {
      return NextResponse.json({ success: false, error: 'employeeId is required' }, { status: 400 })
    }

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const [employee, businessCount, serviceCount] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: employeeId },
        select: { name: true },
      }),
      prisma.mFBusiness.count({
        where: {
          employeeId,
          businessDate: { gte: startDate, lte: endDate },
        },
      }),
      prisma.mFService.count({
        where: {
          employeeId,
          serviceDate: { gte: startDate, lte: endDate },
        },
      }),
    ])

    if (!employee) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        employeeName: employee.name,
        businessCount,
        serviceCount,
      },
    })
  } catch (error) {
    console.error('[GET /api/reports/mf-service-business-split]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

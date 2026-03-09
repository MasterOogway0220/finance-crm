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
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const range = searchParams.get('range') || 'MONTH' // MONTH or FULL_YEAR

    let startDate: Date
    let endDate: Date
    if (range === 'FULL_YEAR') {
      startDate = new Date(year, 0, 1)
      endDate = new Date(year, 11, 31, 23, 59, 59, 999)
    } else {
      startDate = new Date(year, month - 1, 1)
      endDate = new Date(year, month, 0, 23, 59, 59, 999)
    }

    // Get all employees in both departments
    const [equityEmployees, mfEmployees] = await Promise.all([
      prisma.employee.findMany({
        where: { department: 'EQUITY', isActive: true },
        select: { id: true, name: true },
      }),
      prisma.employee.findMany({
        where: { department: 'MUTUAL_FUND', isActive: true },
        select: { id: true, name: true },
      }),
    ])

    // Get all MF business records in date range
    const records = await prisma.mFBusiness.findMany({
      where: { businessDate: { gte: startDate, lte: endDate } },
      select: {
        employeeId: true,
        referredById: true,
        yearlyContribution: true,
        commissionAmount: true,
      },
    })

    // Build per-employee aggregates for equity (referrers)
    const equityStats = equityEmployees.map((emp) => {
      const referred = records.filter((r) => r.referredById === emp.id)
      return {
        name: emp.name,
        totalSales: referred.reduce((s, r) => s + r.yearlyContribution, 0),
        totalCommission: referred.reduce((s, r) => s + r.commissionAmount, 0),
      }
    })

    // Build per-employee aggregates for MF department (own business only — exclude equity-referred)
    const mfStats = mfEmployees.map((emp) => {
      const own = records.filter((r) => r.employeeId === emp.id && r.referredById === null)
      return {
        name: emp.name,
        totalSales: own.reduce((s, r) => s + r.yearlyContribution, 0),
        totalCommission: own.reduce((s, r) => s + r.commissionAmount, 0),
      }
    })

    // Department-level totals for pie chart
    const equityTotal = records
      .filter((r) => r.referredById !== null)
      .reduce((s, r) => s + r.yearlyContribution, 0)
    const mfOwnTotal = records
      .filter((r) => r.referredById === null)
      .reduce((s, r) => s + r.yearlyContribution, 0)

    const equityCommissionTotal = records
      .filter((r) => r.referredById !== null)
      .reduce((s, r) => s + r.commissionAmount, 0)
    const mfOwnCommissionTotal = records
      .filter((r) => r.referredById === null)
      .reduce((s, r) => s + r.commissionAmount, 0)

    return NextResponse.json({
      success: true,
      data: {
        equityStats,
        mfStats,
        distribution: {
          sales: { equity: equityTotal, mf: mfOwnTotal },
          commission: { equity: equityCommissionTotal, mf: mfOwnCommissionTotal },
        },
      },
    })
  } catch (error) {
    console.error('[GET /api/reports/mf-business]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

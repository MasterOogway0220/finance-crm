import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentMonthRange } from '@/lib/utils'
import { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = session.user.role as Role
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))
    const operatorIdParam = searchParams.get('operatorId')

    // Fetch archived monthly data
    const archiveWhere: Record<string, unknown> = {
      entityType: 'BROKERAGE',
    }

    if (operatorIdParam) {
      archiveWhere.entityId = operatorIdParam
    }

    const archives = await prisma.monthlyArchive.findMany({
      where: archiveWhere,
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    })

    // Also get live current month data
    const { start: curStart, end: curEnd } = getCurrentMonthRange()

    const liveDetailsWhere: Record<string, unknown> = {
      brokerage: { uploadDate: { gte: curStart, lte: curEnd } },
    }
    if (operatorIdParam) liveDetailsWhere.operatorId = operatorIdParam

    const liveDetails = await prisma.brokerageDetail.findMany({
      where: liveDetailsWhere,
      select: { operatorId: true, amount: true },
    })

    // Aggregate live data per operator
    const liveByOperator = new Map<string, number>()
    for (const d of liveDetails) {
      liveByOperator.set(d.operatorId, (liveByOperator.get(d.operatorId) ?? 0) + d.amount)
    }

    // Build operator×month matrix
    // Archives contain { operatorId, operatorName, amount } per (month, year, entityType, entityId)
    type MatrixEntry = { month: number; year: number; operatorId: string; operatorName: string; amount: number }
    const matrix: MatrixEntry[] = []

    for (const archive of archives) {
      const data = archive.data as { operatorId?: string; operatorName?: string; amount?: number }
      matrix.push({
        month: archive.month,
        year: archive.year,
        operatorId: archive.entityId,
        operatorName: data.operatorName ?? '',
        amount: data.amount ?? 0,
      })
    }

    // Add current month live data
    const currentMonthNum = now.getMonth() + 1
    const currentYear = now.getFullYear()

    for (const [opId, amount] of liveByOperator.entries()) {
      // Check if not already in matrix from archives
      const exists = matrix.find(
        (m) => m.month === currentMonthNum && m.year === currentYear && m.operatorId === opId
      )
      if (!exists) {
        const operator = await prisma.employee.findUnique({
          where: { id: opId },
          select: { name: true },
        })
        matrix.push({
          month: currentMonthNum,
          year: currentYear,
          operatorId: opId,
          operatorName: operator?.name ?? opId,
          amount,
        })
      }
    }

    // Monthly breakdown (sum across all operators per month/year)
    const monthlyBreakdown = new Map<string, number>()
    for (const entry of matrix) {
      const key = `${entry.year}-${String(entry.month).padStart(2, '0')}`
      monthlyBreakdown.set(key, (monthlyBreakdown.get(key) ?? 0) + entry.amount)
    }

    const monthlyBreakdownArr = Array.from(monthlyBreakdown.entries())
      .map(([period, total]) => ({ period, total }))
      .sort((a, b) => a.period.localeCompare(b.period))

    return NextResponse.json({
      success: true,
      data: {
        monthlyBreakdown: monthlyBreakdownArr,
        matrix,
        filters: { month, year, operatorId: operatorIdParam },
      },
    })
  } catch (error) {
    console.error('[GET /api/reports/brokerage]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

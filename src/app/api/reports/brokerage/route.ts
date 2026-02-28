import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const RANGE_MONTHS: Record<string, number[]> = {
  Q1: [0, 1, 2],
  Q2: [3, 4, 5],
  Q3: [6, 7, 8],
  Q4: [9, 10, 11],
  H1: [0, 1, 2, 3, 4, 5],
  H2: [6, 7, 8, 9, 10, 11],
  FULL: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = getEffectiveRole(session.user)
    const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'
    const isEquityDealer = userRole === 'EQUITY_DEALER'
    if (!isAdmin && !isEquityDealer) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))
    const operatorId = searchParams.get('operatorId')
    const range = searchParams.get('range') ?? 'FULL'
    const activeMonthIndices = RANGE_MONTHS[range] ?? RANGE_MONTHS.FULL

    // Admins see all equity dealers; equity dealers see only themselves
    let equityDealers
    if (isAdmin) {
      if (operatorId) {
        equityDealers = await prisma.employee.findMany({
          where: { id: operatorId, role: 'EQUITY_DEALER', isActive: true },
          select: { id: true, name: true },
        })
      } else {
        equityDealers = await prisma.employee.findMany({
          where: { role: 'EQUITY_DEALER', isActive: true },
          select: { id: true, name: true },
        })
      }
    } else {
      equityDealers = await prisma.employee.findMany({
        where: { id: session.user.id },
        select: { id: true, name: true },
      })
    }

    // Build months for the year, filtered by range
    const months: Array<{ label: string; start: Date; end: Date; idx: number }> = []
    for (const m of activeMonthIndices) {
      const start = new Date(year, m, 1)
      const end = new Date(year, m + 1, 0, 23, 59, 59, 999)
      const label = start.toLocaleString('default', { month: 'short', year: '2-digit' })
      months.push({ label, start, end, idx: m })
    }
    const monthLabels = months.map((m) => m.label)
    const operatorNames = equityDealers.map((e) => e.name)

    // Initialize matrix
    const matrix: Record<string, Record<string, number>> = {}
    for (const op of equityDealers) {
      matrix[op.name] = {}
      for (const m of months) {
        matrix[op.name][m.label] = 0
      }
    }

    // Query brokerage details for the year
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        operatorId: { in: equityDealers.map((e) => e.id) },
        brokerage: { uploadDate: { gte: yearStart, lte: yearEnd } },
      },
      select: {
        operatorId: true,
        amount: true,
        brokerage: { select: { uploadDate: true } },
      },
    })

    // Fill matrix
    const opIdToName = new Map(equityDealers.map((e) => [e.id, e.name]))
    const activeMonthSet = new Set(activeMonthIndices)
    for (const detail of details) {
      const opName = opIdToName.get(detail.operatorId)
      if (!opName) continue
      const uploadDate = new Date(detail.brokerage.uploadDate)
      const monthIdx = uploadDate.getMonth()
      if (!activeMonthSet.has(monthIdx)) continue
      const monthLabel = months.find((m) => m.idx === monthIdx)?.label
      if (monthLabel && matrix[opName]) {
        matrix[opName][monthLabel] = (matrix[opName][monthLabel] ?? 0) + detail.amount
      }
    }

    return NextResponse.json({
      success: true,
      data: { matrix, months: monthLabels, operators: operatorNames },
    })
  } catch (error) {
    console.error('[GET /api/reports/brokerage]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

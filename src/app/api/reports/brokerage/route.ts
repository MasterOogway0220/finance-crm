import { auth, getActiveRole } from '@/lib/auth'
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

    const userRole = (await getActiveRole(session.user))
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

    // Hybrid attribution: split the year into past months (snapshot) and the current month
    // (current-owner). Issue two queries and merge into the matrix.
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)
    const operatorIds = equityDealers.map((e) => e.id)
    const opIdToName = new Map(equityDealers.map((e) => [e.id, e.name]))
    const activeMonthSet = new Set(activeMonthIndices)

    const isThisYear = year === now.getFullYear()
    const curMonthIdx = now.getMonth() // 0-based, only meaningful if isThisYear
    const curMonthInRange = isThisYear && activeMonthSet.has(curMonthIdx)

    // Past-month window inside the requested year.
    // If this year: yearStart .. (end of previous month). If past year: full year.
    const pastEndDate = isThisYear
      ? new Date(year, curMonthIdx, 0, 23, 59, 59, 999) // last day of (curMonthIdx - 1)
      : yearEnd
    const pastInRange = pastEndDate >= yearStart

    const [pastDetails, curDetails] = await Promise.all([
      pastInRange
        ? prisma.brokerageDetail.findMany({
            where: {
              clientId: { not: null },
              operatorId: { in: operatorIds },
              brokerage: { uploadDate: { gte: yearStart, lte: pastEndDate } },
            },
            select: { amount: true, operatorId: true, brokerage: { select: { uploadDate: true } } },
          })
        : Promise.resolve([] as Array<{ amount: number; operatorId: string; brokerage: { uploadDate: Date } }>),
      curMonthInRange
        ? prisma.brokerageDetail.findMany({
            where: {
              clientId: { not: null },
              client: { operatorId: { in: operatorIds } },
              brokerage: {
                uploadDate: {
                  gte: new Date(year, curMonthIdx, 1),
                  lte: new Date(year, curMonthIdx + 1, 0, 23, 59, 59, 999),
                },
              },
            },
            select: { amount: true, client: { select: { operatorId: true } }, brokerage: { select: { uploadDate: true } } },
          })
        : Promise.resolve([] as Array<{ amount: number; client: { operatorId: string }; brokerage: { uploadDate: Date } }>),
    ])

    // Fill matrix from both buckets.
    for (const d of pastDetails) {
      const opName = opIdToName.get(d.operatorId)
      if (!opName) continue
      const monthIdx = new Date(d.brokerage.uploadDate).getMonth()
      if (!activeMonthSet.has(monthIdx)) continue
      const monthLabel = months.find((m) => m.idx === monthIdx)?.label
      if (monthLabel && matrix[opName]) {
        matrix[opName][monthLabel] = (matrix[opName][monthLabel] ?? 0) + d.amount
      }
    }
    for (const d of curDetails) {
      const opName = opIdToName.get(d.client!.operatorId)
      if (!opName) continue
      const monthIdx = new Date(d.brokerage.uploadDate).getMonth()
      if (!activeMonthSet.has(monthIdx)) continue
      const monthLabel = months.find((m) => m.idx === monthIdx)?.label
      if (monthLabel && matrix[opName]) {
        matrix[opName][monthLabel] = (matrix[opName][monthLabel] ?? 0) + d.amount
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

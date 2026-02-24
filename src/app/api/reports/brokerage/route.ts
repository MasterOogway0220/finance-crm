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
    const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'
    const isEquityDealer = userRole === 'EQUITY_DEALER'
    if (!isAdmin && !isEquityDealer) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))

    // Admins see all equity dealers; equity dealers see only themselves
    const equityDealers = isAdmin
      ? await prisma.employee.findMany({
          where: { role: 'EQUITY_DEALER', isActive: true },
          select: { id: true, name: true },
        })
      : await prisma.employee.findMany({
          where: { id: session.user.id },
          select: { id: true, name: true },
        })

    // Build 12 months for the year
    const months: Array<{ label: string; start: Date; end: Date }> = []
    for (let m = 0; m < 12; m++) {
      const start = new Date(year, m, 1)
      const end = new Date(year, m + 1, 0, 23, 59, 59, 999)
      const label = start.toLocaleString('default', { month: 'short', year: '2-digit' })
      months.push({ label, start, end })
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
    for (const detail of details) {
      const opName = opIdToName.get(detail.operatorId)
      if (!opName) continue
      const uploadDate = new Date(detail.brokerage.uploadDate)
      const monthIdx = uploadDate.getMonth()
      const monthLabel = months[monthIdx].label
      if (matrix[opName]) {
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

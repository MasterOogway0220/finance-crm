import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveRole } from '@/lib/auth'

// Indian fiscal year (Apr-Mar). Returns "YY-YY" e.g. "25-26" for FY starting Apr 2025.
function fyLabelOf(d: Date): string {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() // 0-indexed
  const startYear = m >= 3 ? y : y - 1
  const endYear = startYear + 1
  return `${String(startYear % 100).padStart(2, '0')}-${String(endYear % 100).padStart(2, '0')}`
}

function currentFyLabel(now: Date): string {
  return fyLabelOf(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

// Returns FY ranges (UTC) for "current FY + N past FYs", oldest first.
function buildFyRanges(now: Date, pastYears: number): Array<{ label: string; start: Date; end: Date }> {
  const y = now.getFullYear()
  const m = now.getMonth()
  const currentStartYear = m >= 3 ? y : y - 1
  const ranges: Array<{ label: string; start: Date; end: Date }> = []
  for (let i = pastYears; i >= 0; i--) {
    const sy = currentStartYear - i
    const start = new Date(Date.UTC(sy, 3, 1, 0, 0, 0, 0))             // Apr 1 of sy
    const end = new Date(Date.UTC(sy + 1, 3, 1, 0, 0, 0, 0))           // Apr 1 of next year (exclusive end)
    ranges.push({
      label: `${String(sy % 100).padStart(2, '0')}-${String((sy + 1) % 100).padStart(2, '0')}`,
      start,
      end,
    })
  }
  return ranges
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const role = (await getActiveRole(session.user))
    const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'
    const isEquityDealer = role === 'EQUITY_DEALER'
    if (!isAdmin && !isEquityDealer) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const yearsParam = parseInt(searchParams.get('years') ?? '2', 10)
    const pastYears = Math.min(5, Math.max(2, isNaN(yearsParam) ? 2 : yearsParam))
    const requestedOperatorId = searchParams.get('operatorId')?.trim() || null

    // Resolve which operator's clients to show
    let operatorIdFilter: string | null = null
    if (isEquityDealer) {
      operatorIdFilter = session.user.id
    } else if (isAdmin && requestedOperatorId && requestedOperatorId !== 'all') {
      operatorIdFilter = requestedOperatorId
    }

    // FY ranges (ordered oldest → newest)
    const now = new Date()
    const fys = buildFyRanges(now, pastYears)
    const earliestStart = fys[0].start
    const latestEnd = fys[fys.length - 1].end
    const currentFy = currentFyLabel(now)

    // Fetch clients in scope
    const clientWhere: { department: 'EQUITY'; operatorId?: string } = { department: 'EQUITY' }
    if (operatorIdFilter) clientWhere.operatorId = operatorIdFilter
    const clients = await prisma.client.findMany({
      where: clientWhere,
      select: {
        id: true,
        clientCode: true,
        firstName: true,
        middleName: true,
        lastName: true,
        phone: true,
        operator: { select: { id: true, name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })

    const clientIds = clients.map((c) => c.id)

    // Fetch all BrokerageDetail rows for these clients within the FY window
    // (only isActive uploads)
    const details = clientIds.length === 0 ? [] : await prisma.brokerageDetail.findMany({
      where: {
        clientId: { in: clientIds },
        brokerage: {
          isActive: true,
          uploadDate: { gte: earliestStart, lt: latestEnd },
        },
      },
      select: {
        clientId: true,
        amount: true,
        brokerage: { select: { uploadDate: true } },
      },
    })

    // Bucket: per-client per-FY total amount (we'll surface presence + amount)
    const perClient = new Map<string, Map<string, number>>()
    for (const d of details) {
      if (!d.clientId) continue
      const label = fyLabelOf(d.brokerage.uploadDate)
      let row = perClient.get(d.clientId)
      if (!row) { row = new Map(); perClient.set(d.clientId, row) }
      row.set(label, (row.get(label) ?? 0) + d.amount)
    }

    const fyLabels = fys.map((f) => f.label)
    const resultClients = clients.map((c) => {
      const row = perClient.get(c.id)
      const perFy: Record<string, { traded: boolean; amount: number }> = {}
      for (const label of fyLabels) {
        const amount = row?.get(label) ?? 0
        perFy[label] = { traded: amount > 0, amount }
      }
      const tradedInPast = fyLabels.slice(0, -1).some((l) => perFy[l].traded)
      const tradedInCurrent = perFy[currentFy]?.traded ?? false
      const followUpRequired = tradedInPast && !tradedInCurrent

      const fullName = [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ')
      return {
        id: c.id,
        clientCode: c.clientCode,
        name: fullName,
        phone: c.phone,
        operatorId: c.operator.id,
        operatorName: c.operator.name,
        perFy,
        followUpRequired,
      }
    })

    // For admin filter dropdown
    let operators: Array<{ id: string; name: string }> = []
    if (isAdmin) {
      operators = await prisma.employee.findMany({
        where: {
          isActive: true,
          OR: [{ role: 'EQUITY_DEALER' }, { secondaryRole: 'EQUITY_DEALER' }],
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        fyLabels,
        currentFy,
        operators,
        clients: resultClients,
      },
    })
  } catch (error) {
    console.error('[GET /api/reports/brokerage-fy-comparison]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

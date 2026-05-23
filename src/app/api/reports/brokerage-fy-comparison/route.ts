import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveRole } from '@/lib/auth'
import { isCurrentMonth } from '@/lib/utils'

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

    // See src/lib/brokerage-attribution.ts for the canonical hybrid rule.
    // Hybrid attribution: this report is about a client's trading activity per FY.
    // For past months we want the snapshot operator to determine whether the brokerage
    // counts toward this client's *current* operator's column — but the per-CLIENT
    // breakdown in this report is keyed by client, not operator. So the operator
    // attribution doesn't actually change what's displayed for past months: the row is
    // already keyed by client.id, and we just need rows where clientId is in the
    // selected client set (the snapshot operator on the row is irrelevant to the
    // bucket the amount lands in).
    //
    // BUT — the client set itself was selected by `clientWhere.operatorId = X` (above).
    // That filter is "clients CURRENTLY assigned to X". Under the user's golden rule,
    // past-FY views should show whichever client was X's client AT THE TIME earning
    // brokerage — which we can detect by checking if any BrokerageDetail row for that
    // client in that FY had operatorId = X (the snapshot).
    //
    // So the correct hybrid behavior here is:
    //   - Past FYs: include a client in operator X's view only if the snapshot
    //     operatorId on that FY's brokerage rows was X. The amount shown is the sum
    //     of those snapshot-matching rows.
    //   - Current FY: same as today — clients currently assigned to X, brokerage
    //     summed regardless of snapshot.
    //
    // Implementation: fetch ALL details for the current operatorIdFilter via snapshot
    // for past FYs, then OVERLAY current-FY rows fetched by current-owner.
    const isThisFyForCurrentMonth = (d: Date) => isCurrentMonth(d.getMonth() + 1, d.getFullYear())

    let details: Array<{
      clientId: string | null
      amount: number
      brokerage: { uploadDate: Date }
    }> = []

    if (clientIds.length > 0 || operatorIdFilter) {
      // Past-FY scope: rows in the window whose snapshot operatorId matches the filter
      // (or all rows in the window if no operator filter — admin "all" view).
      const pastWhere: import('@prisma/client').Prisma.BrokerageDetailWhereInput = {
        brokerage: { isActive: true, uploadDate: { gte: earliestStart, lt: latestEnd } },
      }
      if (operatorIdFilter) pastWhere.operatorId = operatorIdFilter
      else if (clientIds.length > 0) pastWhere.clientId = { in: clientIds }

      const pastRows = await prisma.brokerageDetail.findMany({
        where: pastWhere,
        select: { clientId: true, amount: true, brokerage: { select: { uploadDate: true } } },
      })

      // Keep only rows whose upload month is NOT the current calendar month — those go through
      // the current-owner overlay below to avoid double counting.
      details = pastRows.filter((d) => !isThisFyForCurrentMonth(new Date(d.brokerage.uploadDate)))

      // Current-month overlay using current-owner attribution: client must currently be in the set.
      if (clientIds.length > 0) {
        const curStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        const curRows = await prisma.brokerageDetail.findMany({
          where: {
            clientId: { in: clientIds },
            brokerage: { isActive: true, uploadDate: { gte: curStart, lte: curEnd } },
          },
          select: { clientId: true, amount: true, brokerage: { select: { uploadDate: true } } },
        })
        details.push(...curRows)
      }
    }

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

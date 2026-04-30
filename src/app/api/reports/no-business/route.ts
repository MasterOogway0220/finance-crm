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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')))
    const search = searchParams.get('search')?.trim().toLowerCase() || ''
    const operatorId = searchParams.get('operator') || ''
    const exportCsv = searchParams.get('export') === 'true'

    const twoMonthsAgo = new Date()
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

    // Fetch all equity clients that are not MF-active, with latest brokerage, MF business, and dismissal
    const allClients = await prisma.client.findMany({
      where: {
        department: 'EQUITY',
        mfStatus: { not: 'ACTIVE' },
      },
      select: {
        id: true,
        clientCode: true,
        firstName: true,
        middleName: true,
        lastName: true,
        phone: true,
        createdAt: true,
        operator: { select: { id: true, name: true } },
        brokerageDetails: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
        mfBusinesses: {
          orderBy: { businessDate: 'desc' },
          take: 1,
          select: { businessDate: true },
        },
        noBusinessDismissal: {
          select: {
            dismissedAt: true,
            dismissedBy: { select: { id: true, name: true } },
          },
        },
      },
    })

    // Filter to dormant clients
    const dormant = allClients.filter((client) => {
      const lastBrokerage = client.brokerageDetails[0]?.createdAt ?? null
      const lastMFBusiness = client.mfBusinesses[0]?.businessDate ?? null

      // Exclude if recent activity (within 2 months)
      if (lastBrokerage && lastBrokerage >= twoMonthsAgo) return false
      if (lastMFBusiness && lastMFBusiness >= twoMonthsAgo) return false

      // Must be inactive: old brokerage OR never traded and account is old
      const isInactive =
        (lastBrokerage !== null && lastBrokerage < twoMonthsAgo) ||
        (lastBrokerage === null && client.createdAt < twoMonthsAgo)
      if (!isInactive) return false

      // Dismissal logic: excluded if admin-dismissed AND no new business after dismissal
      const dismissal = client.noBusinessDismissal
      if (dismissal) {
        const hasNewBrokerageAfterDismissal = lastBrokerage && lastBrokerage > dismissal.dismissedAt
        const hasNewMFAfterDismissal = lastMFBusiness && lastMFBusiness > dismissal.dismissedAt
        if (!hasNewBrokerageAfterDismissal && !hasNewMFAfterDismissal) {
          return false // still dismissed
        }
        // New business after dismissal → dismissal void, client is dormant again
      }

      return true
    })

    // Apply search and operator filters
    const filtered = dormant.filter((client) => {
      if (operatorId && client.operator.id !== operatorId) return false
      if (search) {
        const fullName = [client.firstName, client.middleName, client.lastName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!fullName.includes(search) && !client.clientCode.toLowerCase().includes(search)) {
          return false
        }
      }
      return true
    })

    const now = new Date()
    const result = filtered.map((client) => {
      const lastBrokerage = client.brokerageDetails[0]?.createdAt ?? null
      const referenceDate = lastBrokerage ?? client.createdAt
      const daysInactive = Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24))
      return {
        id: client.id,
        clientCode: client.clientCode,
        firstName: client.firstName,
        middleName: client.middleName,
        lastName: client.lastName,
        phone: client.phone,
        operator: client.operator,
        lastBrokerageDate: lastBrokerage?.toISOString() ?? null,
        daysInactive,
        dismissedAt: client.noBusinessDismissal?.dismissedAt?.toISOString() ?? null,
        dismissedBy: client.noBusinessDismissal?.dismissedBy ?? null,
      }
    })

    // Sort by daysInactive descending (longest dormant first)
    result.sort((a, b) => b.daysInactive - a.daysInactive)

    if (exportCsv) {
      const header = 'Client Code,Name,Phone,Operator,Last Brokerage,Days Inactive'
      const rows = result.map((c) => {
        const name = [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ')
        const lastBrokerage = c.lastBrokerageDate
          ? new Date(c.lastBrokerageDate).toLocaleDateString('en-IN')
          : 'Never'
        return `${c.clientCode},"${name}",${c.phone},${c.operator.name},${lastBrokerage},${c.daysInactive}`
      })
      const csv = [header, ...rows].join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="no-business-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    // Paginate
    const total = result.length
    const paginated = result.slice((page - 1) * limit, page * limit)

    // Get all operators for filter dropdown
    const operators = await prisma.employee.findMany({
      where: { department: 'EQUITY', isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      success: true,
      data: {
        clients: paginated,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        operators,
      },
    })
  } catch (error) {
    console.error('[GET /api/reports/no-business]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

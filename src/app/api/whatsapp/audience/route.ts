import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/roles'
import { dedupeAudienceByPhone, normalizeWhatsappPhone, type Segment } from '@/lib/whatsapp-outreach'
import { Prisma } from '@prisma/client'

const AUDIENCE_SELECT = {
  id: true, clientCode: true, firstName: true, middleName: true, lastName: true, phone: true, department: true,
} satisfies Prisma.ClientSelect

function segmentWhere(segment: Segment, search: string | null): { equity?: Prisma.ClientWhereInput; mf?: Prisma.ClientWhereInput } {
  const now = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const searchOR: Prisma.ClientWhereInput = search
    ? { OR: [
        { clientCode: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
      ] }
    : {}
  const equityInactive: Prisma.ClientWhereInput = { department: 'EQUITY', status: 'NOT_TRADED', ...searchOR }
  const mfInactive: Prisma.ClientWhereInput = { department: 'MUTUAL_FUND', mfStatus: 'INACTIVE', ...searchOR }
  const dormant: Prisma.ClientWhereInput = {
    department: 'EQUITY',
    NOT: { brokerageDetails: { some: { brokerage: { isActive: true, uploadDate: { gte: cutoff } } } } },
    ...searchOR,
  }
  switch (segment) {
    case 'equity': return { equity: equityInactive }
    case 'mf': return { mf: mfInactive }
    case 'dormant2m': return { equity: dormant }
    case 'all':
    default: return { equity: equityInactive, mf: mfInactive }
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const role = await getActiveRole(session.user)
    if (!isManager(role)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const segment = (searchParams.get('segment') ?? 'all') as Segment
    const search = searchParams.get('search')
    const idsOnly = searchParams.get('idsOnly') === 'true'
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '25'))

    const where = segmentWhere(segment, search)
    const [equityRecs, mfRecs] = await Promise.all([
      where.equity ? prisma.client.findMany({ where: where.equity, select: AUDIENCE_SELECT }) : Promise.resolve([]),
      where.mf ? prisma.client.findMany({ where: where.mf, select: AUDIENCE_SELECT }) : Promise.resolve([]),
    ])

    const deduped = dedupeAudienceByPhone([...equityRecs, ...mfRecs])

    if (idsOnly) {
      return NextResponse.json({ success: true, data: { ids: deduped.map((c) => c.id) } })
    }

    const total = deduped.length
    const start = (page - 1) * limit
    const pageItems = deduped.slice(start, start + limit).map((c) => ({
      id: c.id,
      clientCode: c.clientCode,
      name: [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' '),
      phone: normalizeWhatsappPhone(c.phone),
      department: c.department,
    }))

    return NextResponse.json({ success: true, data: { clients: pageItems, total } })
  } catch (error) {
    console.error('[GET /api/whatsapp/audience]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

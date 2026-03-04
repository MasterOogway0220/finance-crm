import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const role = getEffectiveRole(session.user)
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))

    const records = await prisma.monthlyArchive.findMany({
      where: { month, year, entityType: 'BROKERAGE' },
      orderBy: { createdAt: 'asc' },
    })

    type BrokerageData = { operatorId: string; operatorName: string; amount: number; totalClients: number; tradedClients: number }

    const rows = records.map((r) => {
      const d = r.data as BrokerageData
      return {
        operatorId: d.operatorId,
        operatorName: d.operatorName,
        amount: d.amount ?? 0,
        totalClients: d.totalClients ?? 0,
        tradedClients: d.tradedClients ?? 0,
        archivedAt: r.createdAt,
      }
    })

    // Available months/years that have archive data
    const available = await prisma.monthlyArchive.findMany({
      where: { entityType: 'BROKERAGE' },
      select: { month: true, year: true },
      distinct: ['month', 'year'],
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })

    return NextResponse.json({ success: true, data: { month, year, rows, available } })
  } catch (error) {
    console.error('[GET /api/admin/brokerage-archive]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

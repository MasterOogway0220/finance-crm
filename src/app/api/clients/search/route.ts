import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim() || ''
    const department = searchParams.get('department') || undefined

    if (q.length < 1) {
      return NextResponse.json({ success: true, data: [] })
    }

    const clients = await prisma.client.findMany({
      where: {
        OR: [
          { clientCode: { startsWith: q } },
          { firstName: { contains: q } },
          { lastName: { contains: q } },
        ],
        ...(department ? { department: department as 'EQUITY' | 'MUTUAL_FUND' } : {}),
      },
      select: {
        id: true,
        clientCode: true,
        firstName: true,
        middleName: true,
        lastName: true,
      },
      take: 40,
      orderBy: { clientCode: 'asc' },
    })

    // Deduplicate by clientCode — same code can exist in multiple departments
    const seen = new Set<string>()
    const data = clients
      .filter((c) => {
        if (seen.has(c.clientCode)) return false
        seen.add(c.clientCode)
        return true
      })
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        clientCode: c.clientCode,
        name: [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' '),
      }))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[GET /api/clients/search]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

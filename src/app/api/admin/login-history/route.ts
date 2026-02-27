import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/admin/login-history — paginated login/logout history
// ?page=1&limit=50&employeeId=&date=YYYY-MM-DD
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

    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
    const employeeId = searchParams.get('employeeId')
    const date = searchParams.get('date') // YYYY-MM-DD

    const where: Record<string, unknown> = {}
    if (employeeId) where.employeeId = employeeId
    if (date) {
      const from = new Date(date)
      from.setHours(0, 0, 0, 0)
      const to = new Date(date)
      to.setHours(23, 59, 59, 999)
      where.loginAt = { gte: from, lte: to }
    }

    const [total, logs] = await Promise.all([
      prisma.employeeLoginLog.count({ where }),
      prisma.employeeLoginLog.findMany({
        where,
        include: {
          employee: { select: { id: true, name: true, department: true, designation: true } },
        },
        orderBy: { loginAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return NextResponse.json({
      success: true,
      data: logs,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('[GET /api/admin/login-history]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

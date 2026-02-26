import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))
    const operatorIdParam = searchParams.get('operatorId')

    const userRole = getEffectiveRole(session.user)

    // Determine which operatorId to use
    let operatorId: string
    if (userRole === 'EQUITY_DEALER') {
      operatorId = session.user.id
    } else if (operatorIdParam) {
      operatorId = operatorIdParam
    } else {
      return NextResponse.json({ success: false, error: 'operatorId is required' }, { status: 400 })
    }

    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)

    const uploads = await prisma.brokerageUpload.findMany({
      where: {
        uploadDate: { gte: monthStart, lte: monthEnd },
      },
      include: {
        details: {
          where: { operatorId },
          select: { amount: true },
        },
      },
      orderBy: { uploadDate: 'asc' },
    })

    const daily = uploads
      .filter((u) => u.details.length > 0)
      .map((u) => ({
        date: u.uploadDate.toISOString().split('T')[0],
        day: new Date(u.uploadDate).getDate(),
        amount: u.details.reduce((sum, d) => sum + d.amount, 0),
      }))

    return NextResponse.json({
      success: true,
      data: { operatorId, month, year, daily },
    })
  } catch (error) {
    console.error('[GET /api/brokerage/daily]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

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

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))

    const userRole = session.user.role as Role

    // Build date range for the requested month
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)

    // Fetch all equity dealers
    const equityDealerWhere: Record<string, unknown> = {
      role: 'EQUITY_DEALER',
      isActive: true,
    }

    if (userRole === 'EQUITY_DEALER') {
      equityDealerWhere.id = session.user.id
    }

    const operators = await prisma.employee.findMany({
      where: equityDealerWhere,
      select: { id: true, name: true },
    })

    // Fetch brokerage uploads for the month
    const uploads = await prisma.brokerageUpload.findMany({
      where: {
        uploadDate: { gte: monthStart, lte: monthEnd },
      },
      include: {
        details: {
          select: {
            operatorId: true,
            amount: true,
          },
        },
      },
    })

    // Flatten details with dates
    type DetailEntry = { operatorId: string; amount: number; day: number }
    const allDetails: DetailEntry[] = []
    for (const upload of uploads) {
      const day = new Date(upload.uploadDate).getDate()
      for (const detail of upload.details) {
        allDetails.push({
          operatorId: detail.operatorId,
          amount: detail.amount,
          day,
        })
      }
    }

    // Build performance data per operator
    const performance = await Promise.all(
      operators.map(async (op) => {
        const opDetails = allDetails.filter((d) => d.operatorId === op.id)
        const monthlyTotal = opDetails.reduce((sum, d) => sum + d.amount, 0)

        // Daily breakdown: { [day]: amount }
        const dailyBreakdown: Record<string, number> = {}
        for (const d of opDetails) {
          const key = String(d.day)
          dailyBreakdown[key] = (dailyBreakdown[key] ?? 0) + d.amount
        }

        // Client stats for this operator
        const [totalClients, tradedClients, didNotAnswer] = await Promise.all([
          prisma.client.count({ where: { operatorId: op.id } }),
          prisma.client.count({ where: { operatorId: op.id, status: 'TRADED' } }),
          prisma.client.count({ where: { operatorId: op.id, remark: 'DID_NOT_ANSWER' } }),
        ])

        const notTraded = totalClients - tradedClients
        const tradedPercentage = totalClients > 0 ? Math.round((tradedClients / totalClients) * 100) : 0

        return {
          operatorId: op.id,
          operatorName: op.name,
          totalClients,
          tradedClients,
          notTraded,
          tradedPercentage,
          didNotAnswer,
          monthlyTotal,
          dailyBreakdown,
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: { month, year, operators: performance },
    })
  } catch (error) {
    console.error('[GET /api/brokerage]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

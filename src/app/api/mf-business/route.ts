import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { mfBusinessSchema } from '@/lib/validations'
import { logActivity } from '@/lib/activity-log'
import { getEffectiveRole } from '@/lib/roles'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const role = getEffectiveRole(session.user)
    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const myBusinessOnly = searchParams.get('myBusinessOnly') === 'true'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const where: Record<string, unknown> = {
      businessDate: { gte: startDate, lte: endDate },
    }

    // MF_DEALER sees own records only
    if (role === 'MF_DEALER') {
      where.employeeId = session.user.id
      if (myBusinessOnly) {
        where.referredById = null
      }
    } else if (role === 'EQUITY_DEALER') {
      // Equity dealer sees only records where they are the referrer (read-only view)
      where.referredById = session.user.id
    }

    const [records, total] = await Promise.all([
      prisma.mFBusiness.findMany({
        where,
        include: {
          employee: { select: { id: true, name: true } },
          referredBy: { select: { id: true, name: true } },
        },
        orderBy: { businessDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.mFBusiness.count({ where }),
    ])

    const data = records.map((r) => ({
      id: r.id,
      clientCode: r.clientCode,
      clientName: r.clientName,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      referredById: r.referredById,
      referredByName: r.referredBy?.name || null,
      productName: r.productName,
      subProduct: r.subProduct,
      investmentType: r.investmentType,
      sipAmount: r.sipAmount,
      yearlyContribution: r.yearlyContribution,
      commissionPercent: r.commissionPercent,
      commissionAmount: r.commissionAmount,
      businessDate: r.businessDate.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json({ success: true, data, total, page, limit })
  } catch (error) {
    console.error('[GET /api/mf-business]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = mfBusinessSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 })
    }

    const data = parsed.data

    // Server-side commission calculation
    const commissionAmount = (data.yearlyContribution * data.commissionPercent) / 100

    // Try to find client record
    const client = await prisma.client.findFirst({
      where: { clientCode: data.clientCode },
      select: { id: true },
    })

    const record = await prisma.mFBusiness.create({
      data: {
        clientCode: data.clientCode,
        clientName: data.clientName,
        clientId: client?.id || null,
        employeeId: session.user.id,
        referredById: data.referredById || null,
        productName: data.productName,
        subProduct: data.subProduct || null,
        investmentType: data.investmentType,
        sipAmount: data.sipAmount || null,
        yearlyContribution: data.yearlyContribution,
        commissionPercent: data.commissionPercent,
        commissionAmount,
        businessDate: new Date(),
      },
    })

    await logActivity({
      userId: session.user.id,
      action: 'CREATE',
      module: 'MF_BUSINESS',
      details: `Recorded MF business: ${data.clientCode} - ${data.productName} - ${data.yearlyContribution}`,
    })

    return NextResponse.json({ success: true, data: record }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/mf-business]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { clientSchema } from '@/lib/validations'
import { validateClientCode } from '@/lib/client-code-validator'
import { ClientRemark, ClientStatus, Department, MFClientRemark, MFClientStatus, Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '25'))
    const skip = (page - 1) * limit

    const operatorIdParam = searchParams.get('operatorId')
    const status = searchParams.get('status') as ClientStatus | null
    const remark = searchParams.get('remark') as ClientRemark | null
    const mfStatus = searchParams.get('mfStatus') as MFClientStatus | null
    const mfRemark = searchParams.get('mfRemark') as MFClientRemark | null
    const department = searchParams.get('department') as Department | null
    const search = searchParams.get('search')

    const userRole = getEffectiveRole(session.user)

    const where: Record<string, unknown> = {}

    // EQUITY_DEALER can only see their own clients
    if (userRole === 'EQUITY_DEALER') {
      where.operatorId = session.user.id
    } else if (operatorIdParam) {
      where.operatorId = operatorIdParam
    }

    if (status) where.status = status
    if (remark) where.remark = remark
    if (mfStatus) where.mfStatus = mfStatus
    if (mfRemark) where.mfRemark = mfRemark
    if (department) where.department = department

    if (search) {
      where.OR = [
        { clientCode: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: {
          operator: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.client.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        clients,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    console.error('[GET /api/clients]', error)
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
    const parsed = clientSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const data = parsed.data

    if (!validateClientCode(data.clientCode)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid client code format. Accepted: 18K099 (2 digits+letter+3 digits), 91383117 (8 digits), 18KS008 (2 digits+1-5 letters+3 digits)',
        },
        { status: 400 }
      )
    }

    const existing = await prisma.client.findUnique({ where: { clientCode: data.clientCode } })
    if (existing) {
      return NextResponse.json({ success: false, error: 'Client with this code already exists' }, { status: 409 })
    }

    const operatorExists = await prisma.employee.findUnique({ where: { id: data.operatorId } })
    if (!operatorExists) {
      return NextResponse.json({ success: false, error: 'Operator not found' }, { status: 404 })
    }

    const client = await prisma.client.create({
      data: {
        clientCode: data.clientCode,
        firstName: data.firstName,
        middleName: data.middleName,
        lastName: data.lastName,
        phone: data.phone,
        department: data.department as Department,
        operatorId: data.operatorId,
      },
      include: {
        operator: {
          select: { id: true, name: true },
        },
      },
    })

    await logActivity({
      userId: session.user.id,
      action: 'CREATE',
      module: 'CLIENTS',
      details: `Created client: ${client.clientCode} - ${client.firstName} ${client.lastName}`,
    })

    return NextResponse.json({ success: true, data: client }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/clients]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

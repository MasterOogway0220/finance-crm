import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { clientSchema } from '@/lib/validations'
import { validateClientCode } from '@/lib/client-code-validator'
import { ClientRemark, ClientStatus, Department, MFClientRemark, MFClientStatus, Role, Prisma } from '@prisma/client'

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
    const ageRange = searchParams.get('ageRange') // e.g. "10-25"

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

    if (ageRange && ageRange !== 'all') {
      const [minAge, maxAge] = ageRange.split('-').map(Number)
      const now = new Date()
      const dobMax = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate())
      const dobMin = new Date(now.getFullYear() - maxAge, now.getMonth(), now.getDate())
      where.dob = { gte: dobMin, lte: dobMax, not: null }
    }

    if (search) {
      where.OR = [
        { clientCode: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    // idsOnly mode — return just IDs for select-all functionality
    const idsOnly = searchParams.get('idsOnly') === 'true'
    if (idsOnly) {
      const ids = await prisma.client.findMany({
        where,
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
      })
      return NextResponse.json({ success: true, data: { ids: ids.map((c) => c.id) } })
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
            'Invalid client code format. Accepted: 18K099, 411E015, 91383117, 18KS008, 18GO38',
        },
        { status: 400 }
      )
    }

    const isBoth = data.department === 'BOTH'
    const primaryDept = isBoth ? Department.EQUITY : (data.department as Department)

    const existing = await prisma.client.findUnique({
      where: { clientCode_department: { clientCode: data.clientCode, department: primaryDept } },
    })
    if (existing) {
      return NextResponse.json({ success: false, error: 'Client with this code already exists in that department' }, { status: 409 })
    }

    const operatorExists = await prisma.employee.findUnique({ where: { id: data.operatorId } })
    if (!operatorExists) {
      return NextResponse.json({ success: false, error: 'Operator not found' }, { status: 404 })
    }

    const clientFields = {
      clientCode: data.clientCode,
      firstName: data.firstName,
      middleName: data.middleName,
      lastName: data.lastName,
      phone: data.phone,
      email: data.email || null,
      dob: data.dob ?? null,
      pan: data.pan || null,
    }

    const client = await prisma.client.create({
      data: { ...clientFields, department: primaryDept, operatorId: data.operatorId },
      include: { operator: { select: { id: true, name: true } } },
    })

    // For BOTH or pure EQUITY: also create MF record
    if (isBoth || primaryDept === Department.EQUITY) {
      try {
        const mfDealer = await prisma.employee.findFirst({
          where: { role: Role.MF_DEALER, isActive: true },
          orderBy: { assignedClients: { _count: 'asc' } },
        })
        if (mfDealer) {
          await prisma.client.create({
            data: { ...clientFields, phone: data.phone || '0000000000', department: Department.MUTUAL_FUND, operatorId: mfDealer.id },
          })
        }
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
          console.error('Failed to auto-create MF client:', e)
        }
      }
    }

    await logActivity({
      userId: session.user.id,
      action: 'CREATE',
      module: 'CLIENTS',
      details: `Created client: ${client.clientCode} - ${client.firstName} ${client.lastName}${isBoth ? ' (added to both Equity & MF masters)' : ''}`,
    })

    return NextResponse.json({ success: true, data: client }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/clients]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

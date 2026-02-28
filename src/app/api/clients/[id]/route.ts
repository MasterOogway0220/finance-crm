import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { clientUpdateSchema } from '@/lib/validations'
import { Role } from '@prisma/client'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = getEffectiveRole(session.user)
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const existing = await prisma.client.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 })
    }

    // Preserve brokerage history by unlinking client from brokerage details
    await prisma.brokerageDetail.updateMany({
      where: { clientId: id },
      data: { clientId: null },
    })

    await prisma.client.delete({ where: { id } })

    await logActivity({
      userId: session.user.id,
      action: 'DELETE',
      module: 'CLIENTS',
      details: `Deleted client: ${existing.clientCode} - ${existing.firstName} ${existing.lastName}. Historical brokerage records preserved.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/clients/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        operator: {
          select: { id: true, name: true, email: true, department: true },
        },
      },
    })

    if (!client) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 })
    }

    const userRole = getEffectiveRole(session.user)
    if (userRole === 'EQUITY_DEALER' && client.operatorId !== session.user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ success: true, data: client })
  } catch (error) {
    console.error('[GET /api/clients/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = clientUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const existing = await prisma.client.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 })
    }

    const userRole = getEffectiveRole(session.user)
    if (userRole === 'EQUITY_DEALER' && existing.operatorId !== session.user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const data = parsed.data
    const updateData: Record<string, unknown> = { ...data }

    // Auto-set remark to SUCCESSFULLY_TRADED when status changes to TRADED and remark not provided
    if (data.status === 'TRADED' && !data.remark) {
      updateData.remark = 'SUCCESSFULLY_TRADED'
    }

    const client = await prisma.client.update({
      where: { id },
      data: updateData,
      include: {
        operator: {
          select: { id: true, name: true },
        },
      },
    })

    await logActivity({
      userId: session.user.id,
      action: 'UPDATE',
      module: 'CLIENTS',
      details: `Updated client: ${client.clientCode} - status: ${client.status}, remark: ${client.remark}`,
    })

    return NextResponse.json({ success: true, data: client })
  } catch (error) {
    console.error('[PATCH /api/clients/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

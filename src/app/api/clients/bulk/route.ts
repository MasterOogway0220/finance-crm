import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { bulkClientUpdateSchema } from '@/lib/validations'
import { Department } from '@prisma/client'
import { z } from 'zod'

const bulkDeleteSchema = z.object({
  clientIds: z.array(z.string()).min(1, 'Select at least one client'),
  deleteFromMF: z.boolean().optional(),
})

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = bulkClientUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const { clientIds, status, remark, mfStatus, mfRemark, operatorId } = parsed.data
    const userRole = getEffectiveRole(session.user)

    // For EQUITY_DEALER: verify all clientIds belong to their operator account
    if (userRole === 'EQUITY_DEALER') {
      const clientsCount = await prisma.client.count({
        where: {
          id: { in: clientIds },
          operatorId: session.user.id,
        },
      })

      if (clientsCount !== clientIds.length) {
        return NextResponse.json(
          { success: false, error: 'One or more clients do not belong to your account' },
          { status: 403 }
        )
      }
    }

    const updateData: Record<string, unknown> = {}
    if (status !== undefined) updateData.status = status
    if (remark !== undefined) updateData.remark = remark
    if (mfStatus !== undefined) updateData.mfStatus = mfStatus
    if (mfRemark !== undefined) updateData.mfRemark = mfRemark
    if (operatorId !== undefined) updateData.operatorId = operatorId

    // Auto-set remark when status is TRADED and remark not explicitly provided
    if (status === 'TRADED' && remark === undefined) {
      updateData.remark = 'SUCCESSFULLY_TRADED'
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No update fields provided' },
        { status: 400 }
      )
    }

    const result = await prisma.client.updateMany({
      where: { id: { in: clientIds } },
      data: updateData,
    })

    await logActivity({
      userId: session.user.id,
      action: 'BULK_UPDATE',
      module: 'CLIENTS',
      details: `Bulk updated ${result.count} clients. Fields: ${Object.keys(updateData).join(', ')}`,
    })

    return NextResponse.json({
      success: true,
      data: { updatedCount: result.count },
    })
  } catch (error) {
    console.error('[PATCH /api/clients/bulk]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = getEffectiveRole(session.user)
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = bulkDeleteSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const { clientIds, deleteFromMF } = parsed.data

    // Unlink clients from brokerage records to preserve history
    await prisma.brokerageDetail.updateMany({
      where: { clientId: { in: clientIds } },
      data: { clientId: null },
    })

    // If deleting equity clients and user chose to also delete from MF
    if (deleteFromMF) {
      const equityClients = await prisma.client.findMany({
        where: { id: { in: clientIds }, department: Department.EQUITY },
        select: { clientCode: true },
      })
      const equityCodes = equityClients.map(c => c.clientCode)

      if (equityCodes.length > 0) {
        await prisma.client.deleteMany({
          where: {
            clientCode: { in: equityCodes },
            department: Department.MUTUAL_FUND,
          },
        })
      }
    }

    const result = await prisma.client.deleteMany({
      where: { id: { in: clientIds } },
    })

    await logActivity({
      userId: session.user.id,
      action: 'BULK_DELETE',
      module: 'CLIENTS',
      details: `Bulk deleted ${result.count} clients. Brokerage records preserved.${deleteFromMF ? ' Also removed from MF master.' : ''}`,
    })

    return NextResponse.json({
      success: true,
      data: { deletedCount: result.count },
    })
  } catch (error) {
    console.error('[DELETE /api/clients/bulk]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

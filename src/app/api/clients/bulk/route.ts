import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { bulkClientUpdateSchema } from '@/lib/validations'
import { Role } from '@prisma/client'

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

    const { clientIds, status, remark, mfStatus, mfRemark } = parsed.data
    const userRole = session.user.role as Role

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

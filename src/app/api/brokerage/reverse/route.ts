import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { invalidateCache } from '@/lib/cache'
import { resyncEquityClientStatus } from '@/lib/brokerage-status'

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = (await getActiveRole(session.user))
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { uploadId, uploadIds } = body

    // Support both single uploadId and bulk uploadIds
    const ids: string[] = uploadIds ?? (uploadId ? [uploadId] : [])

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: 'Upload ID(s) required' }, { status: 400 })
    }

    const uploads = await prisma.brokerageUpload.findMany({
      where: { id: { in: ids } },
      select: { id: true, uploadDate: true, fileName: true, totalAmount: true, details: { select: { clientId: true } } },
    })

    if (uploads.length === 0) {
      return NextResponse.json({ success: false, error: 'No uploads found' }, { status: 404 })
    }

    // Collect client IDs from uploads being reversed
    const reversedClientIds = [
      ...new Set(uploads.flatMap(u => u.details.map(d => d.clientId).filter(Boolean) as string[]))
    ]

    // Cascade delete removes all BrokerageDetail records automatically, then re-derive
    // Client.status for every affected client from the remaining active brokerage data.
    // (A single source of truth — restores TRADED as well as resetting, so the flag
    // can't get stuck NOT_TRADED after a delete + re-activate sequence.)
    await prisma.$transaction(async (tx) => {
      await tx.brokerageUpload.deleteMany({ where: { id: { in: uploads.map(u => u.id) } } })
      await resyncEquityClientStatus(tx, reversedClientIds)
    })

    const totalAmount = uploads.reduce((s, u) => s + u.totalAmount, 0)
    await logActivity({
      userId: session.user.id,
      action: 'DELETE',
      module: 'BROKERAGE',
      details: `Reversed ${uploads.length} brokerage upload(s): ${uploads.map(u => u.fileName).join(', ')} (Total: ₹${totalAmount.toFixed(2)})`,
    })

    invalidateCache('dashboard:')

    return NextResponse.json({ success: true, data: { reversedCount: uploads.length } })
  } catch (error) {
    console.error('[DELETE /api/brokerage/reverse]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

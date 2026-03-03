import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'

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
    const { uploadId, uploadIds } = body

    // Support both single uploadId and bulk uploadIds
    const ids: string[] = uploadIds ?? (uploadId ? [uploadId] : [])

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: 'Upload ID(s) required' }, { status: 400 })
    }

    const uploads = await prisma.brokerageUpload.findMany({
      where: { id: { in: ids } },
      select: { id: true, uploadDate: true, fileName: true, totalAmount: true },
    })

    if (uploads.length === 0) {
      return NextResponse.json({ success: false, error: 'No uploads found' }, { status: 404 })
    }

    // Cascade delete removes all BrokerageDetail records automatically
    await prisma.brokerageUpload.deleteMany({ where: { id: { in: uploads.map(u => u.id) } } })

    const totalAmount = uploads.reduce((s, u) => s + u.totalAmount, 0)
    await logActivity({
      userId: session.user.id,
      action: 'DELETE',
      module: 'BROKERAGE',
      details: `Reversed ${uploads.length} brokerage upload(s): ${uploads.map(u => u.fileName).join(', ')} (Total: ₹${totalAmount.toFixed(2)})`,
    })

    return NextResponse.json({ success: true, data: { reversedCount: uploads.length } })
  } catch (error) {
    console.error('[DELETE /api/brokerage/reverse]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

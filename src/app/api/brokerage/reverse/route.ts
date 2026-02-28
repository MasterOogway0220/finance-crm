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
    const { uploadId } = body

    if (!uploadId) {
      return NextResponse.json({ success: false, error: 'Upload ID is required' }, { status: 400 })
    }

    const upload = await prisma.brokerageUpload.findUnique({
      where: { id: uploadId },
      select: { id: true, uploadDate: true, fileName: true, totalAmount: true },
    })

    if (!upload) {
      return NextResponse.json({ success: false, error: 'Upload not found' }, { status: 404 })
    }

    // Cascade delete removes all BrokerageDetail records automatically
    await prisma.brokerageUpload.delete({ where: { id: uploadId } })

    await logActivity({
      userId: session.user.id,
      action: 'DELETE',
      module: 'BROKERAGE',
      details: `Reversed brokerage upload: ${upload.fileName} (${upload.uploadDate.toISOString().split('T')[0]}, ₹${upload.totalAmount.toFixed(2)})`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/brokerage/reverse]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

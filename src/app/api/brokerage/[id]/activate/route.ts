import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { invalidateCache } from '@/lib/cache'
import { resyncEquityClientStatus } from '@/lib/brokerage-status'
import { Prisma } from '@prisma/client'

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const role = (await getActiveRole(session.user))
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const target = await prisma.brokerageUpload.findUnique({
      where: { id },
      select: { id: true, uploadDate: true, branch: true, version: true, isActive: true },
    })
    if (!target) {
      return NextResponse.json({ success: false, error: 'Upload not found' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      // Every client appearing in any version of this (date, branch) group may have
      // their traded status changed by the active-version switch — collect them first.
      const groupUploads = await tx.brokerageUpload.findMany({
        where: { uploadDate: target.uploadDate, branch: target.branch },
        select: { id: true },
      })
      const affected = await tx.brokerageDetail.findMany({
        where: { brokerageId: { in: groupUploads.map((u) => u.id) }, clientId: { not: null } },
        select: { clientId: true },
        distinct: ['clientId'],
      })

      await tx.brokerageUpload.updateMany({
        where: { uploadDate: target.uploadDate, branch: target.branch },
        data: { isActive: false },
      })
      await tx.brokerageUpload.update({
        where: { id },
        data: { isActive: true },
      })

      // Re-derive Client.status from the now-active brokerage data so the flag
      // can't drift when versions are toggled (the original bug). status always
      // reflects the *current* month, so resync against now (default ref).
      await resyncEquityClientStatus(tx, affected.map((a) => a.clientId))
    })

    invalidateCache('dashboard:')

    return NextResponse.json({ success: true, data: { activatedId: id, version: target.version, alreadyActive: target.isActive } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ success: false, error: 'Upload not found' }, { status: 404 })
    }
    console.error('[PATCH /api/brokerage/[id]/activate]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

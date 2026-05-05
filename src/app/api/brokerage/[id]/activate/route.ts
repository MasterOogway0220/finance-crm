import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { invalidateCache } from '@/lib/cache'
import { Prisma } from '@prisma/client'

export async function PATCH(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const role = getEffectiveRole(session.user)
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const target = await prisma.brokerageUpload.findUnique({
      where: { id: params.id },
      select: { id: true, uploadDate: true, branch: true, version: true, isActive: true },
    })
    if (!target) {
      return NextResponse.json({ success: false, error: 'Upload not found' }, { status: 404 })
    }

    await prisma.$transaction([
      prisma.brokerageUpload.updateMany({
        where: { uploadDate: target.uploadDate, branch: target.branch },
        data: { isActive: false },
      }),
      prisma.brokerageUpload.update({
        where: { id: params.id },
        data: { isActive: true },
      }),
    ])

    invalidateCache('dashboard:')

    return NextResponse.json({ success: true, data: { activatedId: params.id, version: target.version, alreadyActive: target.isActive } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ success: false, error: 'Upload not found' }, { status: 404 })
    }
    console.error('[PATCH /api/brokerage/[id]/activate]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

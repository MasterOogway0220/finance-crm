import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = getEffectiveRole(session.user)
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    const uploads = await prisma.brokerageUpload.findMany({
      where: {
        uploadDate: { gte: startDate, lte: endDate },
      },
      include: {
        uploadedBy: { select: { name: true } },
      },
      orderBy: { uploadDate: 'desc' },
    })

    const log = uploads.map((u) => ({
      id: u.id,
      uploadDate: u.uploadDate,
      fileName: u.fileName,
      totalAmount: u.totalAmount,
      uploadedBy: u.uploadedBy.name,
      createdAt: u.createdAt,
    }))

    return NextResponse.json({ success: true, data: log })
  } catch (error) {
    console.error('[GET /api/brokerage/log]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

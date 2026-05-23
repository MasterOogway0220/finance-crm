import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const [latestArchive, latestUpload] = await Promise.all([
      prisma.monthlyArchive.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.brokerageUpload.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])

    const times = [latestArchive?.createdAt, latestUpload?.createdAt].filter(
      (t): t is Date => t !== undefined,
    )
    const lastUpdated =
      times.length > 0
        ? new Date(Math.max(...times.map((t) => t.getTime())))
        : new Date(0)

    return NextResponse.json({ lastUpdated: lastUpdated.toISOString() })
  } catch (error) {
    console.error('[GET /api/reset-status]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

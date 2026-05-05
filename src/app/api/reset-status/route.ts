import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
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
}

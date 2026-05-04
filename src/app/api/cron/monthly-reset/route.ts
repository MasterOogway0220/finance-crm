import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { invalidateCache } from '@/lib/cache'

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await prisma.client.updateMany({
      where: { status: 'TRADED' },
      data: { status: 'NOT_TRADED' },
    })

    // Invalidate all dashboard caches so next load reflects the reset
    invalidateCache('dashboard:admin')
    invalidateCache('dashboard:equity')

    return NextResponse.json({
      success: true,
      data: { resetCount: result.count },
      message: `Reset ${result.count} clients to NOT_TRADED`,
    })
  } catch (error) {
    console.error('[POST /api/cron/monthly-reset]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

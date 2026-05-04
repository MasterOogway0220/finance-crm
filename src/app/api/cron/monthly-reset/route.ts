import { NextRequest, NextResponse } from 'next/server'
import { runMonthlyReset } from '@/lib/monthly-reset'
import { invalidateCache } from '@/lib/cache'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runMonthlyReset()

    invalidateCache('dashboard:admin')
    invalidateCache('dashboard:equity')

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('[POST /api/cron/monthly-reset]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

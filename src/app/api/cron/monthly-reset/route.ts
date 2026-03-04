import { NextRequest, NextResponse } from 'next/server'
import { runMonthlyReset } from '@/lib/monthly-reset'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret && cronSecret === process.env.CRON_SECRET) return true
  return false
}

// GET: called by Vercel cron (Authorization: Bearer <CRON_SECRET>)
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await runMonthlyReset()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[GET /api/cron/monthly-reset]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST: manual trigger (x-cron-secret header)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await runMonthlyReset()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[POST /api/cron/monthly-reset]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

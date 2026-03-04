import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { runYearReset, ANNUAL_LEAVE_DAYS } from '@/lib/year-leave-reset'

// POST /api/leaves/year-reset
// Admin-triggered manual reset. Body: { year?: number } — defaults to current year.
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const role = getEffectiveRole(session.user)
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const year: number = body.year ?? new Date().getFullYear()

    const result = await runYearReset(year)

    return NextResponse.json({
      success: true,
      message: `${result.total} employee(s) reset to ${ANNUAL_LEAVE_DAYS} leaves for ${year}.`,
      data: result,
    })
  } catch (error) {
    console.error('[POST /api/leaves/year-reset]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true
  const manualSecret = request.headers.get('x-cron-secret')
  if (manualSecret && manualSecret === process.env.CRON_SECRET) return true
  return false
}

// GET /api/leaves/year-reset
// Cron-triggered on Jan 1. Secured by CRON_SECRET env var (Authorization: Bearer <secret>).
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const year = new Date().getFullYear()
    const result = await runYearReset(year)

    return NextResponse.json({
      success: true,
      message: `Yearly leave reset complete for ${year} — ${result.total} employee(s) set to ${ANNUAL_LEAVE_DAYS} days.`,
      data: result,
    })
  } catch (error) {
    console.error('[GET /api/leaves/year-reset]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

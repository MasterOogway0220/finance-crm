import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const ANNUAL_LEAVE_DAYS = 30

// Upserts a LeaveBalance record for every active employee for the given year,
// setting totalLeaves to ANNUAL_LEAVE_DAYS. Existing records are overwritten
// so everyone gets a clean 30-day allocation on each yearly reset.
async function runYearReset(year: number) {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  await Promise.all(
    employees.map((emp) =>
      prisma.leaveBalance.upsert({
        where: { employeeId_year: { employeeId: emp.id, year } },
        update: { totalLeaves: ANNUAL_LEAVE_DAYS },
        create: { employeeId: emp.id, year, totalLeaves: ANNUAL_LEAVE_DAYS },
      })
    )
  )

  return { year, total: employees.length }
}

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

// GET /api/leaves/year-reset
// Cron-triggered on Jan 1. Secured by CRON_SECRET env var (Authorization: Bearer <secret>).
export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

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

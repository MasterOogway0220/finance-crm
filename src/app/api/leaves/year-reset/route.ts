import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Shared reset logic: creates a zero-balance LeaveBalance record for every active
// employee for the given year. Existing records for that year are untouched so
// any admin-set allocations are preserved — only missing records are inserted.
async function runYearReset(year: number) {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  let created = 0
  for (const emp of employees) {
    const existing = await prisma.leaveBalance.findUnique({
      where: { employeeId_year: { employeeId: emp.id, year } },
    })
    if (!existing) {
      await prisma.leaveBalance.create({
        data: { employeeId: emp.id, year, totalLeaves: 0 },
      })
      created++
    }
  }

  return { year, total: employees.length, created, alreadyExisted: employees.length - created }
}

// POST /api/leaves/year-reset
// Admin-triggered manual reset (e.g. button in UI or direct API call).
// Body: { year?: number }  — defaults to current year
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
      message: `Year ${year} initialised — ${result.created} new balance record(s) created, ${result.alreadyExisted} already existed.`,
      data: result,
    })
  } catch (error) {
    console.error('[POST /api/leaves/year-reset]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/leaves/year-reset
// Cron-triggered reset (Vercel cron calls GET). Secured by CRON_SECRET env var.
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
      message: `Yearly leave reset complete for ${year}.`,
      data: result,
    })
  } catch (error) {
    console.error('[GET /api/leaves/year-reset]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

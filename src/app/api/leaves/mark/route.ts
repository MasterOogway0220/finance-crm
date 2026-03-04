import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { ANNUAL_LEAVE_DAYS } from '@/app/api/leaves/year-reset/route'

// POST /api/leaves/mark — admin marks a specific employee as absent on given date(s)
// Creates a leave application that is immediately APPROVED, bypassing normal flow
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

    const body = await request.json()
    const { employeeId, fromDate, toDate, days, note } = body

    if (!employeeId || !fromDate || !toDate || !days || days < 1) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, department: true },
    })
    if (!employee) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 })
    }

    // Parse dates as explicit UTC to avoid timezone shifting
    // fromDate/toDate are "YYYY-MM-DD" strings from input[type="date"]
    const from = new Date(fromDate + 'T00:00:00.000Z')
    const to = new Date(toDate + 'T00:00:00.000Z')

    if (from > to) {
      return NextResponse.json({ success: false, error: 'From date must be before to date' }, { status: 400 })
    }

    // Check for overlapping leaves using UTC date boundaries
    const toEnd = new Date(toDate + 'T23:59:59.999Z')
    const overlap = await prisma.leaveApplication.findFirst({
      where: {
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        fromDate: { lte: toEnd },
        toDate: { gte: from },
      },
    })
    if (overlap) {
      return NextResponse.json(
        { success: false, error: 'An overlapping leave already exists for this employee on this date' },
        { status: 409 }
      )
    }

    // Check leave balance against approved days (mark is directly approved)
    const leaveYear = from.getUTCFullYear()
    const [balance, usedAgg] = await Promise.all([
      prisma.leaveBalance.findUnique({
        where: { employeeId_year: { employeeId, year: leaveYear } },
        select: { totalLeaves: true },
      }),
      prisma.leaveApplication.aggregate({
        where: {
          employeeId,
          status: 'APPROVED',
          fromDate: {
            gte: new Date(`${leaveYear}-01-01T00:00:00.000Z`),
            lte: new Date(`${leaveYear}-12-31T23:59:59.999Z`),
          },
        },
        _sum: { days: true },
      }),
    ])
    const totalLeaves = balance?.totalLeaves ?? ANNUAL_LEAVE_DAYS
    const usedDays = usedAgg._sum.days ?? 0
    const remaining = totalLeaves - usedDays
    if (days > remaining) {
      return NextResponse.json(
        { success: false, error: `Insufficient leave balance. ${employee.name} has only ${remaining} day(s) remaining out of ${totalLeaves} for ${leaveYear}.` },
        { status: 400 }
      )
    }

    // Create leave directly as APPROVED
    // Store both dates at UTC midnight so frontend can extract date-only reliably
    const application = await prisma.leaveApplication.create({
      data: {
        employeeId,
        reason: note?.trim() || 'Marked absent by admin (emergency/WhatsApp notification)',
        fromDate: from,
        toDate: to,
        days,
        status: 'APPROVED',
        reviewedById: session.user.id,
        reviewNote: 'Directly marked by admin',
      },
      include: {
        employee: { select: { id: true, name: true, department: true, designation: true } },
      },
    })

    // Notify the employee
    const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    const rangeStr = fromDate === toDate ? fmt(from) : `${fmt(from)} – ${fmt(to)}`
    await createNotification({
      userId: employeeId,
      type: 'LEAVE_APPROVED',
      title: 'Absence Recorded',
      message: `Admin has recorded your absence for ${rangeStr} (${days} working day${days > 1 ? 's' : ''}). This has been deducted from your leave balance.`,
      link: '/calendar',
    })

    return NextResponse.json({ success: true, data: application }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/leaves/mark]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

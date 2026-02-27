import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

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
    const { employeeId, date, days, note } = body

    if (!employeeId || !date || !days || days < 1) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, department: true },
    })
    if (!employee) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 })
    }

    const from = new Date(date)
    from.setHours(0, 0, 0, 0)

    // Calculate end date based on days (simple: add days-1 to start, skipping weekends not required here since admin sets exact days)
    const to = new Date(from)
    to.setDate(to.getDate() + (days - 1))
    to.setHours(23, 59, 59, 999)

    // Check for overlapping leaves
    const overlap = await prisma.leaveApplication.findFirst({
      where: {
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        fromDate: { lte: to },
        toDate: { gte: from },
      },
    })
    if (overlap) {
      return NextResponse.json(
        { success: false, error: 'An overlapping leave already exists for this employee on this date' },
        { status: 409 }
      )
    }

    // Create leave directly as APPROVED
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
    const dateStr = from.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    await createNotification({
      userId: employeeId,
      type: 'LEAVE_APPROVED',
      title: 'Absence Recorded',
      message: `Admin has recorded your absence on ${dateStr} (${days} day${days > 1 ? 's' : ''}). This has been deducted from your leave balance.`,
      link: '/calendar',
    })

    return NextResponse.json({ success: true, data: application }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/leaves/mark]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

// GET /api/leaves — list leave applications
// Admin: all applications; Employee: only their own
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const role = getEffectiveRole(session.user)
    const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status') // optional filter
    const employeeId = searchParams.get('employeeId') // admin only filter

    const where: Record<string, unknown> = {}

    if (!isAdmin) {
      where.employeeId = session.user.id
    } else if (employeeId) {
      where.employeeId = employeeId
    }

    if (status) {
      where.status = status
    }

    const applications = await prisma.leaveApplication.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true, department: true, designation: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, data: applications })
  } catch (error) {
    console.error('[GET /api/leaves]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/leaves — apply for leave
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const role = getEffectiveRole(session.user)
    const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'

    const body = await request.json()
    const { employeeId, reason, fromDate, toDate, days } = body

    if (!reason?.trim() || !fromDate || !toDate || !days || days < 1) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    // Non-admin can only apply for themselves
    const targetEmployeeId = isAdmin && employeeId ? employeeId : session.user.id

    // Ensure target employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: targetEmployeeId },
      select: { id: true, name: true, department: true },
    })
    if (!employee) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 })
    }

    const from = new Date(fromDate)
    const to = new Date(toDate)
    if (from > to) {
      return NextResponse.json({ success: false, error: 'From date must be before to date' }, { status: 400 })
    }

    // Check for overlapping leaves (pending or approved)
    const overlap = await prisma.leaveApplication.findFirst({
      where: {
        employeeId: targetEmployeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        fromDate: { lte: to },
        toDate: { gte: from },
      },
    })
    if (overlap) {
      return NextResponse.json(
        { success: false, error: 'An overlapping leave application already exists for this period' },
        { status: 409 }
      )
    }

    const application = await prisma.leaveApplication.create({
      data: {
        employeeId: targetEmployeeId,
        reason: reason.trim(),
        fromDate: from,
        toDate: to,
        days,
      },
      include: {
        employee: { select: { id: true, name: true, department: true, designation: true } },
      },
    })

    // Notify admins of new leave application (exclude the applicant themselves)
    const admins = await prisma.employee.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true, id: { not: targetEmployeeId } },
      select: { id: true },
    })
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          type: 'LEAVE_APPLIED',
          title: 'New Leave Application',
          message: `${employee.name} (${employee.department}) has applied for ${days} day(s) of leave from ${formatDate(from)} to ${formatDate(to)}.`,
          link: '/calendar',
        })
      )
    )

    return NextResponse.json({ success: true, data: application }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/leaves]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

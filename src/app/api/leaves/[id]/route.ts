import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

// PATCH /api/leaves/[id] — approve / reject (admin) or cancel (employee)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const role = getEffectiveRole(session.user)
    const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'

    const { id } = await params
    const body = await request.json()
    const { action, reviewNote } = body // action: 'APPROVED' | 'REJECTED' | 'CANCELLED'

    const application = await prisma.leaveApplication.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, name: true, department: true } },
      },
    })

    if (!application) {
      return NextResponse.json({ success: false, error: 'Leave application not found' }, { status: 404 })
    }

    // Validate permissions
    if (action === 'CANCELLED') {
      // Only the employee themselves can cancel
      if (application.employeeId !== session.user.id && !isAdmin) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }
      if (application.status !== 'PENDING') {
        return NextResponse.json(
          { success: false, error: 'Only pending applications can be cancelled' },
          { status: 400 }
        )
      }
    } else if (action === 'APPROVED' || action === 'REJECTED') {
      if (!isAdmin) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }
      if (application.status !== 'PENDING') {
        return NextResponse.json(
          { success: false, error: 'Only pending applications can be approved or rejected' },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = { status: action }
    if (isAdmin && (action === 'APPROVED' || action === 'REJECTED')) {
      updateData.reviewedById = session.user.id
      if (reviewNote?.trim()) {
        updateData.reviewNote = reviewNote.trim()
      }
    }

    const updated = await prisma.leaveApplication.update({
      where: { id },
      data: updateData,
      include: {
        employee: { select: { id: true, name: true, department: true, designation: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    })

    // Notify the employee of the outcome
    if (action === 'APPROVED' || action === 'REJECTED') {
      const from = application.fromDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      const to = application.toDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      await createNotification({
        userId: application.employeeId,
        type: action === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        title: action === 'APPROVED' ? 'Leave Approved' : 'Leave Rejected',
        message:
          action === 'APPROVED'
            ? `Your leave request for ${from} – ${to} (${application.days} day(s)) has been approved.`
            : `Your leave request for ${from} – ${to} (${application.days} day(s)) has been rejected.${reviewNote ? ` Reason: ${reviewNote}` : ''}`,
        link: '/calendar',
      })
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('[PATCH /api/leaves/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

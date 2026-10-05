import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { istDateKey } from '@/lib/work-hours'

// PATCH /api/extra-time/[id] — approve / reject (Super Admin) or cancel (applicant)
// body: { action: 'APPROVED' | 'REJECTED' | 'CANCELLED', reviewNote? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { action, reviewNote } = await request.json()

    const existing = await prisma.extraTimeRequest.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 })
    }
    if (existing.status !== 'PENDING') {
      return NextResponse.json({ success: false, error: 'Only pending requests can be changed' }, { status: 400 })
    }

    if (action === 'APPROVED' || action === 'REJECTED') {
      if ((await getActiveRole(session.user)) !== 'SUPER_ADMIN') {
        return NextResponse.json({ success: false, error: 'Only a Super Admin can review extra time' }, { status: 403 })
      }
    } else if (action === 'CANCELLED') {
      if (existing.employeeId !== session.user.id) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
      }
    } else {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
    }

    const note = typeof reviewNote === 'string' && reviewNote.trim() ? reviewNote.trim() : null
    const isReview = action !== 'CANCELLED'
    // Conditional on still PENDING so two reviewers can't both act on it.
    const { count } = await prisma.extraTimeRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: action, ...(isReview ? { reviewedById: session.user.id, reviewNote: note } : {}) },
    })
    if (count === 0) {
      return NextResponse.json({ success: false, error: 'Only pending requests can be changed' }, { status: 400 })
    }

    if (isReview) {
      const approved = action === 'APPROVED'
      await createNotification({
        userId: existing.employeeId,
        type: approved ? 'EXTRA_TIME_APPROVED' : 'EXTRA_TIME_REJECTED',
        title: approved ? 'Extra Time Approved' : 'Extra Time Rejected',
        message:
          `Your extra time request for ${istDateKey(existing.startAt)} has been ${approved ? 'approved' : 'rejected'}.` +
          (note ? ` Note: ${note}` : ''),
        link: '/extra-time',
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/extra-time/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

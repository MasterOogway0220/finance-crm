import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { recurringTaskUpdateSchema } from '@/lib/validations'
import { nextRunGuard } from '@/lib/recurring-tasks'
import { TaskPriority } from '@prisma/client'

// Creator or admin may edit/stop a monthly assignment template.
async function authorize(id: string) {
  const session = await auth()
  if (!session?.user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }
  const recurring = await prisma.recurringTask.findUnique({
    where: { id },
    include: { assignedTo: { select: { name: true } } },
  })
  if (!recurring) {
    return { error: NextResponse.json({ success: false, error: 'Not found' }, { status: 404 }) }
  }
  const userRole = await getActiveRole(session.user)
  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'
  if (!isAdmin && recurring.assignedById !== session.user.id) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }
  return { session, recurring }
}

// PATCH /api/recurring-tasks/[id] — edit the template
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { error, session, recurring } = await authorize(id)
    if (error) return error

    const parsed = recurringTaskUpdateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }
    const data = parsed.data

    // Optimistic claim on lastRunPeriod (same idiom as the heartbeat): if the
    // heartbeat fired this month's task between our read and this write, the
    // stale value no longer matches and we bail instead of re-arming the month.
    const { count } = await prisma.recurringTask.updateMany({
      where: { id, lastRunPeriod: recurring.lastRunPeriod },
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority as TaskPriority,
        assignDay: data.assignDay,
        dueDay: data.dueDay,
        // Re-guard for the new dates: a day already past this month starts next
        // month; an already-run month is not fired twice.
        lastRunPeriod: nextRunGuard(data.assignDay, data.dueDay, recurring.lastRunPeriod, new Date()),
      },
    })
    if (count === 0) {
      return NextResponse.json(
        { success: false, error: 'This assignment just ran — please try again' },
        { status: 409 }
      )
    }

    const updated = await prisma.recurringTask.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, department: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    })
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    await logActivity({
      userId: session.user.id,
      action: 'UPDATE',
      module: 'TASKS',
      details: `Updated monthly task assignment: "${updated.title}" for ${recurring.assignedTo.name} (assign day ${data.assignDay}, due day ${data.dueDay})`,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('[PATCH /api/recurring-tasks/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/recurring-tasks/[id] — stop the monthly assignment
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { error, session, recurring } = await authorize(id)
    if (error) return error

    await prisma.recurringTask.delete({ where: { id } })

    await logActivity({
      userId: session.user.id,
      action: 'DELETE',
      module: 'TASKS',
      details: `Stopped monthly task assignment: "${recurring.title}" for ${recurring.assignedTo.name}`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/recurring-tasks/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

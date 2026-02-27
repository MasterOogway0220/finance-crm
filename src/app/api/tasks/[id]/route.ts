import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { createNotification } from '@/lib/notifications'
import { Role } from '@prisma/client'
import { z } from 'zod'

const updateTaskSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'EXPIRED']).optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(10).optional(),
  deadline: z.coerce.date().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, department: true, designation: true } },
        assignedBy: { select: { id: true, name: true, department: true } },
      },
    })

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    const userRole = getEffectiveRole(session.user)
    if (
      userRole === 'BACK_OFFICE' &&
      task.assignedToId !== session.user.id &&
      task.assignedById !== session.user.id
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ success: true, data: task })
  } catch (error) {
    console.error('[GET /api/tasks/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = updateTaskSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const userRole = getEffectiveRole(session.user)

    const existing = await prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, department: true } },
        assignedBy: { select: { id: true, name: true, department: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    const data = parsed.data
    const isContentEdit = !!(data.title || data.description || data.priority || data.deadline)

    // BACK_OFFICE can only update status (mark complete), not edit content
    if (isContentEdit && userRole === 'BACK_OFFICE') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // No content edits allowed once a task is completed or expired
    if (isContentEdit && existing.status !== 'PENDING') {
      return NextResponse.json(
        { success: false, error: 'Cannot edit a task that is completed or expired' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = { ...data }

    if (data.status === 'COMPLETED') {
      if (existing.status === 'COMPLETED') {
        return NextResponse.json({ success: false, error: 'Task is already completed' }, { status: 400 })
      }

      if (existing.status === 'EXPIRED' || existing.deadline < new Date()) {
        return NextResponse.json({ success: false, error: 'Task has expired' }, { status: 400 })
      }

      updateData.completedAt = new Date()
    }

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, name: true, department: true } },
        assignedBy: { select: { id: true, name: true, department: true } },
      },
    })

    // Notify assigner when task is completed (and assigner is not the same as current user)
    if (data.status === 'COMPLETED' && existing.assignedById !== session.user.id) {
      await createNotification({
        userId: existing.assignedById,
        type: 'TASK_COMPLETED',
        title: 'Task completed',
        message: `Task "${existing.title}" has been completed by ${existing.assignedTo.name}`,
        link: `/tasks/${id}`,
      })
    }

    // Notify Back Office assignee when task content is edited while pending
    if (isContentEdit && existing.status === 'PENDING') {
      await createNotification({
        userId: existing.assignedToId,
        type: 'TASK_EDITED',
        title: 'Task updated — please review',
        message: `"${existing.title}" was updated by ${existing.assignedBy.name}. Open the task to check the latest details before completing it.`,
        link: `/backoffice/tasks`,
      })
    }

    await logActivity({
      userId: session.user.id,
      action: 'UPDATE',
      module: 'TASKS',
      details: isContentEdit
        ? `Edited task "${existing.title}"`
        : `Updated task "${existing.title}" - status: ${task.status}`,
    })

    return NextResponse.json({ success: true, data: task })
  } catch (error) {
    console.error('[PATCH /api/tasks/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

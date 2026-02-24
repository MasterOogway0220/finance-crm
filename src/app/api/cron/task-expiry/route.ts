import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { createNotificationForMany } from '@/lib/notifications'

export async function POST(request: NextRequest) {
  try {
    const cronSecret = request.headers.get('x-cron-secret')
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    // Find all PENDING tasks with deadline < now
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: 'PENDING',
        deadline: { lt: now },
      },
      select: {
        id: true,
        title: true,
        assignedToId: true,
        assignedById: true,
      },
    })

    if (overdueTasks.length === 0) {
      return NextResponse.json({
        success: true,
        data: { expiredCount: 0, message: 'No overdue tasks found' },
      })
    }

    // Update all overdue tasks to EXPIRED
    const taskIds = overdueTasks.map((t) => t.id)
    await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: { status: 'EXPIRED' },
    })

    // Collect unique user IDs (assignees and assigners) to notify
    const assigneeIds = [...new Set(overdueTasks.map((t) => t.assignedToId))]
    const assignerIds = [...new Set(overdueTasks.map((t) => t.assignedById))]
    const allUserIds = [...new Set([...assigneeIds, ...assignerIds])]

    // Create notifications per user
    await createNotificationForMany({
      userIds: allUserIds,
      type: 'TASK_EXPIRED',
      title: 'Tasks expired',
      message: `${overdueTasks.length} task(s) have expired due to missed deadlines.`,
      link: '/tasks',
    })

    // Log activity using first SUPER_ADMIN found
    const superAdmin = await prisma.employee.findFirst({
      where: { role: 'SUPER_ADMIN', isActive: true },
      select: { id: true },
    })

    if (superAdmin) {
      await logActivity({
        userId: superAdmin.id,
        action: 'TASK_EXPIRY',
        module: 'SYSTEM',
        details: `Expired ${overdueTasks.length} overdue tasks. IDs: ${taskIds.join(', ')}`,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        expiredCount: overdueTasks.length,
        taskIds,
        notifiedUsers: allUserIds.length,
      },
    })
  } catch (error) {
    console.error('[POST /api/cron/task-expiry]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { createNotificationForMany } from '@/lib/notifications'

function isAuthorized(request: NextRequest): boolean {
  // Vercel cron: Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true
  // Manual trigger: x-cron-secret header
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret && cronSecret === process.env.CRON_SECRET) return true
  return false
}

async function runTaskExpiry() {
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
    return { expiredCount: 0, message: 'No overdue tasks found' }
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

  return {
    expiredCount: overdueTasks.length,
    taskIds,
    notifiedUsers: allUserIds.length,
  }
}

// GET: called by Vercel cron (Authorization: Bearer <CRON_SECRET>)
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await runTaskExpiry()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[GET /api/cron/task-expiry]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST: manual trigger (x-cron-secret header)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await runTaskExpiry()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[POST /api/cron/task-expiry]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

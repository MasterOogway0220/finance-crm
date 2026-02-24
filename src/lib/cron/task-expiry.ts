import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'

export async function runTaskExpiry() {
  const now = new Date()
  console.log('[Task Expiry] Running task expiry check...')

  const expiredTasks = await prisma.task.findMany({
    where: { status: 'PENDING', deadline: { lt: now } },
    include: {
      assignedTo: { select: { id: true, name: true } },
      assignedBy: { select: { id: true, name: true } },
    },
  })

  if (expiredTasks.length === 0) {
    console.log('[Task Expiry] No tasks to expire')
    return 0
  }

  const taskIds = expiredTasks.map((t) => t.id)
  await prisma.task.updateMany({ where: { id: { in: taskIds } }, data: { status: 'EXPIRED' } })

  for (const task of expiredTasks) {
    await Promise.all([
      createNotification({
        userId: task.assignedTo.id,
        type: 'task_expired',
        title: 'Task Expired',
        message: `Your task "${task.title}" has expired and is now marked as expired.`,
        link: '/tasks',
      }),
      task.assignedBy.id !== task.assignedTo.id
        ? createNotification({
            userId: task.assignedBy.id,
            type: 'task_expired',
            title: 'Task Expired',
            message: `Task "${task.title}" assigned to ${task.assignedTo.name} has expired.`,
            link: '/tasks',
          })
        : Promise.resolve(),
    ])
  }

  console.log(`[Task Expiry] Expired ${expiredTasks.length} tasks`)
  return expiredTasks.length
}

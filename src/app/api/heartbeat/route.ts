import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotificationForMany } from '@/lib/notifications'
import { runMonthlyReset } from '@/lib/monthly-reset'

// POST /api/heartbeat — update lastSeenAt + expire overdue tasks
// Called every 5 minutes by the client for each logged-in user.
// Task expiry runs here instead of a cron job — tasks expire within 5 min
// of their deadline as long as any user is active.
// Race-condition safe: updateMany is atomic — only the request that actually
// flips rows from PENDING→EXPIRED sends notifications (others get count=0).
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false }, { status: 401 })
    }

    const now = new Date()

    // Update lastSeenAt in parallel with fetching overdue tasks
    const [, overdueTasks] = await Promise.all([
      prisma.employee.update({
        where: { id: session.user.id },
        data: { lastSeenAt: now },
      }),
      prisma.task.findMany({
        where: { status: 'PENDING', deadline: { lt: now } },
        select: { id: true, title: true, assignedToId: true, assignedById: true },
      }),
    ])

    if (overdueTasks.length > 0) {
      const taskIds = overdueTasks.map((t) => t.id)

      // Atomic update — only rows still PENDING will be changed.
      // If another heartbeat already expired them, count = 0 and we skip notifications.
      const { count } = await prisma.task.updateMany({
        where: { id: { in: taskIds }, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      })

      if (count > 0) {
        const userIds = [...new Set([
          ...overdueTasks.map((t) => t.assignedToId),
          ...overdueTasks.map((t) => t.assignedById),
        ])]

        await createNotificationForMany({
          userIds,
          type: 'TASK_EXPIRED',
          title: 'Task expired',
          message: `${count} task${count > 1 ? 's have' : ' has'} expired due to missed deadline.`,
          link: '/tasks',
        })
      }
    }

    // On the 1st of every month, run monthly reset if not already done
    if (now.getDate() === 1) {
      await runMonthlyReset()
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

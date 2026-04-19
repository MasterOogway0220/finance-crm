import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotificationForMany, tasksLinkForDepartment } from '@/lib/notifications'
import { Department } from '@prisma/client'
import { runMonthlyReset } from '@/lib/monthly-reset'
import { runYearReset } from '@/lib/year-leave-reset'

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

        const users = await prisma.employee.findMany({
          where: { id: { in: userIds } },
          select: { id: true, department: true },
        })

        const idsByDept = new Map<Department, string[]>()
        for (const u of users) {
          const arr = idsByDept.get(u.department) ?? []
          arr.push(u.id)
          idsByDept.set(u.department, arr)
        }

        await Promise.all(
          Array.from(idsByDept, ([dept, ids]) =>
            createNotificationForMany({
              userIds: ids,
              type: 'TASK_EXPIRED',
              title: 'Task expired',
              message: `${count} task${count > 1 ? 's have' : ' has'} expired due to missed deadline.`,
              link: tasksLinkForDepartment(dept),
            }),
          ),
        )
      }
    }

    // On the 1st of every month, run monthly brokerage/client reset if not already done
    if (now.getDate() === 1) {
      await runMonthlyReset()
    }

    // On Jan 1, allocate 30 leaves for the new year if not already done
    if (now.getMonth() === 0 && now.getDate() === 1) {
      const year = now.getFullYear()
      const alreadyAllocated = await prisma.leaveBalance.findFirst({
        where: { year },
        select: { id: true },
      })
      if (!alreadyAllocated) {
        await runYearReset(year, true)
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

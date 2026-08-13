import { prisma } from '@/lib/prisma'
import { createNotification, tasksLinkForDepartment } from '@/lib/notifications'

export function monthPeriod(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Day-of-month clamped to the month's length (31 → 28 in Feb)
function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, new Date(year, month + 1, 0).getDate())
}

function skipWeekend(d: Date): Date {
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d
}

// Weekend-smart monthly dates: the assignment day shifts past Sat/Sun to Monday,
// the due date keeps the same day-span (dueDay - assignDay) from the shifted
// assignment date, then itself shifts past a weekend.
// e.g. assignDay=1, dueDay=4 in Aug 2026 (1st is Saturday) → assign Mon 3rd, due Thu 6th.
export function computeMonthlyDates(assignDay: number, dueDay: number, ref: Date) {
  const y = ref.getFullYear()
  const m = ref.getMonth()
  const span = clampDay(y, m, dueDay) - clampDay(y, m, assignDay)
  let assignDate = skipWeekend(new Date(y, m, clampDay(y, m, assignDay)))
  // A month-end weekend must not shift the assignment into the next month —
  // the heartbeat re-anchors to the current month, so that occurrence would
  // become unreachable. Fall back to the month's last working day instead.
  if (assignDate.getMonth() !== m) {
    assignDate = new Date(y, m + 1, 0)
    while (assignDate.getDay() === 0 || assignDate.getDay() === 6) assignDate.setDate(assignDate.getDate() - 1)
  }
  const dueDate = skipWeekend(
    new Date(assignDate.getFullYear(), assignDate.getMonth(), assignDate.getDate() + span),
  )
  return { assignDate, dueDate }
}

// lastRunPeriod value that avoids a stale or double fire after create/edit:
// if this month's (weekend-adjusted) assignment day already passed, stamp the
// current period so the schedule starts next month; otherwise keep the current
// value (null fires this month; an already-run month is not fired twice).
export function nextRunGuard(
  assignDay: number,
  dueDay: number,
  current: string | null,
  now: Date,
): string | null {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const { assignDate } = computeMonthlyDates(assignDay, dueDay, now)
  return todayStart > assignDate ? monthPeriod(now) : current
}

// Runs from the heartbeat (like runMonthlyReset): creates this month's task for
// each recurring assignment once its (weekend-adjusted) assignment day arrives.
export async function runMonthlyTaskAssignment() {
  const now = new Date()
  const period = monthPeriod(now)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const recurring = await prisma.recurringTask.findMany({
    where: {
      assignedTo: { isActive: true }, // deactivating the employee stops their recurring tasks
      OR: [{ lastRunPeriod: null }, { lastRunPeriod: { not: period } }],
    },
  })

  for (const rt of recurring) {
    const { assignDate, dueDate } = computeMonthlyDates(rt.assignDay, rt.dueDay, now)
    if (todayStart < assignDate) continue // this month's assignment day not reached yet

    // 5:30 PM IST (12:00 UTC) on the due date, matching POST /api/tasks
    const deadline = new Date(
      Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 12, 0, 0),
    )

    // Claim + create atomically: concurrent heartbeats lose the updateMany race
    // (count = 0), and a failed create rolls the claim back so the next
    // heartbeat retries instead of silently losing the month.
    const task = await prisma.$transaction(async (tx) => {
      const { count } = await tx.recurringTask.updateMany({
        where: { id: rt.id, lastRunPeriod: rt.lastRunPeriod },
        data: { lastRunPeriod: period },
      })
      if (count === 0) return null
      return tx.task.create({
        data: {
          title: rt.title,
          description: rt.description,
          assignedToId: rt.assignedToId,
          assignedById: rt.assignedById,
          deadline,
          priority: rt.priority,
        },
        include: { assignedTo: { select: { department: true } } },
      })
    })
    if (!task) continue

    await createNotification({
      userId: rt.assignedToId,
      type: 'TASK_ASSIGNED',
      title: 'New task assigned',
      message: `New task assigned: ${rt.title}`,
      link: tasksLinkForDepartment(task.assignedTo.department),
    })
  }
}

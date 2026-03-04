import { prisma } from '@/lib/prisma'
import { createNotificationForMany } from '@/lib/notifications'

export const ANNUAL_LEAVE_DAYS = 30

export async function runYearReset(year: number, notify = false) {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  await Promise.all(
    employees.map((emp) =>
      prisma.leaveBalance.upsert({
        where: { employeeId_year: { employeeId: emp.id, year } },
        update: { totalLeaves: ANNUAL_LEAVE_DAYS },
        create: { employeeId: emp.id, year, totalLeaves: ANNUAL_LEAVE_DAYS },
      })
    )
  )

  if (notify && employees.length > 0) {
    await createNotificationForMany({
      userIds: employees.map((e) => e.id),
      type: 'LEAVE_ALLOCATED',
      title: `${ANNUAL_LEAVE_DAYS} leaves allocated for ${year}`,
      message: `Your annual leave balance has been reset to ${ANNUAL_LEAVE_DAYS} days for ${year}.`,
      link: '/calendar',
    })
  }

  return { year, total: employees.length }
}

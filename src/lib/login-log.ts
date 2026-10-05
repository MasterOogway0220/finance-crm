import { prisma } from '@/lib/prisma'
import { closeLogout, sessionEndsAt } from '@/lib/work-hours'

// Each close is conditional on logoutAt still being null, so a concurrent
// close (another tab, heartbeat, report read) can't overwrite the first one.

/** Close every open login log of one employee — at now, or at the 6 PM cut-off if it has passed. */
export async function closeOpenLoginLogs(employeeId: string, type: 'SELF' | 'IDLE', now = new Date()) {
  const open = await prisma.employeeLoginLog.findMany({
    where: { employeeId, logoutAt: null },
    select: { id: true, loginAt: true },
  })
  for (const log of open) {
    await prisma.employeeLoginLog.updateMany({
      where: { id: log.id, logoutAt: null },
      data: closeLogout(log.loginAt, now, type),
    })
  }
}

/** Close, at their cut-off, all open logs whose session has already ended (browser closed, never logged out). */
export async function closeExpiredLoginLogs(now = new Date()) {
  const open = await prisma.employeeLoginLog.findMany({
    where: { logoutAt: null },
    select: { id: true, loginAt: true },
  })
  for (const log of open) {
    const end = sessionEndsAt(log.loginAt)
    if (end > now) continue
    await prisma.employeeLoginLog.updateMany({
      where: { id: log.id, logoutAt: null },
      data: { logoutAt: end, logoutType: 'AUTO' },
    })
  }
}

import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { createNotificationForMany } from '@/lib/notifications'

export async function runMonthlyReset() {
  const now = new Date()
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth()
  const prevYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  // Idempotency guard — skip if already archived for this month
  const alreadyRun = await prisma.monthlyArchive.findFirst({
    where: { month: prevMonth, year: prevYear },
    select: { id: true },
  })
  if (alreadyRun) {
    return { skipped: true, reason: `Already run for ${prevMonth}/${prevYear}` }
  }

  const prevMonthStart = new Date(prevYear, prevMonth - 1, 1)
  const prevMonthEnd   = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999)

  // ── 1. Archive BROKERAGE summary per equity operator ─────────────────────
  const operators = await prisma.employee.findMany({
    where: { role: 'EQUITY_DEALER', isActive: true },
    select: { id: true, name: true },
  })

  for (const op of operators) {
    const details = await prisma.brokerageDetail.findMany({
      where: {
        operatorId: op.id,
        clientId: { not: null },
        brokerage: { uploadDate: { gte: prevMonthStart, lte: prevMonthEnd } },
      },
      select: { clientId: true, amount: true },
    })
    const brokerageAmount = details.reduce((s, d) => s + d.amount, 0)
    const tradedClients   = new Set(details.map((d) => d.clientId!)).size
    const totalClients    = await prisma.client.count({ where: { operatorId: op.id } })

    await prisma.monthlyArchive.upsert({
      where: { month_year_entityType_entityId: { month: prevMonth, year: prevYear, entityType: 'BROKERAGE', entityId: op.id } },
      create: { month: prevMonth, year: prevYear, entityType: 'BROKERAGE', entityId: op.id, data: { operatorId: op.id, operatorName: op.name, amount: brokerageAmount, totalClients, tradedClients } },
      update: { data: { operatorId: op.id, operatorName: op.name, amount: brokerageAmount, totalClients, tradedClients } },
    })
  }

  // ── 2. Archive CLIENT_STATUS snapshot (equity) ────────────────────────────
  const equityClients = await prisma.client.findMany({
    where: { department: 'EQUITY' },
    select: { id: true, clientCode: true, operatorId: true, status: true, remark: true },
  })
  for (const client of equityClients) {
    await prisma.monthlyArchive.upsert({
      where: { month_year_entityType_entityId: { month: prevMonth, year: prevYear, entityType: 'CLIENT_STATUS', entityId: client.id } },
      create: { month: prevMonth, year: prevYear, entityType: 'CLIENT_STATUS', entityId: client.id, data: { clientCode: client.clientCode, operatorId: client.operatorId, status: client.status, remark: client.remark } },
      update: { data: { clientCode: client.clientCode, operatorId: client.operatorId, status: client.status, remark: client.remark } },
    })
  }

  // ── 3. Archive MF_CLIENT_STATUS snapshot ─────────────────────────────────
  const mfClients = await prisma.client.findMany({
    where: { department: 'MUTUAL_FUND' },
    select: { id: true, clientCode: true, operatorId: true, mfStatus: true, mfRemark: true },
  })
  for (const client of mfClients) {
    await prisma.monthlyArchive.upsert({
      where: { month_year_entityType_entityId: { month: prevMonth, year: prevYear, entityType: 'MF_CLIENT_STATUS', entityId: client.id } },
      create: { month: prevMonth, year: prevYear, entityType: 'MF_CLIENT_STATUS', entityId: client.id, data: { clientCode: client.clientCode, operatorId: client.operatorId, mfStatus: client.mfStatus, mfRemark: client.mfRemark } },
      update: { data: { clientCode: client.clientCode, operatorId: client.operatorId, mfStatus: client.mfStatus, mfRemark: client.mfRemark } },
    })
  }

  // ── 4. Archive TASK_SUMMARY per employee ─────────────────────────────────
  const employees = await prisma.employee.findMany({ where: { isActive: true }, select: { id: true } })
  for (const emp of employees) {
    const [completed, pending, expired] = await Promise.all([
      prisma.task.count({ where: { assignedToId: emp.id, status: 'COMPLETED', completedAt: { gte: prevMonthStart, lte: prevMonthEnd } } }),
      prisma.task.count({ where: { assignedToId: emp.id, status: 'PENDING' } }),
      prisma.task.count({ where: { assignedToId: emp.id, status: 'EXPIRED' } }),
    ])
    await prisma.monthlyArchive.upsert({
      where: { month_year_entityType_entityId: { month: prevMonth, year: prevYear, entityType: 'TASK_SUMMARY', entityId: emp.id } },
      create: { month: prevMonth, year: prevYear, entityType: 'TASK_SUMMARY', entityId: emp.id, data: { completed, pending, expired } },
      update: { data: { completed, pending, expired } },
    })
  }

  // ── 5. Reset all client statuses for new month ────────────────────────────
  await prisma.client.updateMany({
    where: { department: 'EQUITY' },
    data: { status: 'NOT_TRADED', remark: 'DID_NOT_ANSWER', notes: null, followUpDate: null },
  })
  await prisma.client.updateMany({
    where: { department: 'MUTUAL_FUND' },
    data: { mfStatus: 'INACTIVE', mfRemark: 'DID_NOT_ANSWER' },
  })

  // ── 6. Notify + log ───────────────────────────────────────────────────────
  const allEmployees = await prisma.employee.findMany({ where: { isActive: true }, select: { id: true } })
  if (allEmployees.length > 0) {
    await createNotificationForMany({
      userIds: allEmployees.map((e) => e.id),
      type: 'MONTHLY_RESET',
      title: 'Monthly reset completed',
      message: `Client statuses archived and reset for ${prevMonth}/${prevYear}. New month has started.`,
      link: '/brokerage',
    })
  }

  const superAdmin = await prisma.employee.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true } })
  if (superAdmin) {
    await logActivity({
      userId: superAdmin.id,
      action: 'MONTHLY_RESET',
      module: 'SYSTEM',
      details: `Monthly reset for ${prevMonth}/${prevYear}. Archived ${equityClients.length} equity, ${mfClients.length} MF clients, ${operators.length} operator summaries, ${employees.length} task summaries.`,
    })
  }

  return {
    skipped: false,
    archivedMonth: prevMonth,
    archivedYear: prevYear,
    equityClientsArchived: equityClients.length,
    mfClientsArchived: mfClients.length,
    operatorsArchived: operators.length,
  }
}

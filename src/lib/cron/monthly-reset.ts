import { prisma } from '@/lib/prisma'
import { createNotificationForMany } from '@/lib/notifications'
import { logActivity } from '@/lib/activity-log'

export async function runMonthlyReset() {
  const now = new Date()
  const month = now.getMonth() === 0 ? 12 : now.getMonth()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  console.log(`[Monthly Reset] Starting for ${month}/${year}`)

  // 1. Archive equity client statuses
  const equityClients = await prisma.client.findMany({
    where: { department: 'EQUITY' },
    select: { id: true, clientCode: true, status: true, remark: true, operatorId: true },
  })

  for (const client of equityClients) {
    await prisma.monthlyArchive.upsert({
      where: { month_year_entityType_entityId: { month, year, entityType: 'client_status', entityId: client.id } },
      update: { data: client },
      create: { month, year, entityType: 'client_status', entityId: client.id, data: client },
    })
  }

  // 2. Archive MF client statuses
  const mfClients = await prisma.client.findMany({
    where: { department: 'MUTUAL_FUND' },
    select: { id: true, clientCode: true, mfStatus: true, mfRemark: true, operatorId: true },
  })

  for (const client of mfClients) {
    await prisma.monthlyArchive.upsert({
      where: { month_year_entityType_entityId: { month, year, entityType: 'mf_client_status', entityId: client.id } },
      update: { data: client },
      create: { month, year, entityType: 'mf_client_status', entityId: client.id, data: client },
    })
  }

  // 3. Archive brokerage summary per operator
  const equityDealers = await prisma.employee.findMany({ where: { role: 'EQUITY_DEALER', isActive: true } })
  const brokerageUploads = await prisma.brokerageUpload.findMany({
    where: {
      uploadDate: {
        gte: new Date(year, month - 1, 1),
        lte: new Date(year, month, 0, 23, 59, 59),
      },
    },
    include: { details: true },
  })

  for (const dealer of equityDealers) {
    const dealerBrokerage = brokerageUploads.flatMap((u) => u.details).filter((d) => d.operatorId === dealer.id)
    const totalBrokerage = dealerBrokerage.reduce((s, d) => s + d.amount, 0)
    const tradedClients = await prisma.client.count({ where: { operatorId: dealer.id, status: 'TRADED' } })
    const totalClients = await prisma.client.count({ where: { operatorId: dealer.id } })

    await prisma.monthlyArchive.upsert({
      where: { month_year_entityType_entityId: { month, year, entityType: 'brokerage_summary', entityId: dealer.id } },
      update: { data: { operatorId: dealer.id, totalBrokerage, tradedClients, totalClients } },
      create: { month, year, entityType: 'brokerage_summary', entityId: dealer.id, data: { operatorId: dealer.id, totalBrokerage, tradedClients, totalClients } },
    })
  }

  // 4. Archive task summaries per employee
  const employees = await prisma.employee.findMany({ where: { isActive: true }, select: { id: true } })
  for (const emp of employees) {
    const [completed, pending, expired] = await Promise.all([
      prisma.task.count({ where: { assignedToId: emp.id, status: 'COMPLETED', completedAt: { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0, 23, 59, 59) } } }),
      prisma.task.count({ where: { assignedToId: emp.id, status: 'PENDING' } }),
      prisma.task.count({ where: { assignedToId: emp.id, status: 'EXPIRED' } }),
    ])
    await prisma.monthlyArchive.upsert({
      where: { month_year_entityType_entityId: { month, year, entityType: 'task_summary', entityId: emp.id } },
      update: { data: { completed, pending, expired } },
      create: { month, year, entityType: 'task_summary', entityId: emp.id, data: { completed, pending, expired } },
    })
  }

  // 5. Reset equity client statuses
  await prisma.client.updateMany({ where: { department: 'EQUITY' }, data: { status: 'NOT_TRADED', remark: 'DID_NOT_ANSWER' } })
  await prisma.client.updateMany({ where: { department: 'MUTUAL_FUND' }, data: { mfStatus: 'INACTIVE', mfRemark: 'DID_NOT_ANSWER' } })

  // 6. Notify all users
  const allActiveUsers = await prisma.employee.findMany({ where: { isActive: true }, select: { id: true } })
  const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' })
  await createNotificationForMany({
    userIds: allActiveUsers.map((u) => u.id),
    type: 'monthly_reset',
    title: 'Monthly Reset Completed',
    message: `Monthly reset completed for ${monthName} ${year}. All client statuses have been reset to defaults.`,
    link: '/dashboard',
  })

  console.log(`[Monthly Reset] Completed for ${month}/${year}`)
}

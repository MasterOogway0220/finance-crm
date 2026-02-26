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

async function runMonthlyReset() {
  const now = new Date()
  // We archive the previous month
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth()
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  // Idempotency guard: skip if already run for this month
  const alreadyRun = await prisma.monthlyArchive.findFirst({
    where: { month: prevMonth, year: prevYear },
    select: { id: true },
  })
  if (alreadyRun) {
    return { skipped: true, reason: `Already run for ${prevMonth}/${prevYear}` }
  }

  // Build date range for previous month
  const prevMonthStart = new Date(prevYear, prevMonth - 1, 1)
  const prevMonthEnd = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999)

  // Fetch all equity dealers
  const operators = await prisma.employee.findMany({
    where: { role: 'EQUITY_DEALER', isActive: true },
    select: { id: true, name: true },
  })

  // Archive brokerage summaries per operator
  for (const op of operators) {
    const brokerageSum = await prisma.brokerageDetail.aggregate({
      _sum: { amount: true },
      where: {
        clientId: { not: null },
        operatorId: op.id,
        brokerage: { uploadDate: { gte: prevMonthStart, lte: prevMonthEnd } },
      },
    })

    const [totalClients, tradedClients] = await Promise.all([
      prisma.client.count({ where: { operatorId: op.id } }),
      prisma.client.count({ where: { operatorId: op.id, status: 'TRADED' } }),
    ])

    await prisma.monthlyArchive.upsert({
      where: {
        month_year_entityType_entityId: {
          month: prevMonth,
          year: prevYear,
          entityType: 'BROKERAGE',
          entityId: op.id,
        },
      },
      create: {
        month: prevMonth,
        year: prevYear,
        entityType: 'BROKERAGE',
        entityId: op.id,
        data: {
          operatorId: op.id,
          operatorName: op.name,
          amount: brokerageSum._sum.amount ?? 0,
          totalClients,
          tradedClients,
        },
      },
      update: {
        data: {
          operatorId: op.id,
          operatorName: op.name,
          amount: brokerageSum._sum.amount ?? 0,
          totalClients,
          tradedClients,
        },
      },
    })
  }

  // Archive client statuses (snapshot of all clients)
  const allClients = await prisma.client.findMany({
    select: {
      id: true,
      clientCode: true,
      operatorId: true,
      status: true,
      remark: true,
      mfStatus: true,
      mfRemark: true,
    },
  })

  for (const client of allClients) {
    await prisma.monthlyArchive.upsert({
      where: {
        month_year_entityType_entityId: {
          month: prevMonth,
          year: prevYear,
          entityType: 'CLIENT_STATUS',
          entityId: client.id,
        },
      },
      create: {
        month: prevMonth,
        year: prevYear,
        entityType: 'CLIENT_STATUS',
        entityId: client.id,
        data: {
          clientCode: client.clientCode,
          operatorId: client.operatorId,
          status: client.status,
          remark: client.remark,
          mfStatus: client.mfStatus,
          mfRemark: client.mfRemark,
        },
      },
      update: {
        data: {
          clientCode: client.clientCode,
          operatorId: client.operatorId,
          status: client.status,
          remark: client.remark,
          mfStatus: client.mfStatus,
          mfRemark: client.mfRemark,
        },
      },
    })
  }

  // Reset all client statuses to default
  await prisma.client.updateMany({
    data: {
      status: 'NOT_TRADED',
      remark: 'DID_NOT_ANSWER',
      notes: null,
      followUpDate: null,
    },
  })

  // Send notifications to all active employees
  const allEmployees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  if (allEmployees.length > 0) {
    await createNotificationForMany({
      userIds: allEmployees.map((e) => e.id),
      type: 'MONTHLY_RESET',
      title: 'Monthly reset completed',
      message: `Client statuses have been archived and reset for ${prevMonth}/${prevYear}. New month has started.`,
      link: '/dashboard',
    })
  }

  // Get a system user for activity log — use the first SUPER_ADMIN
  const superAdmin = await prisma.employee.findFirst({
    where: { role: 'SUPER_ADMIN', isActive: true },
    select: { id: true },
  })

  if (superAdmin) {
    await logActivity({
      userId: superAdmin.id,
      action: 'MONTHLY_RESET',
      module: 'SYSTEM',
      details: `Monthly reset for ${prevMonth}/${prevYear}. Archived ${allClients.length} client statuses and ${operators.length} operator brokerage summaries. Reset all client statuses.`,
    })
  }

  return {
    archivedMonth: prevMonth,
    archivedYear: prevYear,
    clientsReset: allClients.length,
    operatorsArchived: operators.length,
    notificationsSent: allEmployees.length,
  }
}

// GET: called by Vercel cron (Authorization: Bearer <CRON_SECRET>)
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await runMonthlyReset()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[GET /api/cron/monthly-reset]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST: manual trigger (x-cron-secret header)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await runMonthlyReset()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[POST /api/cron/monthly-reset]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

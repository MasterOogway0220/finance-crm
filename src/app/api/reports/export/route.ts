import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentMonthRange } from '@/lib/utils'
import { Role } from '@prisma/client'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = session.user.role as Role
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { type, month, year, operatorId, employeeId } = body as {
      type: 'brokerage' | 'tasks'
      month?: number
      year?: number
      operatorId?: string
      employeeId?: string
    }

    if (!type || !['brokerage', 'tasks'].includes(type)) {
      return NextResponse.json({ success: false, error: 'Invalid report type' }, { status: 400 })
    }

    const now = new Date()
    const reportYear = year ?? now.getFullYear()
    const reportMonth = month ?? now.getMonth() + 1

    const workbook = XLSX.utils.book_new()

    if (type === 'brokerage') {
      const monthStart = new Date(reportYear, reportMonth - 1, 1)
      const monthEnd = new Date(reportYear, reportMonth, 0, 23, 59, 59, 999)

      const detailsWhere: Record<string, unknown> = {
        brokerage: { uploadDate: { gte: monthStart, lte: monthEnd } },
      }
      if (operatorId) detailsWhere.operatorId = operatorId

      const details = await prisma.brokerageDetail.findMany({
        where: detailsWhere,
        include: {
          brokerage: { select: { uploadDate: true, fileName: true } },
          client: { select: { clientCode: true, firstName: true, lastName: true } },
        },
        orderBy: [{ brokerage: { uploadDate: 'asc' } }, { clientCode: 'asc' }],
      })

      const rows = details.map((d) => ({
        Date: d.brokerage.uploadDate.toISOString().split('T')[0],
        'Client Code': d.clientCode,
        'Client Name': d.client ? `${d.client.firstName} ${d.client.lastName}` : 'N/A',
        'Operator ID': d.operatorId,
        Amount: d.amount,
        'File Name': d.brokerage.fileName,
      }))

      const sheet = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(workbook, sheet, 'Brokerage')
    } else {
      // Tasks report
      const yearStart = new Date(reportYear, 0, 1)
      const yearEnd = new Date(reportYear, 11, 31, 23, 59, 59, 999)

      const tasksWhere: Record<string, unknown> = {
        createdAt: { gte: yearStart, lte: yearEnd },
      }
      if (employeeId) tasksWhere.assignedToId = employeeId

      const tasks = await prisma.task.findMany({
        where: tasksWhere,
        include: {
          assignedTo: { select: { name: true } },
          assignedBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      })

      const rows = tasks.map((t) => ({
        Title: t.title,
        'Assigned To': t.assignedTo.name,
        'Assigned By': t.assignedBy.name,
        Status: t.status,
        Priority: t.priority,
        Deadline: t.deadline.toISOString().split('T')[0],
        'Completed At': t.completedAt ? t.completedAt.toISOString().split('T')[0] : '',
        'Created At': t.createdAt.toISOString().split('T')[0],
      }))

      const sheet = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(workbook, sheet, 'Tasks')
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    const filename = `${type}-report-${reportYear}${type === 'brokerage' ? `-${String(reportMonth).padStart(2, '0')}` : ''}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[POST /api/reports/export]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

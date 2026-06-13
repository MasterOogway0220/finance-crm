import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'
import { canViewAdmin, isHrViewer } from '@/lib/roles'
import { getLeaveReport } from '@/lib/leave-report'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = (await getActiveRole(session.user))

    const body = await request.json()
    const { type, month, year, operatorId, employeeId, range, department } = body as {
      type: 'brokerage' | 'tasks' | 'mf-business-log' | 'leave'
      month?: number
      year?: number
      operatorId?: string
      employeeId?: string
      range?: string
      department?: string
    }

    if (!type || !['brokerage', 'tasks', 'mf-business-log', 'leave'].includes(type)) {
      return NextResponse.json({ success: false, error: 'Invalid report type' }, { status: 400 })
    }

    // Authorization: admins and the read-only CA may export any report; a
    // designated HR viewer may export ONLY the leave report, keeping them
    // scoped to their two HR modules.
    const canExport = canViewAdmin(userRole) || (isHrViewer(session.user.email) && type === 'leave')
    if (!canExport) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    const reportYear = year ?? now.getFullYear()
    const reportMonth = month ?? now.getMonth() + 1

    const workbook = XLSX.utils.book_new()

    if (type === 'brokerage') {
      const monthStart = new Date(reportYear, reportMonth - 1, 1)
      const monthEnd = new Date(reportYear, reportMonth, 0, 23, 59, 59, 999)

      // Hybrid attribution — see src/lib/brokerage-attribution.ts.
      const detailsWhere: import('@prisma/client').Prisma.BrokerageDetailWhereInput = {
        ...(operatorId ? brokerageOperatorFilter(operatorId, reportMonth, reportYear) : {}),
        brokerage: { uploadDate: { gte: monthStart, lte: monthEnd } },
      }

      const details = await prisma.brokerageDetail.findMany({
        where: detailsWhere,
        include: {
          brokerage: { select: { uploadDate: true, fileName: true } },
          client: { select: { clientCode: true, firstName: true, lastName: true, operatorId: true } },
        },
        orderBy: [{ brokerage: { uploadDate: 'asc' } }, { clientCode: 'asc' }],
      })

      const rows = details.map((d) => ({
        Date: d.brokerage.uploadDate.toISOString().split('T')[0],
        'Client Code': d.clientCode,
        'Client Name': d.client ? `${d.client.firstName} ${d.client.lastName}` : 'N/A',
        'Operator ID': d.client?.operatorId ?? d.operatorId,
        Amount: d.amount,
        'File Name': d.brokerage.fileName,
      }))

      const sheet = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(workbook, sheet, 'Brokerage')
    } else if (type === 'mf-business-log') {
      const logRange = range || 'MONTH'
      let startDate: Date
      let endDate: Date
      if (logRange === 'FULL_YEAR') {
        startDate = new Date(reportYear, 0, 1)
        endDate = new Date(reportYear, 11, 31, 23, 59, 59, 999)
      } else {
        startDate = new Date(reportYear, reportMonth - 1, 1)
        endDate = new Date(reportYear, reportMonth, 0, 23, 59, 59, 999)
      }

      const mfWhere: Record<string, unknown> = {
        businessDate: { gte: startDate, lte: endDate },
      }
      if (employeeId) mfWhere.employeeId = employeeId

      const records = await prisma.mFBusiness.findMany({
        where: mfWhere,
        include: {
          employee: { select: { name: true } },
          referredBy: { select: { name: true } },
        },
        orderBy: [{ employee: { name: 'asc' } }, { businessDate: 'desc' }],
      })

      const rows = records.map((r) => ({
        Date: new Date(r.businessDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        Employee: r.employee.name,
        'Client Code': r.clientCode,
        'Client Name': r.clientName,
        'Referred By': r.referredBy?.name || '',
        Product: r.productName,
        'Sub-Product': r.subProduct || '',
        Type: r.investmentType,
        'SIP Amount': r.sipAmount ?? '',
        'Yearly Contribution': r.yearlyContribution,
        'Commission %': r.commissionPercent,
        'Commission Amount': r.commissionAmount,
      }))

      const sheet = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(workbook, sheet, 'MF Business Log')
    } else if (type === 'leave') {
      // Sheet 1 — per-employee summary (matches the on-screen leave report)
      const summary = await getLeaveReport({ year: reportYear, department, employeeId })
      const summaryRows = summary.map((r) => ({
        Employee: r.employeeName,
        Department: r.department.replace('_', ' '),
        Designation: r.designation,
        'Total Leaves': r.totalLeaves,
        'Leaves Taken': r.leavesTaken,
        'Leaves Remaining': r.leavesRemaining,
      }))
      const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Leave Summary')

      // Sheet 2 — individual approved leave records for the year
      const leaveWhere: Record<string, unknown> = {
        status: 'APPROVED',
        fromDate: {
          gte: new Date(reportYear, 0, 1),
          lte: new Date(reportYear, 11, 31, 23, 59, 59, 999),
        },
      }
      if (employeeId) leaveWhere.employeeId = employeeId
      if (department) leaveWhere.employee = { department }

      const applications = await prisma.leaveApplication.findMany({
        where: leaveWhere,
        include: {
          employee: { select: { name: true, department: true } },
          reviewedBy: { select: { name: true } },
        },
        orderBy: [{ employee: { name: 'asc' } }, { fromDate: 'asc' }],
      })

      const detailRows = applications.map((a) => ({
        Employee: a.employee.name,
        Department: a.employee.department.replace('_', ' '),
        From: a.fromDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        To: a.toDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        Days: a.days,
        Reason: a.reason,
        'Reviewed By': a.reviewedBy?.name ?? '',
      }))

      // json_to_sheet needs at least one row to emit headers
      const detailSheet = XLSX.utils.json_to_sheet(
        detailRows.length > 0
          ? detailRows
          : [{ Employee: '', Department: '', From: '', To: '', Days: '', Reason: '', 'Reviewed By': '' }],
      )
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Leave Details')
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
    const filename = type === 'mf-business-log'
      ? `mf-business-log-${reportYear}${(range || 'MONTH') !== 'FULL_YEAR' ? `-${String(reportMonth).padStart(2, '0')}` : ''}.xlsx`
      : `${type}-report-${reportYear}${type === 'brokerage' ? `-${String(reportMonth).padStart(2, '0')}` : ''}.xlsx`

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

import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Department, Role } from '@prisma/client'
import Papa from 'papaparse'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const operatorIdParam = searchParams.get('operatorId')
    const department = searchParams.get('department') as Department | null
    const userRole = session.user.role as Role

    const where: Record<string, unknown> = {}

    if (userRole === 'EQUITY_DEALER') {
      where.operatorId = session.user.id
    } else if (operatorIdParam) {
      where.operatorId = operatorIdParam
    }

    if (department) where.department = department

    const clients = await prisma.client.findMany({
      where,
      include: {
        operator: {
          select: { id: true, name: true },
        },
      },
      orderBy: { clientCode: 'asc' },
    })

    const csvData = clients.map((c) => ({
      clientCode: c.clientCode,
      firstName: c.firstName,
      middleName: c.middleName ?? '',
      lastName: c.lastName,
      phone: c.phone,
      department: c.department,
      operatorName: c.operator.name,
      status: c.status,
      remark: c.remark,
      mfStatus: c.mfStatus,
      mfRemark: c.mfRemark,
      notes: c.notes ?? '',
      followUpDate: c.followUpDate ? c.followUpDate.toISOString().split('T')[0] : '',
      createdAt: c.createdAt.toISOString().split('T')[0],
    }))

    const csv = Papa.unparse(csvData)

    const filename = `clients-export-${new Date().toISOString().split('T')[0]}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[GET /api/clients/export]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

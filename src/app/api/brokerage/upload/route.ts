import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { createNotificationForMany } from '@/lib/notifications'
import { Role } from '@prisma/client'
import * as XLSX from 'xlsx'

function findColumnIndex(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const candidate of candidates) {
    const idx = lower.indexOf(candidate.toLowerCase())
    if (idx !== -1) return idx
  }
  return -1
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = getEffectiveRole(session.user)
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const dateParam = formData.get('date') as string | null

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
    }

    if (!dateParam) {
      return NextResponse.json({ success: false, error: 'Date is required' }, { status: 400 })
    }

    const uploadDate = new Date(dateParam)
    if (isNaN(uploadDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid date format' }, { status: 400 })
    }

    // Parse xlsx/csv with SheetJS
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][]

    if (rows.length < 2) {
      return NextResponse.json({ success: false, error: 'File has no data rows' }, { status: 400 })
    }

    const headers = rows[0].map((h) => String(h ?? ''))
    const dataRows = rows.slice(1)

    // Detect client code and amount columns
    const codeIdx = findColumnIndex(headers, [
      'client code', 'clientcode', 'client_code', 'code', 'client id', 'clientid',
    ])
    const amountIdx = findColumnIndex(headers, [
      'amount', 'brokerage', 'brokerage amount', 'net amount', 'netamount',
    ])

    if (codeIdx === -1) {
      return NextResponse.json({ success: false, error: 'Could not find client code column' }, { status: 400 })
    }
    if (amountIdx === -1) {
      return NextResponse.json({ success: false, error: 'Could not find amount column' }, { status: 400 })
    }

    // Aggregate amounts by client code (deduplicate by summing)
    const codeAmountMap = new Map<string, number>()
    for (const row of dataRows) {
      const code = String(row[codeIdx] ?? '').trim().toUpperCase()
      const amount = parseFloat(String(row[amountIdx] ?? '0').replace(/,/g, ''))
      if (!code || isNaN(amount)) continue
      codeAmountMap.set(code, (codeAmountMap.get(code) ?? 0) + amount)
    }

    if (codeAmountMap.size === 0) {
      return NextResponse.json({ success: false, error: 'No valid data rows found' }, { status: 400 })
    }

    // Map client codes to operators via Client table
    const allCodes = Array.from(codeAmountMap.keys())
    const clientRecords = await prisma.client.findMany({
      where: { clientCode: { in: allCodes } },
      select: { id: true, clientCode: true, operatorId: true },
    })

    const codeToClient = new Map(clientRecords.map((c) => [c.clientCode, c]))
    const unmappedCodes: string[] = []
    const details: { clientCode: string; clientId: string | null; operatorId: string; amount: number }[] = []

    for (const [code, amount] of codeAmountMap.entries()) {
      const client = codeToClient.get(code)
      if (!client) {
        unmappedCodes.push(code)
      } else {
        details.push({
          clientCode: code,
          clientId: client.id,
          operatorId: client.operatorId,
          amount,
        })
      }
    }

    const totalAmount = details.reduce((sum, d) => sum + d.amount, 0)

    // If date already has an upload, delete it and re-create
    const existingUpload = await prisma.brokerageUpload.findUnique({
      where: { uploadDate },
    })

    if (existingUpload) {
      await prisma.brokerageUpload.delete({ where: { id: existingUpload.id } })
    }

    // Create BrokerageUpload + BrokerageDetails in a transaction
    const upload = await prisma.$transaction(async (tx) => {
      const newUpload = await tx.brokerageUpload.create({
        data: {
          uploadDate,
          uploadedById: session.user.id,
          totalAmount,
          fileName: file.name,
          details: {
            create: details,
          },
        },
        include: {
          details: true,
        },
      })
      return newUpload
    })

    // Send notifications to all EQUITY_DEALER employees
    const equityDealers = await prisma.employee.findMany({
      where: { role: 'EQUITY_DEALER', isActive: true },
      select: { id: true },
    })

    if (equityDealers.length > 0) {
      await createNotificationForMany({
        userIds: equityDealers.map((e) => e.id),
        type: 'BROKERAGE_UPLOAD',
        title: 'Brokerage data uploaded',
        message: `Brokerage data for ${uploadDate.toDateString()} has been uploaded.`,
        link: '/brokerage',
      })
    }

    await logActivity({
      userId: session.user.id,
      action: 'UPLOAD',
      module: 'BROKERAGE',
      details: `Uploaded brokerage for ${uploadDate.toISOString().split('T')[0]}. Total: ${totalAmount}. Mapped: ${details.length}. Unmapped: ${unmappedCodes.length}`,
    })

    return NextResponse.json({
      success: true,
      data: {
        uploadId: upload.id,
        uploadDate: upload.uploadDate,
        totalAmount,
        mappedCount: details.length,
        unmappedCount: unmappedCodes.length,
        warnings: unmappedCodes.map((code) => `Client code not found: ${code}`),
      },
    })
  } catch (error) {
    console.error('[POST /api/brokerage/upload]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

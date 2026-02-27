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

/**
 * Scans all rows to find the header row (first row containing known column keywords).
 * Returns { headerRowIndex, headers, dataRows } or null if not found.
 */
function detectHeaderRow(rows: string[][]): { headerRowIndex: number; headers: string[]; dataRows: string[][] } | null {
  // Keywords that must appear in the header row for ledger format
  const ledgerKeywords = ['date', 'narration', 'credit']
  // Keywords for simple format
  const simpleKeywords = ['client', 'amount']

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i].map((c) => String(c ?? '').toLowerCase().trim())
    const hasLedger = ledgerKeywords.every((kw) => row.some((c) => c.includes(kw)))
    const hasSimple = simpleKeywords.every((kw) => row.some((c) => c.includes(kw)))
    if (hasLedger || hasSimple) {
      return {
        headerRowIndex: i,
        headers: rows[i].map((h) => String(h ?? '')),
        dataRows: rows.slice(i + 1),
      }
    }
  }
  return null
}

/**
 * Extracts client code from a narration string.
 * Narration format examples:
 *   "Z/M/2026039/ 18A213"  → "18A213"
 *   "Z/L/2026039/57066490 91383117" → "91383117"
 * The client code is always the last space-separated token.
 */
function extractClientCodeFromNarration(narration: string): string {
  const trimmed = narration.trim()
  const lastSpaceIdx = trimmed.lastIndexOf(' ')
  if (lastSpaceIdx === -1) return trimmed.toUpperCase()
  return trimmed.slice(lastSpaceIdx + 1).trim().toUpperCase()
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

    // Find header row — supports both ledger format (metadata rows at top) and simple format
    const detected = detectHeaderRow(rows)
    if (!detected) {
      return NextResponse.json(
        { success: false, error: 'Could not detect header row. Ensure the file contains Date/Narration/Credit columns (ledger format) or ClientCode/Amount columns.' },
        { status: 400 }
      )
    }

    const { headers, dataRows } = detected

    // Determine format: ledger (Financial Ledger XLS) or simple (ClientCode/Amount CSV)
    const narrationIdx = findColumnIndex(headers, ['narration'])
    const creditIdx = findColumnIndex(headers, ['credit'])
    const isLedgerFormat = narrationIdx !== -1 && creditIdx !== -1

    // Aggregate amounts by client code (deduplicate by summing); track row count per code
    const codeAmountMap = new Map<string, number>()
    const codeRowCount = new Map<string, number>()

    if (isLedgerFormat) {
      // Ledger format: client code embedded in Narration, amount in Credit column
      const dateIdx = findColumnIndex(headers, ['date'])
      for (const row of dataRows) {
        const dateVal = String(row[dateIdx] ?? '').trim()
        const narration = String(row[narrationIdx] ?? '').trim()
        const creditRaw = String(row[creditIdx] ?? '').trim()

        // Skip rows without a date (opening balance, totals rows)
        if (!dateVal) continue
        // Skip rows without a narration (structural/separator rows)
        if (!narration) continue

        const amount = parseFloat(creditRaw.replace(/,/g, ''))
        // Skip zero or non-numeric credit entries
        if (!amount || isNaN(amount) || amount <= 0) continue

        const code = extractClientCodeFromNarration(narration)
        if (!code) continue

        codeAmountMap.set(code, (codeAmountMap.get(code) ?? 0) + amount)
        codeRowCount.set(code, (codeRowCount.get(code) ?? 0) + 1)
      }
    } else {
      // Simple format: explicit ClientCode and Amount columns
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

      for (const row of dataRows) {
        const code = String(row[codeIdx] ?? '').trim().toUpperCase()
        const amount = parseFloat(String(row[amountIdx] ?? '0').replace(/,/g, ''))
        if (!code || isNaN(amount)) continue
        codeAmountMap.set(code, (codeAmountMap.get(code) ?? 0) + amount)
        codeRowCount.set(code, (codeRowCount.get(code) ?? 0) + 1)
      }
    }

    if (codeAmountMap.size === 0) {
      return NextResponse.json({ success: false, error: 'No valid data rows found' }, { status: 400 })
    }

    const duplicatesConsolidated = [...codeRowCount.values()].filter((c) => c > 1).length

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

    // If ALL codes are unmapped, reject — nothing to upload
    if (details.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `None of the ${unmappedCodes.length} client code(s) in this file exist in the system. Add these clients first, then re-upload.`,
          data: { unmappedCodes, mappedCount: 0 },
        },
        { status: 422 }
      )
    }

    const totalAmount = details.reduce((sum, d) => sum + d.amount, 0)

    // Build operator summary (needed for both preview and confirm)
    const operatorIds = [...new Set(details.map((d) => d.operatorId))]
    const operators = await prisma.employee.findMany({
      where: { id: { in: operatorIds } },
      select: { id: true, name: true },
    })
    const operatorNameMap = new Map(operators.map((o) => [o.id, o.name]))

    const opSummaryMap = new Map<string, { operatorName: string; clientCount: number; totalAmount: number }>()
    for (const d of details) {
      const name = operatorNameMap.get(d.operatorId) ?? 'Unknown'
      const existing = opSummaryMap.get(d.operatorId) ?? { operatorName: name, clientCount: 0, totalAmount: 0 }
      opSummaryMap.set(d.operatorId, {
        operatorName: name,
        clientCount: existing.clientCount + 1,
        totalAmount: existing.totalAmount + d.amount,
      })
    }
    const operatorSummary = Array.from(opSummaryMap.values())

    const existingUpload = await prisma.brokerageUpload.findUnique({ where: { uploadDate } })
    const dateExists = !!existingUpload

    // Preview mode — return summary without writing to DB
    const isPreview = formData.get('preview') === 'true'
    if (isPreview) {
      return NextResponse.json({
        success: true,
        data: {
          operatorSummary,
          totalClients: details.length,
          totalAmount,
          unmappedCodes,
          duplicatesConsolidated,
          dateExists,
        },
      })
    }

    // Confirm mode — write to DB
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
        skippedCodes: unmappedCodes,
      },
    })
  } catch (error) {
    console.error('[POST /api/brokerage/upload]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

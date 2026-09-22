import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { createNotificationForMany } from '@/lib/notifications'
import { invalidateCache } from '@/lib/cache'
import { extractClientCodeFromNarration, parseCellDateKey } from '@/lib/brokerage-code'
import { buildVersionDetails, UNASSIGNED_OPERATOR, type DetailRow, type Segment } from '@/lib/brokerage-merge'
import { resyncEquityClientStatus } from '@/lib/brokerage-status'
import { Prisma, Role } from '@prisma/client'
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

const VALID_BRANCHES = ['Mumbai', 'Karad', 'Pune']

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = (await getActiveRole(session.user))
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

    // Accept YYYY-MM-DD only — parse as UTC midnight to avoid timezone shifts
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ success: false, error: 'Date must be in YYYY-MM-DD format' }, { status: 400 })
    }
    const uploadDate = new Date(`${dateParam}T00:00:00.000Z`)
    if (isNaN(uploadDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid date' }, { status: 400 })
    }

    const branch = (formData.get('branch') as string | null)?.trim()
    if (!branch) {
      return NextResponse.json({ success: false, error: 'Branch is required' }, { status: 400 })
    }
    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ success: false, error: 'Invalid branch' }, { status: 400 })
    }

    // Parse xlsx/csv with SheetJS
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
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

    // Which segment's ledger is this? The uploaded file supplies every row for its own
    // segment; the day's other segment is carried forward untouched. So the F&O file adds
    // options without wiping cash, and a corrected cash file replaces cash without wiping
    // options. See src/lib/brokerage-merge.ts.
    const segment: Segment = formData.get('segment') === 'FNO' ? 'FNO' : 'CASH'

    // Parse rows into (rowDate, code, amount). The ledger format carries a per-row date;
    // the simple ClientCode/Amount format does not (rowDate stays null).
    type ParsedRow = { dateKey: string | null; code: string; amount: number }
    const parsedRows: ParsedRow[] = []

    if (isLedgerFormat) {
      const dateIdx = findColumnIndex(headers, ['date'])
      for (const row of dataRows) {
        const dateVal = row[dateIdx]
        const narration = String(row[narrationIdx] ?? '').trim()
        const creditRaw = String(row[creditIdx] ?? '').trim()
        if (dateVal == null || String(dateVal).trim() === '') continue  // opening balance / totals rows
        if (!narration) continue                                        // structural / separator rows
        const amount = parseFloat(creditRaw.replace(/,/g, ''))
        if (!amount || isNaN(amount) || amount <= 0) continue           // zero / non-numeric credits
        const code = extractClientCodeFromNarration(narration)
        if (!code) continue
        parsedRows.push({ dateKey: parseCellDateKey(dateVal), code, amount })
      }
    } else {
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
        parsedRows.push({ dateKey: null, code, amount })
      }
    }

    if (parsedRows.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid data rows found' }, { status: 400 })
    }

    // Single-date files (the daily cash ledger, or any file whose dated rows resolve to
    // one day) keep the picked date — unchanged behavior. A file spanning 2+ distinct
    // dates (the full-year F&O ledger) is distributed so every row lands on its own
    // trading date instead of being crammed onto the one picked date. Undated rows fall
    // back to the picked date, never dropped.
    const distinctDates = new Set(parsedRows.map((r) => r.dateKey).filter((k): k is string => !!k))
    const multiDate = distinctDates.size >= 2

    // dateKey -> code -> amount (summed), and -> code -> row count (for dedupe reporting)
    const groups = new Map<string, { codeAmount: Map<string, number>; codeRows: Map<string, number> }>()
    for (const r of parsedRows) {
      const key = multiDate ? (r.dateKey ?? dateParam) : dateParam
      let g = groups.get(key)
      if (!g) { g = { codeAmount: new Map(), codeRows: new Map() }; groups.set(key, g) }
      g.codeAmount.set(r.code, (g.codeAmount.get(r.code) ?? 0) + r.amount)
      g.codeRows.set(r.code, (g.codeRows.get(r.code) ?? 0) + 1)
    }

    // Map every code across all dates to its EQUITY client/operator in one query.
    const allCodes = [...new Set(parsedRows.map((r) => r.code))]
    const clientRecords = await prisma.client.findMany({
      where: { clientCode: { in: allCodes }, department: 'EQUITY' },
      select: { id: true, clientCode: true, operatorId: true },
    })
    const codeToClient = new Map(clientRecords.map((c) => [c.clientCode, c]))

    // Compute the write plan for each date group (reads only). Every row is recorded —
    // an upload is never rejected for unmapped codes; codes with no Client are stored
    // unattributed (see buildVersionDetails) and reported so the UI can flag them.
    type Plan = {
      uploadDate: Date
      dateKey: string
      existingUploads: { id: string; version: number; isActive: boolean }[]
      nextVersion: number
      details: DetailRow[]
      unmappedCodes: string[]
      segmentAmount: number
      carriedAmount: number
      mappedFromFile: number
      totalAmount: number
      duplicatesConsolidated: number
    }
    const plans: Plan[] = []
    for (const [dateKey, g] of groups) {
      const uploadDate = new Date(`${dateKey}T00:00:00.000Z`)
      const existingUploads = await prisma.brokerageUpload.findMany({
        where: { uploadDate, branch },
        select: { id: true, version: true, isActive: true },
        orderBy: { version: 'desc' },
      })
      const nextVersion = existingUploads.length > 0 ? existingUploads[0].version + 1 : 1
      const activeUpload = existingUploads.find((u) => u.isActive)
      const prevRows = activeUpload
        ? ((await prisma.brokerageDetail.findMany({
            where: { brokerageId: activeUpload.id },
            select: { clientCode: true, clientId: true, operatorId: true, amount: true, segment: true },
          })) as DetailRow[])
        : []
      const built = buildVersionDetails(prevRows, segment, g.codeAmount, codeToClient)
      plans.push({
        uploadDate,
        dateKey,
        existingUploads,
        nextVersion,
        ...built,
        totalAmount: built.details.reduce((s, d) => s + d.amount, 0),
        duplicatesConsolidated: [...g.codeRows.values()].filter((c) => c > 1).length,
      })
    }
    plans.sort((a, b) => a.dateKey.localeCompare(b.dateKey))

    // Aggregate figures across all date groups.
    const allDetails = plans.flatMap((p) => p.details)
    const totalAmount = plans.reduce((s, p) => s + p.totalAmount, 0)
    const segmentAmount = plans.reduce((s, p) => s + p.segmentAmount, 0)
    const carriedAmount = plans.reduce((s, p) => s + p.carriedAmount, 0)
    const mappedFromFile = plans.reduce((s, p) => s + p.mappedFromFile, 0)
    const unmappedCodes = [...new Set(plans.flatMap((p) => p.unmappedCodes))]
    const duplicatesConsolidated = plans.reduce((s, p) => s + p.duplicatesConsolidated, 0)
    const existingVersions = plans.reduce((s, p) => s + p.existingUploads.length, 0)
    const dateExists = plans.some((p) => p.existingUploads.length > 0)

    // Build operator summary across all groups (for both preview and response).
    const operatorIds = [...new Set(allDetails.map((d) => d.operatorId).filter((id) => id !== UNASSIGNED_OPERATOR))]
    const operators = await prisma.employee.findMany({
      where: { id: { in: operatorIds } },
      select: { id: true, name: true },
    })
    const operatorNameMap = new Map(operators.map((o) => [o.id, o.name]))

    const opSummaryMap = new Map<string, { operatorName: string; clientCount: number; totalAmount: number }>()
    for (const d of allDetails) {
      const name = d.operatorId === UNASSIGNED_OPERATOR
        ? 'Unassigned (code not in master)'
        : operatorNameMap.get(d.operatorId) ?? 'Unknown'
      const existing = opSummaryMap.get(d.operatorId) ?? { operatorName: name, clientCount: 0, totalAmount: 0 }
      opSummaryMap.set(d.operatorId, {
        operatorName: name,
        clientCount: existing.clientCount + 1,
        totalAmount: existing.totalAmount + d.amount,
      })
    }
    const operatorSummary = Array.from(opSummaryMap.values())

    // Per-date breakdown so the preview can show a multi-date file's spread.
    const dateBreakdown = plans.map((p) => ({
      date: p.dateKey,
      totalAmount: p.totalAmount,
      segmentAmount: p.segmentAmount,
      mapped: p.mappedFromFile,
      unmapped: p.unmappedCodes.length,
    }))

    // Preview mode — return summary without writing to DB
    const isPreview = formData.get('preview') === 'true'
    if (isPreview) {
      return NextResponse.json({
        success: true,
        data: {
          operatorSummary,
          totalClients: allDetails.length,
          totalAmount,
          unmappedCodes,
          duplicatesConsolidated,
          existingVersions,
          nextVersion: plans[0].nextVersion,
          dateExists,
          segment,
          segmentAmount,
          carriedAmount,
          multiDate,
          dateCount: plans.length,
          dateBreakdown,
        },
      })
    }

    // Confirm mode — create new version, deactivate previous versions
    // Confirm mode — write one new active version per date group in a single transaction.
    // Each group carries its day's other segment forward and replaces this segment, exactly
    // as the single-date path always has; a single-date file is just one group.
    const affectedClientIds = new Set<string>()
    const created = await prisma.$transaction(async (tx) => {
      const uploads: { id: string; uploadDate: Date; version: number }[] = []
      for (const p of plans) {
        if (p.existingUploads.length > 0) {
          const prevDetails = await tx.brokerageDetail.findMany({
            where: { brokerageId: { in: p.existingUploads.map((u) => u.id) }, clientId: { not: null } },
            select: { clientId: true },
          })
          prevDetails.forEach((d) => affectedClientIds.add(d.clientId!))
          await tx.brokerageUpload.updateMany({
            where: { uploadDate: p.uploadDate, branch },
            data: { isActive: false },
          })
        }
        const newUpload = await tx.brokerageUpload.create({
          data: {
            uploadDate: p.uploadDate,
            branch,
            version: p.nextVersion,
            isActive: true,
            uploadedById: session.user.id,
            totalAmount: p.totalAmount,
            fileName: file.name,
            details: { create: p.details },
          },
          select: { id: true, uploadDate: true, version: true },
        })
        p.details.forEach((d) => { if (d.clientId) affectedClientIds.add(d.clientId) })
        uploads.push(newUpload)
      }

      // Re-derive Client.status from the now-active brokerage data across every touched
      // client. status always reflects the *current* month (default ref), the same rule
      // the reverse and activate routes follow.
      await resyncEquityClientStatus(tx, [...affectedClientIds])

      return uploads
    }, { timeout: 120_000, maxWait: 15_000 })  // a full-year F&O ledger writes many date groups

    // Send notifications to all EQUITY_DEALER employees
    const equityDealers = await prisma.employee.findMany({
      where: { role: 'EQUITY_DEALER', isActive: true },
      select: { id: true },
    })

    const dateLabel = plans.length === 1
      ? new Date(`${plans[0].dateKey}T00:00:00.000Z`).toDateString()
      : `${plans.length} dates (${plans[0].dateKey} to ${plans[plans.length - 1].dateKey})`

    if (equityDealers.length > 0) {
      await createNotificationForMany({
        userIds: equityDealers.map((e) => e.id),
        type: 'BROKERAGE_UPLOAD',
        title: 'Brokerage data uploaded',
        message: `Brokerage data for ${branch} branch on ${dateLabel} has been uploaded.`,
        link: '/brokerage',
      })
    }

    await logActivity({
      userId: session.user.id,
      action: 'UPLOAD',
      module: 'BROKERAGE',
      details: `Uploaded ${segment} brokerage for ${dateLabel} (${branch}). ${segment}: ${segmentAmount}. Total: ${totalAmount}. Mapped: ${mappedFromFile}. Unmapped: ${unmappedCodes.length}`,
    })

    // Invalidate admin dashboard cache so traded-client counts reflect the new upload immediately
    invalidateCache('dashboard:')

    return NextResponse.json({
      success: true,
      data: {
        uploadId: created[0].id,
        uploadDate: created[0].uploadDate,
        uploadDates: created.map((u) => u.uploadDate),
        dateCount: created.length,
        version: created[0].version,
        totalAmount,
        segment,
        segmentAmount,
        mappedCount: mappedFromFile,
        unmappedCount: unmappedCodes.length,
        skippedCodes: unmappedCodes,
        previousVersionsDeactivated: existingVersions,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Upload conflict — a concurrent upload was in progress. Please retry.' }, { status: 409 })
    }
    console.error('[POST /api/brokerage/upload]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

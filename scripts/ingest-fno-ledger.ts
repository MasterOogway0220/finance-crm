/**
 * One-off backfill for the FNO segment ledger, which has never been uploaded through
 * the normal daily flow. Mirrors the upload route's semantics but MERGES instead of
 * replacing: for each date it writes a new version containing the existing active
 * rows PLUS the FNO amounts summed into the same client codes, so a backfill can
 * never wipe a day's cash-segment brokerage.
 *
 * Dry run (default, read-only):
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/ingest-fno-ledger.ts "C:/path/FNO Clients.xls" --branch Mumbai --from 2026-08-01
 * Apply:
 *   ...same... --apply
 */
import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import { extractClientCodeFromNarration } from '../src/lib/brokerage-code'

const prisma = new PrismaClient()

const args = process.argv.slice(2)
const filePath = args.find((a) => !a.startsWith('--'))
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}
const APPLY = args.includes('--apply')
const BRANCH = flag('branch') ?? 'Mumbai'
const FROM = flag('from') ? new Date(`${flag('from')}T00:00:00.000Z`) : new Date('2000-01-01T00:00:00.000Z')
const TO = flag('to') ? new Date(`${flag('to')}T00:00:00.000Z`) : new Date('2100-01-01T00:00:00.000Z')

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "4-Aug-26" → 2026-08-04T00:00:00Z. Returns null for anything else. */
function parseLedgerDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (!m) return null
  const month = MONTHS.indexOf(m[2].toLowerCase())
  if (month === -1) return null
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return new Date(Date.UTC(year, month, Number(m[1])))
}

async function main() {
  if (!filePath) throw new Error('Pass the ledger file path as the first argument')

  const wb = XLSX.readFile(filePath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }) as string[][]

  const headerIdx = rows.findIndex((r) => r.map((c) => String(c).toLowerCase().trim()).includes('narration'))
  if (headerIdx === -1) throw new Error('No Narration column found')
  const headers = rows[headerIdx].map((h) => String(h).toLowerCase().trim())
  const dateIdx = headers.indexOf('date')
  const narrIdx = headers.indexOf('narration')
  const creditIdx = headers.indexOf('credit')

  // date (UTC ms) -> clientCode -> amount
  const byDate = new Map<number, Map<string, number>>()
  let skippedDates = 0
  for (const row of rows.slice(headerIdx + 1)) {
    const date = parseLedgerDate(String(row[dateIdx] ?? ''))
    const narration = String(row[narrIdx] ?? '').trim()
    const amount = parseFloat(String(row[creditIdx] ?? '').replace(/,/g, ''))
    if (!narration) continue
    if (!date) { if (String(row[dateIdx] ?? '').trim()) skippedDates++; continue }
    if (!amount || isNaN(amount) || amount <= 0) continue
    if (date < FROM || date > TO) continue
    const code = extractClientCodeFromNarration(narration)
    if (!code) continue
    if (!byDate.has(date.getTime())) byDate.set(date.getTime(), new Map())
    const m = byDate.get(date.getTime())!
    m.set(code, (m.get(code) ?? 0) + amount)
  }

  if (skippedDates > 0) console.log(`! ${skippedDates} row(s) had an unparseable date and were skipped\n`)

  const dates = [...byDate.keys()].sort((a, b) => a - b)
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — branch=${BRANCH}, ${dates.length} date(s), file=${filePath}\n`)

  const allCodes = [...new Set(dates.flatMap((d) => [...byDate.get(d)!.keys()]))]
  const clientRows = await prisma.client.findMany({
    where: { clientCode: { in: allCodes }, department: 'EQUITY' },
    select: { id: true, clientCode: true, operatorId: true },
  })
  const codeToClient = new Map(clientRows.map((c) => [c.clientCode, c]))
  const unmapped = allCodes.filter((c) => !codeToClient.has(c))
  if (unmapped.length) console.log(`! ${unmapped.length} code(s) not in EQUITY Client master, will be skipped: ${unmapped.join(', ')}\n`)

  const touchedClientIds = new Set<string>()
  let addedTotal = 0

  for (const ms of dates) {
    const uploadDate = new Date(ms)
    const fno = byDate.get(ms)!
    const day = uploadDate.toISOString().slice(0, 10)

    const existing = await prisma.brokerageUpload.findMany({
      where: { uploadDate, branch: BRANCH },
      select: { id: true, version: true, isActive: true },
      orderBy: { version: 'desc' },
    })
    const active = existing.find((u) => u.isActive)
    const nextVersion = existing.length ? existing[0].version + 1 : 1

    const merged = new Map<string, { clientCode: string; clientId: string | null; operatorId: string; amount: number }>()
    if (active) {
      const prev = await prisma.brokerageDetail.findMany({
        where: { brokerageId: active.id },
        select: { clientCode: true, clientId: true, operatorId: true, amount: true },
      })
      for (const d of prev) merged.set(d.clientCode, { ...d })
    }

    let addedHere = 0
    const newCodes: string[] = []
    for (const [code, amount] of fno) {
      const client = codeToClient.get(code)
      if (!client) continue
      addedHere += amount
      touchedClientIds.add(client.id)
      const row = merged.get(code)
      if (row) {
        row.amount += amount
      } else {
        newCodes.push(code)
        // Snapshot the operator who owns the client today — same rule the upload route uses.
        merged.set(code, { clientCode: code, clientId: client.id, operatorId: client.operatorId, amount })
      }
    }
    if (addedHere === 0) continue
    addedTotal += addedHere

    const details = [...merged.values()]
    const totalAmount = details.reduce((s, d) => s + d.amount, 0)
    console.log(
      `${day}  v${active?.version ?? '-'} -> v${nextVersion}  rows ${active ? details.length - newCodes.length : 0}+${newCodes.length}=${details.length}  ` +
      `+₹${addedHere.toFixed(2)} (new total ₹${totalAmount.toFixed(2)})${newCodes.length ? `  new: ${newCodes.join(',')}` : ''}`,
    )

    if (!APPLY) continue

    await prisma.$transaction(async (tx) => {
      if (existing.length) {
        await tx.brokerageUpload.updateMany({ where: { uploadDate, branch: BRANCH }, data: { isActive: false } })
      }
      await tx.brokerageUpload.create({
        data: {
          uploadDate,
          branch: BRANCH,
          version: nextVersion,
          isActive: true,
          totalAmount,
          fileName: `FNO backfill (merged into v${active?.version ?? 0})`,
          details: { create: details },
        },
      })
    })
  }

  console.log(`\n${APPLY ? 'Applied' : 'Would add'} ₹${addedTotal.toFixed(2)} across ${touchedClientIds.size} client(s).`)

  if (APPLY && touchedClientIds.size) {
    const { resyncEquityClientStatus } = await import('../src/lib/brokerage-status')
    const res = await resyncEquityClientStatus(prisma, [...touchedClientIds])
    console.log(`Status resync: ${res.traded} -> TRADED, ${res.notTraded} -> NOT_TRADED`)
  } else if (!APPLY) {
    console.log('Nothing written. Re-run with --apply to commit.')
  }
}

main()
  .catch((e) => { console.error('ERROR:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })

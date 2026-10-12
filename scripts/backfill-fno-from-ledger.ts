/**
 * Reconciles F&O brokerage against the till-date SNAP "Financial Ledger" (all segments,
 * one file). Daily uploads carry cash + SLB; F&O mostly never reached the CRM, and on a
 * few days it did but was filed as CASH (or a cash file was filed as FNO). Per (date, code):
 *
 *   ADD      ledger F&O, CRM has none of it            → new FNO row
 *   SPLIT    CRM cash row = ledger cash+SLB + F&O       → move the F&O part to an FNO row
 *   RELABEL  CRM FNO row, ledger has no F&O for it      → back to CASH (cash file sent as F&O)
 *   REVIEW   anything else                              → reported, never touched
 *
 * --cash-dates d1,d2: also restore those days' CASH to the ledger's cash+SLB, raising a
 * short row or adding a missing client — never lowering one (a higher CRM figure is
 * reported for review instead).
 *
 * Plus any stored "FB<code>" row (BSE F&O marker left on) is re-pointed at its client.
 * Day totals only grow by ADD; SPLIT/RELABEL move money between segments. Each changed day
 * gets a NEW active version carrying every other row as-is — older versions stay, so the
 * change is reversible from the Brokerage log.
 *
 *   npx tsx scripts/backfill-fno-from-ledger.ts "<ledger.xls>" [--from 2026-04-01] [--cash-dates 2026-08-27] [--apply]
 */
import 'dotenv/config'
import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'
import { prisma } from '../src/lib/prisma'
import { extractClientCodeFromNarration, parseCellDateKey } from '../src/lib/brokerage-code'
import { UNASSIGNED_OPERATOR, type DetailRow } from '../src/lib/brokerage-merge'
import { resyncEquityClientStatus } from '../src/lib/brokerage-status'

const args = process.argv.slice(2)
const filePath = args.find((a) => !a.startsWith('--'))
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i === -1 ? undefined : args[i + 1] }
const APPLY = args.includes('--apply')
// Jan–Mar were imported as monthly lumps that already include F&O.
const FROM = flag('from') ?? '2026-04-01'
const CASH_DATES = new Set((flag('cash-dates') ?? '').split(',').filter(Boolean))
const BRANCH = 'Mumbai'  // the ledger is the Mumbai entity's (18999, Z/M vouchers)
const EPS = 1
const r2 = (n: number) => Math.round(n * 100) / 100
const stripFB = (c: string) => c.replace(/^FB?(?=\d)/, '')

if (!filePath) { console.error('usage: backfill-fno-from-ledger.ts <ledger.xls> [--from YYYY-MM-DD] [--apply]'); process.exit(1) }

type Totals = { cs: Map<string, number>; fno: Map<string, number> }

function readLedger(path: string): Map<string, Totals> {
  const wb = XLSX.read(readFileSync(path), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  const hdr = rows.findIndex((r) => r.map((c) => String(c ?? '').trim().toLowerCase()).includes('narration'))
  const h = rows[hdr].map((c) => String(c ?? '').trim().toLowerCase())
  const [iDate, iSeg, iCr, iNar] = ['date', 'segment', 'credit', 'narration'].map((k) => h.indexOf(k))
  const out = new Map<string, Totals>()
  for (const r of rows.slice(hdr + 1)) {
    const date = parseCellDateKey(r[iDate])
    const amt = Number(r[iCr])
    const nar = String(r[iNar] ?? '').trim()
    // month-end inter-segment / sub-broker transfers are the house account, not a client
    if (!date || !(amt > 0) || !nar || /^18999\b|KESAR/i.test(nar)) continue
    const code = extractClientCodeFromNarration(nar)
    const t = out.get(date) ?? { cs: new Map(), fno: new Map() }
    const m = /FO/i.test(String(r[iSeg])) ? t.fno : t.cs
    m.set(code, (m.get(code) ?? 0) + amt)
    out.set(date, t)
  }
  return out
}

async function main() {
  const ledger = readLedger(filePath!)
  const dates = [...ledger.keys()].filter((d) => d >= FROM).sort()

  const uploads = await prisma.brokerageUpload.findMany({
    where: { branch: BRANCH, uploadDate: { gte: new Date(`${FROM}T00:00:00.000Z`) } },
    select: { id: true, uploadDate: true, version: true, isActive: true },
  })
  const activeIds = uploads.filter((u) => u.isActive).map((u) => u.id)
  const allDetails = await prisma.brokerageDetail.findMany({
    where: { brokerageId: { in: activeIds } },
    select: { brokerageId: true, clientCode: true, clientId: true, operatorId: true, amount: true, segment: true },
  })
  const clients = await prisma.client.findMany({ where: { department: 'EQUITY' }, select: { id: true, clientCode: true, operatorId: true } })
  const codeToClient = new Map(clients.map((c) => [c.clientCode, c]))
  const admin = await prisma.employee.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true } })

  type Plan = { date: string; uploadDate: Date; oldIds: string[]; nextVersion: number; details: DetailRow[]; before: number; after: number; notes: string[] }
  const plans: Plan[] = []
  const review: string[] = []
  const tally = { ADD: 0, SPLIT: 0, RELABEL: 0, REMAP: 0, CASH: 0 }

  // Dates with CRM FNO rows but no ledger F&O also need a look (RELABEL).
  const fnoDates = new Set(allDetails.filter((d) => d.segment === 'FNO').map((d) => uploads.find((u) => u.id === d.brokerageId)!.uploadDate.toISOString().slice(0, 10)))
  const fbDates = new Set(allDetails.filter((d) => d.clientCode !== stripFB(d.clientCode)).map((d) => uploads.find((u) => u.id === d.brokerageId)!.uploadDate.toISOString().slice(0, 10)))
  const candidates = [...new Set([...dates.filter((d) => ledger.get(d)!.fno.size > 0), ...fnoDates, ...fbDates, ...CASH_DATES])].sort()

  for (const date of candidates) {
    const L = ledger.get(date) ?? { cs: new Map(), fno: new Map() }
    const uploadDate = new Date(`${date}T00:00:00.000Z`)
    const dayUploads = uploads.filter((u) => u.uploadDate.getTime() === uploadDate.getTime())
    const active = dayUploads.find((u) => u.isActive)
    const rows: DetailRow[] = active
      ? allDetails.filter((d) => d.brokerageId === active.id).map((d) => ({ clientCode: d.clientCode, clientId: d.clientId, operatorId: d.operatorId, amount: d.amount, segment: d.segment as DetailRow['segment'] }))
      : []
    const before = rows.reduce((s, r) => s + r.amount, 0)
    const notes: string[] = []
    let changed = false

    // REMAP: "FB91382619" → client 91382619
    for (const r of rows) {
      const c = stripFB(r.clientCode)
      if (c !== r.clientCode) {
        const cl = codeToClient.get(c)
        notes.push(`REMAP ${r.clientCode} → ${c}`)
        r.clientCode = c; r.clientId = cl?.id ?? null; r.operatorId = cl?.operatorId ?? UNASSIGNED_OPERATOR
        tally.REMAP++; changed = true
      }
    }

    const find = (code: string, seg: string) => rows.find((r) => r.clientCode === code && r.segment === seg)

    if (CASH_DATES.has(date)) {
      for (const [code, cs] of L.cs) {
        const cash = find(code, 'CASH')
        if (!cash) {
          const cl = codeToClient.get(code)
          rows.push({ clientCode: code, clientId: cl?.id ?? null, operatorId: cl?.operatorId ?? UNASSIGNED_OPERATOR, amount: r2(cs), segment: 'CASH' })
          notes.push(`CASH+ ${code} ${r2(cs)}${cl ? '' : ' (UNASSIGNED)'}`); tally.CASH++; changed = true
        } else if (cs - cash.amount > EPS) {
          notes.push(`CASH↑ ${code} ${r2(cash.amount)}→${r2(cs)}`); cash.amount = r2(cs); tally.CASH++; changed = true
        } else if (cash.amount - cs > EPS) {
          review.push(`${date} ${code}: CRM cash ${r2(cash.amount)} above ledger ${r2(cs)} — left alone`)
        }
      }
    }

    // RELABEL: FNO row the ledger says is cash
    for (const r of rows.filter((x) => x.segment === 'FNO')) {
      const fno = L.fno.get(r.clientCode) ?? 0
      const cs = L.cs.get(r.clientCode) ?? 0
      if (fno === 0 && Math.abs(r.amount - cs) <= EPS && !find(r.clientCode, 'CASH')) {
        r.segment = 'CASH'; notes.push(`RELABEL ${r.clientCode} ${r2(r.amount)} FNO→CASH`); tally.RELABEL++; changed = true
      } else if (fno > 0 && Math.abs(r.amount - fno) <= EPS) {
        // already right
      } else {
        review.push(`${date} ${r.clientCode}: CRM FNO ${r2(r.amount)} vs ledger F&O ${r2(fno)} cash ${r2(cs)}`)
      }
    }

    for (const [code, fno] of L.fno) {
      if (find(code, 'FNO')) continue
      const cs = L.cs.get(code) ?? 0
      const cash = find(code, 'CASH')
      const dbCash = cash?.amount ?? 0
      if (cash && Math.abs(dbCash - (cs + fno)) <= EPS) {
        cash.amount = r2(dbCash - fno)
        if (cash.amount <= 0) rows.splice(rows.indexOf(cash), 1)
        rows.push({ clientCode: code, clientId: cash.clientId, operatorId: cash.operatorId, amount: r2(fno), segment: 'FNO' })
        notes.push(`SPLIT ${code} ${r2(fno)} cash→FNO`); tally.SPLIT++; changed = true
      } else if (Math.abs(dbCash - cs) <= EPS) {
        const cl = codeToClient.get(code)
        rows.push({ clientCode: code, clientId: cl?.id ?? null, operatorId: cl?.operatorId ?? UNASSIGNED_OPERATOR, amount: r2(fno), segment: 'FNO' })
        notes.push(`ADD ${code} ${r2(fno)}${cl ? '' : ' (UNASSIGNED)'}`); tally.ADD++; changed = true
      } else {
        review.push(`${date} ${code}: ledger cash+SLB ${r2(cs)} + F&O ${r2(fno)}, CRM cash ${r2(dbCash)} — left alone`)
      }
    }

    if (!changed) continue
    const after = rows.reduce((s, r) => s + r.amount, 0)
    plans.push({
      date, uploadDate, oldIds: dayUploads.map((u) => u.id),
      nextVersion: dayUploads.reduce((m, u) => Math.max(m, u.version), 0) + 1,
      details: rows, before, after, notes,
    })
  }

  for (const p of plans) console.log(`${p.date}  v${p.nextVersion}  ${r2(p.before)} → ${r2(p.after)}  (+${r2(p.after - p.before)})  ${p.notes.join('; ')}`)
  console.log(`\n${plans.length} day(s) to change. ADD ${tally.ADD}, SPLIT ${tally.SPLIT}, RELABEL ${tally.RELABEL}, REMAP ${tally.REMAP}, CASH ${tally.CASH}. Net added: ₹${r2(plans.reduce((s, p) => s + p.after - p.before, 0))}`)
  if (review.length) console.log(`\nREVIEW (not touched):\n  ${review.join('\n  ')}`)

  if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply.'); return }

  const touched = new Set<string>()
  for (const p of plans) {
    await prisma.$transaction(async (tx) => {
      if (p.oldIds.length) await tx.brokerageUpload.updateMany({ where: { uploadDate: p.uploadDate, branch: BRANCH }, data: { isActive: false } })
      await tx.brokerageUpload.create({
        data: {
          uploadDate: p.uploadDate, branch: BRANCH, version: p.nextVersion, isActive: true,
          uploadedById: admin?.id, totalAmount: p.after,
          fileName: 'F&O reconcile from financial ledger 26-27.xls',
          details: { create: p.details },
        },
      })
    }, { timeout: 60_000 })
    p.details.forEach((d) => d.clientId && touched.add(d.clientId))
    console.log(`  applied ${p.date}`)
  }
  await resyncEquityClientStatus(prisma, [...touched])
  await prisma.activityLog.create({
    data: {
      userId: admin!.id, action: 'UPLOAD', module: 'BROKERAGE',
      details: `F&O reconcile from till-date ledger: ${plans.length} day(s), ADD ${tally.ADD}, SPLIT ${tally.SPLIT}, RELABEL ${tally.RELABEL}, REMAP ${tally.REMAP}, CASH ${tally.CASH}`,
    },
  })
  console.log('Done.')
}

main().finally(() => prisma.$disconnect())

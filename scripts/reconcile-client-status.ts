/**
 * One-time reconcile: re-derive EQUITY Client.status from the active brokerage data
 * for the CURRENT month, fixing flags that drifted (e.g. the June-17 reverse left
 * clients stuck NOT_TRADED despite having active brokerage).
 *
 * Mirrors the logic in src/lib/brokerage-status.ts (which the API routes now use),
 * but is self-contained so it runs under plain ts-node (no `@/` alias). Pass `--dry`
 * to preview without writing.
 *
 * Run:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/reconcile-client-status.ts [--dry]
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DRY = process.argv.includes('--dry')
// By default only RESTORE clients stuck NOT_TRADED despite active brokerage (the
// activate/reverse bug). Resetting TRADED→NOT_TRADED is gated behind --full because
// that group stems from a separate monthly-reset gap and is a much larger change.
const FULL = process.argv.includes('--full')

// Same partition as partitionByTradedStatus() — null-safe, de-duped.
function partition(clientIds: (string | null | undefined)[], traded: (string | null | undefined)[]) {
  const ids = [...new Set(clientIds.filter((id): id is string => !!id))]
  const tradedSet = new Set(traded.filter((id): id is string => !!id))
  return { toTrade: ids.filter((id) => tradedSet.has(id)), toReset: ids.filter((id) => !tradedSet.has(id)) }
}

async function main() {
  await prisma.$queryRaw`SELECT 1`
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  console.log(`${DRY ? '[DRY RUN] ' : ''}Reconciling EQUITY status for ${start.toISOString().slice(0, 10)} .. ${end.toISOString().slice(0, 10)}\n`)

  // Clients that genuinely traded this month (active brokerage detail in current month)
  const tradedRows = await prisma.brokerageDetail.findMany({
    where: { clientId: { not: null }, brokerage: { isActive: true, uploadDate: { gte: start, lte: end } } },
    select: { clientId: true },
    distinct: ['clientId'],
  })
  const tradedIds = tradedRows.map((r) => r.clientId!)

  // Clients currently flagged TRADED
  const currentlyTraded = await prisma.client.findMany({
    where: { department: 'EQUITY', status: 'TRADED' },
    select: { id: true },
  })

  // Only these clients can possibly need a change; everyone else is already correct.
  const candidates = [...new Set([...tradedIds, ...currentlyTraded.map((c) => c.id)])]
  const { toTrade, toReset } = partition(candidates, tradedIds)

  // Report exactly what will change (status differs from current flag)
  const willTrade = await prisma.client.findMany({
    where: { id: { in: toTrade }, department: 'EQUITY', status: { not: 'TRADED' } },
    select: { clientCode: true, firstName: true, lastName: true, operator: { select: { name: true } } },
  })
  const willReset = await prisma.client.findMany({
    where: { id: { in: toReset }, department: 'EQUITY', status: { not: 'NOT_TRADED' } },
    select: { clientCode: true, firstName: true, lastName: true, operator: { select: { name: true } } },
  })

  console.log(`→ RESTORE to TRADED (stuck NOT_TRADED but have active brokerage): ${willTrade.length}`)
  for (const c of willTrade) console.log(`    ${c.clientCode.padEnd(10)} ${c.firstName} ${c.lastName}  (op ${c.operator?.name ?? '?'})`)
  console.log(`→ ${FULL ? 'RESET' : '(skipped — pass --full to apply)'} to NOT_TRADED (flagged TRADED but no active brokerage): ${willReset.length}`)
  if (FULL) for (const c of willReset) console.log(`    ${c.clientCode.padEnd(10)} ${c.firstName} ${c.lastName}  (op ${c.operator?.name ?? '?'})`)
  console.log('')

  if (DRY) {
    console.log('[DRY RUN] No changes written.')
    return
  }

  let traded = 0
  let notTraded = 0
  if (toTrade.length > 0) {
    const res = await prisma.client.updateMany({
      where: { id: { in: toTrade }, department: 'EQUITY', status: { not: 'TRADED' } },
      data: { status: 'TRADED' },
    })
    traded = res.count
  }
  if (FULL && toReset.length > 0) {
    const res = await prisma.client.updateMany({
      where: { id: { in: toReset }, department: 'EQUITY', status: { not: 'NOT_TRADED' } },
      data: { status: 'NOT_TRADED' },
    })
    notTraded = res.count
  }
  console.log(`✓ Applied: ${traded} set TRADED, ${notTraded} set NOT_TRADED${FULL ? '' : ' (restore-only; --full not passed)'}\n`)

  // Verify: no EQUITY client should have active current-month brokerage yet show NOT_TRADED
  const remainingStale = await prisma.client.count({
    where: {
      department: 'EQUITY',
      status: 'NOT_TRADED',
      brokerageDetails: { some: { brokerage: { isActive: true, uploadDate: { gte: start, lte: end } } } },
    },
  })
  console.log(`Post-check — EQUITY clients still stuck (active brokerage but NOT_TRADED): ${remainingStale}`)
}

main()
  .catch((e) => { console.error('ERROR:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })

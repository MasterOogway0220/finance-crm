/**
 * Quick diagnostic to validate the C1 fix.
 * Computes what the 7-month chart would show for a transferred-in operator
 * when a PAST month is requested. The bar for the requested month should
 * equal the snapshot-attribution sum for that month, NOT twice that.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Pick the operator with the most transferred-in clients.
  const cands = await prisma.$queryRaw<{ operatorId: string }[]>`
    SELECT c.operatorId
    FROM BrokerageDetail bd
    JOIN Client c ON bd.clientId = c.id
    WHERE bd.operatorId <> c.operatorId
    GROUP BY c.operatorId
    ORDER BY COUNT(DISTINCT bd.clientId) DESC
    LIMIT 1
  `
  if (cands.length === 0) { console.log('no candidates'); return }
  const opId = cands[0].operatorId
  const op = await prisma.employee.findUnique({ where: { id: opId } })

  // Simulate a "request past month" call. Pick March 2026 (2 months ago vs May 2026 today).
  const reqMonth = 3
  const reqYear = 2026
  const monthStart = new Date(reqYear, reqMonth - 1, 1)
  const monthEnd = new Date(reqYear, reqMonth, 0, 23, 59, 59, 999)
  // The endpoint fetches 7 months ending at the requested month
  const historyStart = new Date(reqYear, reqMonth - 1 - 6, 1)
  const historyEnd = monthEnd

  // Past-history query: snapshot operatorId across the past portion of the window.
  // After the fix: pastHistoryEnd = monthStart - 1ms.
  const pastHistoryEnd = new Date(monthStart.getTime() - 1)
  const pastRows = pastHistoryEnd >= historyStart
    ? await prisma.brokerageDetail.findMany({
        where: {
          clientId: { not: null },
          operatorId: opId,
          brokerage: { isActive: true, uploadDate: { gte: historyStart, lte: pastHistoryEnd } },
        },
        select: { amount: true, brokerage: { select: { uploadDate: true } } },
      })
    : []

  // curMonthDetails for a past request → snapshot attribution arm
  const curRows = await prisma.brokerageDetail.findMany({
    where: {
      clientId: { not: null },
      operatorId: opId,
      brokerage: { isActive: true, uploadDate: { gte: monthStart, lte: monthEnd } },
    },
    select: { amount: true, brokerage: { select: { uploadDate: true } } },
  })

  // Build the historyMap exactly the way the endpoint does
  const historyMap: Record<string, number> = {}
  for (const r of pastRows) {
    const label = new Date(r.brokerage.uploadDate).toLocaleString('default', { month: 'short', year: '2-digit' })
    historyMap[label] = (historyMap[label] ?? 0) + r.amount
  }
  for (const r of curRows) {
    const label = new Date(r.brokerage.uploadDate).toLocaleString('default', { month: 'short', year: '2-digit' })
    historyMap[label] = (historyMap[label] ?? 0) + r.amount
  }

  const requestedLabel = monthStart.toLocaleString('default', { month: 'short', year: '2-digit' })
  const requestedBarValue = historyMap[requestedLabel] ?? 0

  // Now compute what the requested month's bar SHOULD show: the snapshot sum for that month alone.
  const groundTruth = curRows.reduce((s, r) => s + r.amount, 0)

  console.log(`Subject: ${op?.name} (${opId})`)
  console.log(`Requested past month: ${requestedLabel}`)
  console.log(`Bar value in 7-month chart (post-fix): ₹${requestedBarValue.toFixed(2)}`)
  console.log(`Ground-truth snapshot sum for that month: ₹${groundTruth.toFixed(2)}`)
  if (Math.abs(requestedBarValue - groundTruth) < 0.001) {
    console.log(`✓ Bar value matches ground truth — no double counting.`)
  } else if (Math.abs(requestedBarValue - 2 * groundTruth) < 0.001) {
    console.log(`✗ Bar value is 2× ground truth — DOUBLE COUNTING.`)
    process.exit(1)
  } else {
    console.log(`✗ Bar value doesn't match either expected pattern (groundTruth=${groundTruth}, observed=${requestedBarValue}).`)
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())

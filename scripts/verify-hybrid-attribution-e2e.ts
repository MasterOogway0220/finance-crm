/**
 * verify-hybrid-attribution-e2e.ts
 *
 * For the equity dealer with the most transferred-in clients, prints the brokerage totals
 * computed via the hybrid rules across all key time windows. Used to manually cross-check
 * against the UI after deployment.
 */
import { PrismaClient } from '@prisma/client'
import { brokerageOperatorFilter } from '../src/lib/brokerage-attribution'

const prisma = new PrismaClient()

async function main() {
  const candidates = await prisma.$queryRaw<{ operatorId: string; transferred: bigint }[]>`
    SELECT c.operatorId, COUNT(DISTINCT bd.clientId) as transferred
    FROM BrokerageDetail bd
    JOIN Client c ON bd.clientId = c.id
    WHERE bd.operatorId <> c.operatorId
    GROUP BY c.operatorId
    ORDER BY transferred DESC
    LIMIT 1
  `
  if (candidates.length === 0) { console.log('No transfers in DB.'); return }
  const opId = candidates[0].operatorId
  const op = await prisma.employee.findUnique({ where: { id: opId } })
  console.log(`Subject: ${op?.name} (${opId})\n`)

  const now = new Date()
  const tests: Array<{ label: string; month: number; year: number }> = [
    { label: 'Current month',       month: now.getMonth() + 1, year: now.getFullYear() },
    { label: 'Last month',          month: now.getMonth() === 0 ? 12 : now.getMonth(), year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear() },
    { label: 'Six months ago',      month: ((now.getMonth() - 6 + 12) % 12) + 1, year: now.getFullYear() - (now.getMonth() < 6 ? 1 : 0) },
  ]

  for (const t of tests) {
    const start = new Date(t.year, t.month - 1, 1)
    const end = new Date(t.year, t.month, 0, 23, 59, 59, 999)
    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        ...brokerageOperatorFilter(opId, t.month, t.year),
        brokerage: { isActive: true, uploadDate: { gte: start, lte: end } },
      },
      select: { clientId: true, amount: true },
    })
    const tradedClients = new Set(details.map(d => d.clientId)).size
    const amount = details.reduce((s, d) => s + d.amount, 0)
    console.log(`${t.label.padEnd(20)} ${t.month}/${t.year}  traded=${String(tradedClients).padStart(3)}  ₹${amount.toFixed(0)}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())

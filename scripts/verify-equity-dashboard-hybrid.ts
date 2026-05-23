/**
 * verify-equity-dashboard-hybrid.ts
 *
 * Picks an equity dealer who currently has at least one transferred-in client
 * (BrokerageDetail.operatorId != Client.operatorId), and prints the traded-clients
 * count under each of:
 *   - current month, current-owner attribution (what dashboard now returns)
 *   - same month, snapshot attribution (what dashboard would have returned pre-fix)
 *   - a past month under both attributions (current-owner should NOT be used for past)
 *
 * Run this before AND after the dashboard change. Numbers should agree with the
 * dashboard UI after the change.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const now = new Date()
  const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const curMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  const pastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const pastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

  // Pick the equity dealer with the most transferred-in clients (best signal)
  const candidates = await prisma.$queryRaw<{ operatorId: string; transferred: bigint }[]>`
    SELECT c.operatorId, COUNT(DISTINCT bd.clientId) as transferred
    FROM BrokerageDetail bd
    JOIN Client c ON bd.clientId = c.id
    WHERE bd.operatorId <> c.operatorId
    GROUP BY c.operatorId
    ORDER BY transferred DESC
    LIMIT 1
  `
  if (candidates.length === 0) { console.log('No transferred clients in DB — no signal to test.'); return }
  const opId = candidates[0].operatorId
  const op = await prisma.employee.findUnique({ where: { id: opId }, select: { name: true } })
  console.log(`Subject operator: ${op?.name} (${opId})`)
  console.log('—'.repeat(60))

  // Current month under both attributions
  const curByOwner = await prisma.brokerageDetail.findMany({
    where: { clientId: { not: null }, client: { operatorId: opId }, brokerage: { isActive: true, uploadDate: { gte: curMonthStart, lte: curMonthEnd } } },
    select: { clientId: true, amount: true },
  })
  const curBySnapshot = await prisma.brokerageDetail.findMany({
    where: { clientId: { not: null }, operatorId: opId, brokerage: { isActive: true, uploadDate: { gte: curMonthStart, lte: curMonthEnd } } },
    select: { clientId: true, amount: true },
  })
  console.log(`Current month  by-owner    : ${new Set(curByOwner.map(d => d.clientId)).size} traded, ₹${curByOwner.reduce((s,d)=>s+d.amount,0).toFixed(0)}`)
  console.log(`Current month  by-snapshot : ${new Set(curBySnapshot.map(d => d.clientId)).size} traded, ₹${curBySnapshot.reduce((s,d)=>s+d.amount,0).toFixed(0)}`)
  console.log('(Current month dashboard should now match BY-OWNER row above.)')

  // Past month under both
  const pastByOwner = await prisma.brokerageDetail.findMany({
    where: { clientId: { not: null }, client: { operatorId: opId }, brokerage: { isActive: true, uploadDate: { gte: pastMonthStart, lte: pastMonthEnd } } },
    select: { clientId: true, amount: true },
  })
  const pastBySnapshot = await prisma.brokerageDetail.findMany({
    where: { clientId: { not: null }, operatorId: opId, brokerage: { isActive: true, uploadDate: { gte: pastMonthStart, lte: pastMonthEnd } } },
    select: { clientId: true, amount: true },
  })
  console.log(`Past month     by-owner    : ${new Set(pastByOwner.map(d => d.clientId)).size} traded, ₹${pastByOwner.reduce((s,d)=>s+d.amount,0).toFixed(0)}`)
  console.log(`Past month     by-snapshot : ${new Set(pastBySnapshot.map(d => d.clientId)).size} traded, ₹${pastBySnapshot.reduce((s,d)=>s+d.amount,0).toFixed(0)}`)
  console.log('(Past month dashboard should now match BY-SNAPSHOT row above — the frozen historical credit.)')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())

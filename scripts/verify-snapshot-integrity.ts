/**
 * verify-snapshot-integrity.ts
 *
 * Read-only. Confirms BrokerageDetail.operatorId snapshots reflect true historical
 * attribution (not the d6dd4a2 cascade).
 *
 * Indicator of a healthy snapshot:
 *   - Rows whose snapshot operatorId differs from the client's CURRENT operatorId
 *     indicate transfers happened — that divergence is expected and healthy.
 *   - If snapshot == current for 100% of rows, the cascade was NOT reverted and we
 *     must run scripts/revert-brokerage-operator-backfill.ts first.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const totalRows = await prisma.brokerageDetail.count({ where: { clientId: { not: null } } })

  const divergent = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM BrokerageDetail bd
    JOIN Client c ON bd.clientId = c.id
    WHERE bd.operatorId <> c.operatorId
  `
  const divergentCount = Number(divergent[0]?.count ?? 0)

  console.log('═'.repeat(70))
  console.log('Snapshot integrity check')
  console.log('═'.repeat(70))
  console.log(`Total BrokerageDetail rows with linked client:  ${totalRows}`)
  console.log(`Rows where snapshot != current owner (transferred clients): ${divergentCount}`)
  console.log(`Divergence rate: ${totalRows > 0 ? ((divergentCount / totalRows) * 100).toFixed(2) : '0.00'}%`)
  console.log()

  if (divergentCount === 0) {
    console.log('⚠  ZERO divergence detected. Two possible interpretations:')
    console.log('   (a) No client has ever been transferred (unlikely in production)')
    console.log('   (b) The d6dd4a2 backfill cascade is still in effect (UNSAFE TO PROCEED)')
    console.log()
    console.log('   Run `npx ts-node scripts/revert-brokerage-operator-backfill.ts` to restore')
    console.log('   true snapshots, then re-run this script. Expected post-revert divergence')
    console.log('   for this DB: 196 rows (per b83cd65 commit message).')
    process.exit(1)
  } else {
    console.log('✓ Snapshot has divergence from current owners — historical attribution is intact.')
    console.log('  Safe to proceed with hybrid attribution plan.')
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())

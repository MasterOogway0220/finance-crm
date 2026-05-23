/**
 * verify-current-owner-attribution.ts
 *
 * Read-only. Confirms after revert + query rewiring that:
 *   1. BrokerageDetail.operatorId snapshots are restored (akshita(D)/Shweta have their rows back)
 *   2. The new query path (filter by Client.operatorId) gives Akshita the same totals
 *      she saw post-backfill, including the transferred clients' history
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AKSHITA_ID = 'cmm0ab43b0008jbzox3n91zqj';
const AKSHITA_D_ID = 'cmman4kg70002jp04qt160aqp';
const SHWETA_ID = 'cmm0ab43b0007jbzog6oqj3pu';

async function main() {
  // 1. Snapshot state — should be back to pre-backfill
  console.log('═'.repeat(70));
  console.log('1. BrokerageDetail.operatorId SNAPSHOT counts (post-revert)');
  console.log('═'.repeat(70));
  const snapshotCounts = await prisma.brokerageDetail.groupBy({
    by: ['operatorId'],
    where: { operatorId: { in: [AKSHITA_ID, AKSHITA_D_ID, SHWETA_ID] } },
    _count: { _all: true },
    _sum: { amount: true },
  });
  for (const g of snapshotCounts) {
    const name =
      g.operatorId === AKSHITA_ID ? 'Akshita' :
      g.operatorId === AKSHITA_D_ID ? 'akshita(D)' :
      g.operatorId === SHWETA_ID ? 'Shweta' : g.operatorId;
    console.log(`  ${name.padEnd(15)} ${String(g._count._all).padStart(5)} rows  ₹${(g._sum.amount ?? 0).toFixed(2)}`);
  }
  console.log('  Expected: Akshita 3 (1 original + 2 post-backfill uploads), akshita(D) 194, Shweta 742\n');

  // 2. NEW query path — what Akshita's panel will show via current-owner join
  console.log('═'.repeat(70));
  console.log('2. Current-owner attribution for Akshita (new query path)');
  console.log('═'.repeat(70));
  const akshitaDetails = await prisma.brokerageDetail.findMany({
    where: {
      clientId: { not: null },
      client: { operatorId: AKSHITA_ID },
      brokerage: { isActive: true },
    },
    select: { amount: true, clientId: true, operatorId: true, brokerage: { select: { uploadDate: true } } },
  });
  const total = akshitaDetails.reduce((s, d) => s + d.amount, 0);
  const distinctClients = new Set(akshitaDetails.map((d) => d.clientId!)).size;
  console.log(`  Total rows attributed to Akshita via Client.operatorId:  ${akshitaDetails.length}`);
  console.log(`  Total amount:                                            ₹${total.toFixed(2)}`);
  console.log(`  Distinct clients:                                        ${distinctClients}`);

  // Breakdown by snapshot operatorId — shows how many came via transfer
  const bySnapshot = new Map<string, { rows: number; sum: number }>();
  for (const d of akshitaDetails) {
    const ex = bySnapshot.get(d.operatorId) ?? { rows: 0, sum: 0 };
    ex.rows++; ex.sum += d.amount;
    bySnapshot.set(d.operatorId, ex);
  }
  console.log('\n  Breakdown by historical snapshot operator:');
  for (const [opId, stat] of bySnapshot.entries()) {
    const name =
      opId === AKSHITA_ID ? 'Akshita (always hers)' :
      opId === AKSHITA_D_ID ? 'akshita(D) (transferred in)' :
      opId === SHWETA_ID ? 'Shweta (transferred in)' : opId;
    console.log(`    ${name.padEnd(35)} ${String(stat.rows).padStart(5)} rows  ₹${stat.sum.toFixed(2)}`);
  }

  // 3. Confirm: akshita(D)'s own panel via new query path should be empty (no current clients)
  console.log('\n═'.repeat(70));
  console.log('3. akshita(D) via NEW query path (current-owner)');
  console.log('═'.repeat(70));
  const akshitaDDetails = await prisma.brokerageDetail.count({
    where: {
      clientId: { not: null },
      client: { operatorId: AKSHITA_D_ID },
      brokerage: { isActive: true },
    },
  });
  console.log(`  Rows where akshita(D) is the CURRENT client owner: ${akshitaDDetails}`);
  console.log('  Expected: 0 (akshita(D) is inactive and has no current clients).');
  console.log('  Her ₹57k historical credit is preserved in DB via the snapshot operatorId,');
  console.log('  but it does not appear in her current "panel" totals.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

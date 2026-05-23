/**
 * revert-brokerage-operator-backfill.ts
 *
 * Undoes the data changes made by scripts/backfill-brokerage-operator.ts.
 * Restores BrokerageDetail.operatorId snapshots for the 52 clients we moved
 * to Akshita, sending them back to their original operators:
 *   - 51 clients ← akshita(D)
 *   - 1 client (HANUMAN AMARE / 18H045) ← Shweta
 *
 * The single ₹14.86 row Akshita owned natively (not part of the backfill)
 * is left alone.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/revert-brokerage-operator-backfill.ts --dry-run
 *   npx ts-node --project tsconfig.scripts.json scripts/revert-brokerage-operator-backfill.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Resolved IDs from prior diagnostic:
const AKSHITA_ID = 'cmm0ab43b0008jbzox3n91zqj';   // current owner of all 52 clients post-backfill
const AKSHITA_D_ID = 'cmman4kg70002jp04qt160aqp'; // original snapshot for 51 of those
const SHWETA_ID = 'cmm0ab43b0007jbzog6oqj3pu';    // original snapshot for HANUMAN AMARE

// The bulk client transfer happened on 2026-05-21 06:42:45.
// Any brokerage row uploaded on/after 2026-05-21 was already correctly attributed
// to Akshita at upload time (post-transfer) — those must NOT be reverted.
// Only pre-transfer rows (uploadDate < 2026-05-21) were affected by the backfill.
const TRANSFER_CUTOFF = new Date('2026-05-21T00:00:00.000Z');

// 51 client IDs whose pre-backfill BrokerageDetail.operatorId was akshita(D)
const FROM_AKSHITA_D_CLIENT_IDS = [
  'cmn940g82016uneofbi9ktawo',
  'cmn940lsj01gqneofnvm6mudr',
  'cmn940m3201h8neof6vy3e7ma',
  'cmn93zukt004sneofo5g5g455',
  'cmnmuzxgk0001jl04ubrkltp7',
  'cmn940lp401gkneofth5eg7yr',
  'cmn94055c00n8neofcni4q805',
  'cmn9406d900p8neofhzu1ex7b',
  'cmocdm0mj0001jp04bzj02ig7',
  'cmn940m1y01h6neoff7kh35i3',
  'cmn940cpq010mneofd1h8wkb3',
  'cmn94001900eaneofg9zi3ea8',
  'cmn940be900y8neofd6j6qnrt',
  'cmn93zwsl008sneofjste7ds0',
  'cmn93zsem000sneofjh8nj26x',
  'cmn940hed018yneof295gq4ez',
  'cmn93ztjh002wneof8svx5ard',
  'cmn9402vu00j6neofnvtvjirl',
  'cmn9402ln00ioneofrtv8kfho',
  'cmn9407x400s2neofrbfg89zu',
  'cmn940aj800woneofuhmwv54o',
  'cmn9409fd00uoneofpmqxgech',
  'cmn940czg0114neofmaxavixe',
  'cmn9406jn00pkneof8qy1m5sv',
  'cmn9404m500maneofzvx3zsx8',
  'cmn93zt8o002cneof06umhchd',
  'cmn940er7014aneof8chv9bcx',
  'cmn93zxca009sneof7j757ur1',
  'cmn93ztti003eneofzj2mdljx',
  'cmn9404hl00m2neofs8j6jchi',
  'cmn9400bw00esneofq57xcrqv',
  'cmn93ztsg003cneofk4bk4yug',
  'cmn93ztuk003gneofubrpkfuf',
  'cmn94095h00u6neofceb5yu0j',
  'cmn93ztqc0038neofgj9e7bnd',
  'cmn93zup50050neofl5xk6mpk',
  'cmn93zt270020neofhkd7vx30',
  'cmn9400zc00funeofz5geqelj',
  'cmn93zubm004cneof385tp83d',
  'cmn93zym100c2neofq4fd7yve',
  'cmn93zyo700c6neofgj75tph6',
  'cmn93zuhy004oneofdrwd7ziq',
  'cmn93zsl40014neofaxxexjcf',
  'cmn940coo010kneof2pjxnrn7',
  'cmn940cxa0110neofpsod8dba',
  'cmn940d0i0116neofs85cnr10',
  'cmn94008600emneof17lq4s9l',
  'cmn93zxdm009uneofj2z90yzj',
  'cmn93zt5g0026neofwwhsp26s',
  'cmn93ztmx0032neof1oe0na16',
  'cmn940clg010eneofptwizq7f',
];

const FROM_SHWETA_CLIENT_IDS = [
  'cmn940b4900xqneofg8y7t5g7', // HANUMAN AMARE (18H045)
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE (will update DB)'}\n`);

  // Sanity check: confirm all targeted rows currently have operatorId = Akshita
  // AND were uploaded before the transfer cutoff (those are the ones the backfill moved)
  const akshitaDTargets = await prisma.brokerageDetail.count({
    where: {
      clientId: { in: FROM_AKSHITA_D_CLIENT_IDS },
      operatorId: AKSHITA_ID,
      brokerage: { uploadDate: { lt: TRANSFER_CUTOFF } },
    },
  });
  const shwetaTargets = await prisma.brokerageDetail.count({
    where: {
      clientId: { in: FROM_SHWETA_CLIENT_IDS },
      operatorId: AKSHITA_ID,
      brokerage: { uploadDate: { lt: TRANSFER_CUTOFF } },
    },
  });

  console.log(`Rows to revert ← akshita(D):  ${akshitaDTargets}  (expected 194)`);
  console.log(`Rows to revert ← Shweta:      ${shwetaTargets}  (expected 2)`);

  if (akshitaDTargets !== 194 || shwetaTargets !== 2) {
    console.warn('\n⚠  Counts do not match expected. Verify state before proceeding.');
    if (!dryRun) {
      console.error('Aborting live run for safety. Re-run with --dry-run to inspect, or check the DB.');
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log('\nDRY-RUN complete. Re-run without --dry-run to apply.');
    return;
  }

  console.log('\nApplying revert…');
  // Note: Prisma updateMany does not support relation filters directly, so we
  // first fetch the matching row IDs then update by id.
  const akshitaDRowIds = await prisma.brokerageDetail.findMany({
    where: {
      clientId: { in: FROM_AKSHITA_D_CLIENT_IDS },
      operatorId: AKSHITA_ID,
      brokerage: { uploadDate: { lt: TRANSFER_CUTOFF } },
    },
    select: { id: true },
  });
  const r1 = await prisma.brokerageDetail.updateMany({
    where: { id: { in: akshitaDRowIds.map(r => r.id) } },
    data: { operatorId: AKSHITA_D_ID },
  });
  console.log(`  ${r1.count} rows reverted → akshita(D)`);

  const shwetaRowIds = await prisma.brokerageDetail.findMany({
    where: {
      clientId: { in: FROM_SHWETA_CLIENT_IDS },
      operatorId: AKSHITA_ID,
      brokerage: { uploadDate: { lt: TRANSFER_CUTOFF } },
    },
    select: { id: true },
  });
  const r2 = await prisma.brokerageDetail.updateMany({
    where: { id: { in: shwetaRowIds.map(r => r.id) } },
    data: { operatorId: SHWETA_ID },
  });
  console.log(`  ${r2.count} rows reverted → Shweta`);

  console.log(`\nDone. Total: ${r1.count + r2.count} rows restored to original snapshot operators.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

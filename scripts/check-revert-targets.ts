/**
 * check-revert-targets.ts
 *
 * Diagnostic for the revert script: shows per-client row counts under Akshita
 * for the 51 supposedly-from-akshita(D) clientIds. Identifies any client
 * with row count != the expected backfill count.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AKSHITA_ID = 'cmm0ab43b0008jbzox3n91zqj';

const FROM_AKSHITA_D_CLIENT_IDS = [
  'cmn940g82016uneofbi9ktawo','cmn940lsj01gqneofnvm6mudr','cmn940m3201h8neof6vy3e7ma',
  'cmn93zukt004sneofo5g5g455','cmnmuzxgk0001jl04ubrkltp7','cmn940lp401gkneofth5eg7yr',
  'cmn94055c00n8neofcni4q805','cmn9406d900p8neofhzu1ex7b','cmocdm0mj0001jp04bzj02ig7',
  'cmn940m1y01h6neoff7kh35i3','cmn940cpq010mneofd1h8wkb3','cmn94001900eaneofg9zi3ea8',
  'cmn940be900y8neofd6j6qnrt','cmn93zwsl008sneofjste7ds0','cmn93zsem000sneofjh8nj26x',
  'cmn940hed018yneof295gq4ez','cmn93ztjh002wneof8svx5ard','cmn9402vu00j6neofnvtvjirl',
  'cmn9402ln00ioneofrtv8kfho','cmn9407x400s2neofrbfg89zu','cmn940aj800woneofuhmwv54o',
  'cmn9409fd00uoneofpmqxgech','cmn940czg0114neofmaxavixe','cmn9406jn00pkneof8qy1m5sv',
  'cmn9404m500maneofzvx3zsx8','cmn93zt8o002cneof06umhchd','cmn940er7014aneof8chv9bcx',
  'cmn93zxca009sneof7j757ur1','cmn93ztti003eneofzj2mdljx','cmn9404hl00m2neofs8j6jchi',
  'cmn9400bw00esneofq57xcrqv','cmn93ztsg003cneofk4bk4yug','cmn93ztuk003gneofubrpkfuf',
  'cmn94095h00u6neofceb5yu0j','cmn93ztqc0038neofgj9e7bnd','cmn93zup50050neofl5xk6mpk',
  'cmn93zt270020neofhkd7vx30','cmn9400zc00funeofz5geqelj','cmn93zubm004cneof385tp83d',
  'cmn93zym100c2neofq4fd7yve','cmn93zyo700c6neofgj75tph6','cmn93zuhy004oneofdrwd7ziq',
  'cmn93zsl40014neofaxxexjcf','cmn940coo010kneof2pjxnrn7','cmn940cxa0110neofpsod8dba',
  'cmn940d0i0116neofs85cnr10','cmn94008600emneof17lq4s9l','cmn93zxdm009uneofj2z90yzj',
  'cmn93zt5g0026neofwwhsp26s','cmn93ztmx0032neof1oe0na16','cmn940clg010eneofptwizq7f',
];

// Expected row counts per the original dry-run output
const EXPECTED_BACKFILL_ROWS: Record<string, number> = {
  'cmn940g82016uneofbi9ktawo': 23,
  'cmn940lsj01gqneofnvm6mudr': 20,
  'cmn940m3201h8neof6vy3e7ma': 1,
  'cmn93zukt004sneofo5g5g455': 8,
  'cmnmuzxgk0001jl04ubrkltp7': 17,
  'cmn940lp401gkneofth5eg7yr': 5,
  'cmn94055c00n8neofcni4q805': 3,
  'cmn9406d900p8neofhzu1ex7b': 4,
  'cmocdm0mj0001jp04bzj02ig7': 1,
  'cmn940m1y01h6neoff7kh35i3': 2,
  'cmn940cpq010mneofd1h8wkb3': 5,
  'cmn94001900eaneofg9zi3ea8': 3,
  'cmn940be900y8neofd6j6qnrt': 6,
  'cmn93zwsl008sneofjste7ds0': 5,
  'cmn93zsem000sneofjh8nj26x': 5,
  'cmn940hed018yneof295gq4ez': 5,
  'cmn93ztjh002wneof8svx5ard': 5,
  'cmn9402vu00j6neofnvtvjirl': 1,
  'cmn9402ln00ioneofrtv8kfho': 8,
  'cmn9407x400s2neofrbfg89zu': 5,
  'cmn940aj800woneofuhmwv54o': 2,
  'cmn9409fd00uoneofpmqxgech': 5,
  'cmn940czg0114neofmaxavixe': 6,
  'cmn9406jn00pkneof8qy1m5sv': 3,
  'cmn9404m500maneofzvx3zsx8': 1,
  'cmn93zt8o002cneof06umhchd': 1,
  'cmn940er7014aneof8chv9bcx': 6,
  'cmn93zxca009sneof7j757ur1': 1,
  'cmn93ztti003eneofzj2mdljx': 2,
  'cmn9404hl00m2neofs8j6jchi': 2,
  'cmn9400bw00esneofq57xcrqv': 1,
  'cmn93ztsg003cneofk4bk4yug': 2,
  'cmn93ztuk003gneofubrpkfuf': 3,
  'cmn94095h00u6neofceb5yu0j': 3,
  'cmn93ztqc0038neofgj9e7bnd': 1,
  'cmn93zup50050neofl5xk6mpk': 1,
  'cmn93zt270020neofhkd7vx30': 5,
  'cmn9400zc00funeofz5geqelj': 1,
  'cmn93zubm004cneof385tp83d': 1,
  'cmn93zym100c2neofq4fd7yve': 4,
  'cmn93zyo700c6neofgj75tph6': 1,
  'cmn93zuhy004oneofdrwd7ziq': 1,
  'cmn93zsl40014neofaxxexjcf': 1,
  'cmn940coo010kneof2pjxnrn7': 1,
  'cmn940cxa0110neofpsod8dba': 1,
  'cmn940d0i0116neofs85cnr10': 1,
  'cmn94008600emneof17lq4s9l': 1,
  'cmn93zxdm009uneofj2z90yzj': 1,
  'cmn93zt5g0026neofwwhsp26s': 1,
  'cmn93ztmx0032neof1oe0na16': 1,
  'cmn940clg010eneofptwizq7f': 1,
};

async function main() {
  console.log(`List size (declared): ${FROM_AKSHITA_D_CLIENT_IDS.length}`);
  console.log(`Unique entries:       ${new Set(FROM_AKSHITA_D_CLIENT_IDS).size}\n`);

  const expectedTotal = Object.values(EXPECTED_BACKFILL_ROWS).reduce((a, b) => a + b, 0);
  console.log(`Expected total rows from backfill summary: ${expectedTotal}\n`);

  // Per-client current row counts under Akshita
  const grouped = await prisma.brokerageDetail.groupBy({
    by: ['clientId'],
    where: { clientId: { in: FROM_AKSHITA_D_CLIENT_IDS }, operatorId: AKSHITA_ID },
    _count: { _all: true },
    _sum: { amount: true },
  });

  console.log('Per-client current row counts under Akshita:');
  console.log('─'.repeat(80));
  let totalRows = 0;
  const mismatches: Array<{ clientId: string; expected: number; actual: number }> = [];
  for (const g of grouped) {
    const expected = EXPECTED_BACKFILL_ROWS[g.clientId!] ?? 0;
    const actual = g._count._all;
    const flag = actual === expected ? '  ' : '⚠ ';
    if (actual !== expected) mismatches.push({ clientId: g.clientId!, expected, actual });
    totalRows += actual;
    console.log(`  ${flag}${g.clientId}  expected=${String(expected).padStart(3)}  actual=${String(actual).padStart(3)}  ₹${(g._sum.amount ?? 0).toFixed(2)}`);
  }
  console.log('─'.repeat(80));
  console.log(`Total: ${totalRows} (vs expected ${expectedTotal})\n`);

  if (mismatches.length > 0) {
    console.log('Mismatches detail — fetching brokerage upload dates for the extra rows:');
    for (const m of mismatches) {
      const rows = await prisma.brokerageDetail.findMany({
        where: { clientId: m.clientId, operatorId: AKSHITA_ID },
        select: { id: true, amount: true, brokerage: { select: { uploadDate: true, branch: true } } },
        orderBy: { brokerage: { uploadDate: 'asc' } },
      });
      console.log(`\n  client ${m.clientId}  (expected ${m.expected}, actual ${m.actual}):`);
      for (const r of rows) {
        console.log(`    ${r.brokerage.uploadDate.toISOString().slice(0, 10)}  ${r.brokerage.branch.padEnd(8)}  ₹${r.amount.toFixed(2)}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

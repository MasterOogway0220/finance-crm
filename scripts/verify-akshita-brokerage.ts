/**
 * verify-akshita-brokerage.ts
 *
 * Read-only. Replicates the queries that Akshita's brokerage panel makes
 * (the same ones served by /api/brokerage, /api/brokerage/client-wise, and
 * /api/dashboard/equity) and reports the numbers, so we can confirm the
 * backfill is reflected in what she'd actually see.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/verify-akshita-brokerage.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Resolve Akshita's employee record
  const akshita = await prisma.employee.findFirst({
    where: { name: 'Akshita', isActive: true },
    select: { id: true, name: true, role: true, secondaryRole: true },
  });
  if (!akshita) {
    console.error('Could not find an active employee named "Akshita"');
    process.exit(1);
  }

  console.log(`Akshita resolved: ${akshita.id}  role=${akshita.role}${akshita.secondaryRole ? `+${akshita.secondaryRole}` : ''}\n`);

  // ─── Replica of /api/brokerage operatorPerformance row for Akshita ─────────
  // (filters details by BrokerageDetail.operatorId = akshita.id)
  const allDetailsForAkshita = await prisma.brokerageDetail.findMany({
    where: {
      operatorId: akshita.id,
      clientId: { not: null },
      brokerage: { isActive: true },
    },
    select: {
      amount: true,
      clientId: true,
      brokerage: { select: { uploadDate: true } },
    },
  });

  // Per-month aggregation
  const perMonth = new Map<string, { count: number; sum: number; clients: Set<string> }>();
  let total = 0;
  const uniqueClients = new Set<string>();
  for (const d of allDetailsForAkshita) {
    const label = new Date(d.brokerage.uploadDate).toLocaleString('default', { month: 'short', year: '2-digit' });
    const bucket = perMonth.get(label) ?? { count: 0, sum: 0, clients: new Set<string>() };
    bucket.count++;
    bucket.sum += d.amount;
    if (d.clientId) bucket.clients.add(d.clientId);
    perMonth.set(label, bucket);
    total += d.amount;
    if (d.clientId) uniqueClients.add(d.clientId);
  }

  console.log('── Brokerage history attributed to Akshita ──');
  console.log('(replicates the filter used by /api/brokerage and /api/brokerage/client-wise)');
  console.log('─'.repeat(75));
  console.log(`Total rows:           ${allDetailsForAkshita.length}`);
  console.log(`Total amount:         ₹${total.toFixed(2)}`);
  console.log(`Distinct clients:     ${uniqueClients.size}`);
  console.log();
  console.log('Per-month breakdown:');
  const sortedMonths = [...perMonth.entries()].sort(([a], [b]) => {
    const da = new Date(`1 ${a}`); const db = new Date(`1 ${b}`);
    return da.getTime() - db.getTime();
  });
  for (const [label, bucket] of sortedMonths) {
    console.log(`  ${label.padEnd(10)}  ${String(bucket.count).padStart(4)} rows  ₹${bucket.sum.toFixed(2).padStart(12)}  (${bucket.clients.size} clients)`);
  }

  // ─── Sample some of the transferred clients to spot-check ────────────────
  const sampleClientCodes = ['18A325', '18R195', '11R194', '18H045']; // top transfers + Shweta's
  console.log('\n── Spot-check: brokerage for transferred clients ──');
  console.log('─'.repeat(75));
  for (const code of sampleClientCodes) {
    const client = await prisma.client.findFirst({
      where: { clientCode: code, department: 'EQUITY' },
      select: { id: true, firstName: true, lastName: true, operatorId: true, operator: { select: { name: true } } },
    });
    if (!client) {
      console.log(`  ${code}: NOT FOUND`);
      continue;
    }
    const rows = await prisma.brokerageDetail.findMany({
      where: { clientId: client.id, brokerage: { isActive: true } },
      select: { amount: true, operatorId: true },
    });
    const distinctOps = new Set(rows.map((r) => r.operatorId));
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    const ownerOk = client.operatorId === akshita.id;
    const opsOk = distinctOps.size === 1 && distinctOps.has(akshita.id);
    console.log(
      `  ${code.padEnd(7)} ${`${client.firstName} ${client.lastName}`.padEnd(30)}  ` +
      `current=${client.operator.name.padEnd(10)} ${ownerOk ? '✓' : '✗'}  ` +
      `rows=${String(rows.length).padStart(3)}  total=₹${sum.toFixed(2).padStart(11)}  ` +
      `details-attrib=${opsOk ? '✓ Akshita' : `MIXED (${[...distinctOps].join(', ')})`}`
    );
  }

  // ─── What's left under akshita(D)? Should be zero for clients she still owns ───
  const akshitaD = await prisma.employee.findFirst({
    where: { name: 'akshita(D)' },
    select: { id: true, name: true, isActive: true },
  });
  if (akshitaD) {
    const leftovers = await prisma.brokerageDetail.count({
      where: { operatorId: akshitaD.id, clientId: { not: null } },
    });
    console.log(`\nResidual brokerage rows still attributed to ${akshitaD.name}: ${leftovers}`);
    if (leftovers > 0) {
      // any orphan rows (client deleted) under akshita(D)?
      const orphans = await prisma.brokerageDetail.count({
        where: { operatorId: akshitaD.id, clientId: null },
      });
      console.log(`  (${orphans} of those are orphan rows with clientId = null; expected unchanged)`);
    } else {
      const orphans = await prisma.brokerageDetail.count({
        where: { operatorId: akshitaD.id, clientId: null },
      });
      console.log(`  Orphan (clientId=null) rows under akshita(D): ${orphans}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

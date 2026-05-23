/**
 * diagnose-brokerage-attribution.ts
 *
 * Read-only diagnostic. Surfaces every way BrokerageDetail.operatorId can
 * be out of sync with the current world, so we can decide what (if anything)
 * needs cleanup.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/diagnose-brokerage-attribution.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('═'.repeat(80));
  console.log('Brokerage attribution diagnostic');
  console.log('═'.repeat(80));

  // 1. All distinct operatorIds referenced by BrokerageDetail
  const distinct = await prisma.brokerageDetail.groupBy({
    by: ['operatorId'],
    _count: { _all: true },
    _sum: { amount: true },
  });

  const allEmployees = await prisma.employee.findMany({
    select: { id: true, name: true, isActive: true, role: true, secondaryRole: true },
  });
  const empById = new Map(allEmployees.map((e) => [e.id, e]));

  console.log('\n── Section 1: every operatorId appearing in BrokerageDetail ──');
  console.log('(row count, total amount, employee record status)');
  console.log('─'.repeat(80));

  for (const g of distinct.sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))) {
    const emp = empById.get(g.operatorId);
    const status = !emp
      ? 'ORPHAN (no Employee record)'
      : !emp.isActive
        ? `inactive (${emp.name}, ${emp.role}${emp.secondaryRole ? `+${emp.secondaryRole}` : ''})`
        : `active   (${emp.name}, ${emp.role}${emp.secondaryRole ? `+${emp.secondaryRole}` : ''})`;
    console.log(
      `  ${g.operatorId.padEnd(28)}  ${String(g._count._all).padStart(6)} rows  ` +
      `₹${(g._sum.amount ?? 0).toFixed(2).padStart(14)}  ${status}`,
    );
  }

  // 2. BrokerageDetail rows where clientId is null (orphaned from client deletion)
  const orphanedDetails = await prisma.brokerageDetail.count({ where: { clientId: null } });
  const orphanedDetailsByOp = await prisma.brokerageDetail.groupBy({
    by: ['operatorId'],
    where: { clientId: null },
    _count: { _all: true },
  });
  console.log('\n── Section 2: BrokerageDetail rows with clientId = NULL ──');
  console.log('(client was deleted; brokerage history preserved but unlinked)');
  console.log('─'.repeat(80));
  console.log(`Total orphaned rows: ${orphanedDetails}`);
  if (orphanedDetails > 0) {
    for (const g of orphanedDetailsByOp) {
      const emp = empById.get(g.operatorId);
      console.log(`  ${(emp?.name ?? `<missing:${g.operatorId}>`).padEnd(35)}  ${g._count._all} rows`);
    }
  }

  // 3. Clients whose current operatorId does not match any BrokerageDetail.operatorId for them
  //    (i.e. this client has been transferred since their brokerage was recorded)
  const details = await prisma.brokerageDetail.findMany({
    where: { clientId: { not: null } },
    select: { operatorId: true, clientId: true, client: { select: { operatorId: true, firstName: true, lastName: true, clientCode: true } } },
  });
  const transferredClients = new Map<string, { code: string; name: string; from: Set<string>; to: string; rows: number }>();
  for (const d of details) {
    if (!d.client) continue;
    if (d.operatorId === d.client.operatorId) continue;
    const c = transferredClients.get(d.clientId!) ?? {
      code: d.client.clientCode,
      name: `${d.client.firstName} ${d.client.lastName}`.trim(),
      from: new Set<string>(),
      to: d.client.operatorId,
      rows: 0,
    };
    c.from.add(d.operatorId);
    c.rows++;
    transferredClients.set(d.clientId!, c);
  }
  console.log('\n── Section 3: transferred clients (BrokerageDetail.operatorId ≠ Client.operatorId) ──');
  console.log('─'.repeat(80));
  console.log(`Total clients affected: ${transferredClients.size}`);
  if (transferredClients.size > 0) {
    console.log('Per-client breakdown:');
    for (const [, c] of transferredClients) {
      const toName = empById.get(c.to)?.name ?? `<missing:${c.to}>`;
      const fromNames = [...c.from].map((id) => empById.get(id)?.name ?? `<missing:${id}>`).join(', ');
      console.log(`  ${c.code.padEnd(15)} ${c.name.padEnd(35)}  ${fromNames} → ${toName}  (${c.rows} rows)`);
    }
  }

  // 4. Deactivated employees who still appear in BrokerageDetail (regardless of divergence)
  const inactiveOperatorIds = allEmployees.filter((e) => !e.isActive).map((e) => e.id);
  if (inactiveOperatorIds.length > 0) {
    const inactiveDetails = await prisma.brokerageDetail.groupBy({
      by: ['operatorId'],
      where: { operatorId: { in: inactiveOperatorIds } },
      _count: { _all: true },
      _sum: { amount: true },
    });
    console.log('\n── Section 4: inactive employees with brokerage records ──');
    console.log('─'.repeat(80));
    if (inactiveDetails.length === 0) {
      console.log('  (none)');
    }
    for (const g of inactiveDetails) {
      const emp = empById.get(g.operatorId)!;
      console.log(`  ${emp.name.padEnd(35)}  ${g._count._all} rows  ₹${(g._sum.amount ?? 0).toFixed(2)}`);
    }
  }

  console.log('\nDiagnostic complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

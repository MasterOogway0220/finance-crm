/**
 * backfill-brokerage-operator.ts
 *
 * One-off backfill: re-syncs BrokerageDetail.operatorId to Client.operatorId
 * for every detail row where the two diverge.
 *
 * Why this exists:
 *   Before a fix landed, transferring a client (Client.operatorId A → B) did
 *   NOT update the snapshotted BrokerageDetail.operatorId. As a result, the
 *   new owner's brokerage views (which filter by BrokerageDetail.operatorId)
 *   hid the client's historical brokerage. This script repoints those rows
 *   to the client's current operator so the history follows the client.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/backfill-brokerage-operator.ts --dry-run
 *   npx ts-node --project tsconfig.scripts.json scripts/backfill-brokerage-operator.ts
 *
 * Flags:
 *   --dry-run   Report what would change, but DO NOT write to DB.
 *
 * Scope:
 *   - Only touches BrokerageDetail rows where clientId IS NOT NULL.
 *   - Orphaned rows (clientId = null, e.g. from deleted clients) are left
 *     alone — they have no current client to derive an operator from.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CliArgs {
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  return { dryRun: argv.includes('--dry-run') };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE (will update DB)'}`);
  console.log('Scanning BrokerageDetail rows where operatorId diverges from Client.operatorId…\n');

  // Pull every detail row with a linked client + its client's current operatorId
  const details = await prisma.brokerageDetail.findMany({
    where: { clientId: { not: null } },
    select: {
      id: true,
      operatorId: true,
      clientId: true,
      client: { select: { operatorId: true } },
    },
  });

  const diverged = details.filter(
    (d) => d.client && d.client.operatorId !== d.operatorId
  );

  console.log(`Total detail rows with linked client: ${details.length}`);
  console.log(`Rows where BrokerageDetail.operatorId ≠ Client.operatorId: ${diverged.length}\n`);

  if (diverged.length === 0) {
    console.log('Nothing to backfill. Exiting.');
    return;
  }

  // Group: per (clientId, fromOperator → toOperator) for a readable report
  type GroupKey = string;
  const groups = new Map<GroupKey, { clientId: string; from: string; to: string; count: number }>();
  for (const d of diverged) {
    const key = `${d.clientId}|${d.operatorId}|${d.client!.operatorId}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
    } else {
      groups.set(key, {
        clientId: d.clientId!,
        from: d.operatorId,
        to: d.client!.operatorId,
        count: 1,
      });
    }
  }

  // Resolve operator names for readability
  const opIds = new Set<string>();
  for (const g of groups.values()) {
    opIds.add(g.from);
    opIds.add(g.to);
  }
  const ops = await prisma.employee.findMany({
    where: { id: { in: [...opIds] } },
    select: { id: true, name: true },
  });
  const opName = new Map(ops.map((o) => [o.id, o.name]));

  console.log('Per-client transfer summary:');
  console.log('─'.repeat(90));
  let totalRows = 0;
  for (const g of groups.values()) {
    const from = opName.get(g.from) ?? `<missing:${g.from}>`;
    const to = opName.get(g.to) ?? `<missing:${g.to}>`;
    console.log(`  client ${g.clientId.padEnd(28)}  ${from.padEnd(25)} → ${to.padEnd(25)}  ${g.count} rows`);
    totalRows += g.count;
  }
  console.log('─'.repeat(90));
  console.log(`Total rows to update: ${totalRows}\n`);

  if (dryRun) {
    console.log('DRY-RUN complete. Re-run without --dry-run to apply.');
    return;
  }

  // Apply: batch updates per (toOperatorId, clientIds[]) for efficiency.
  // All detail rows for a given clientId converge to the same new operatorId,
  // so we can group by destination operator and update by clientId IN (...).
  const byDestination = new Map<string, string[]>();
  for (const g of groups.values()) {
    const arr = byDestination.get(g.to) ?? [];
    arr.push(g.clientId);
    byDestination.set(g.to, arr);
  }

  let updated = 0;
  for (const [toOperator, clientIds] of byDestination.entries()) {
    const res = await prisma.brokerageDetail.updateMany({
      where: { clientId: { in: clientIds }, operatorId: { not: toOperator } },
      data: { operatorId: toOperator },
    });
    updated += res.count;
    console.log(`  → set operatorId = ${opName.get(toOperator) ?? toOperator} for ${clientIds.length} client(s): ${res.count} rows updated`);
  }

  console.log(`\nDone. ${updated} BrokerageDetail row(s) repointed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * check-client-transfer-logs.ts
 *
 * Read-only. Scans ActivityLog for any event suggesting a client transfer
 * (Client.operatorId change), so we can correlate against what the brokerage
 * diagnostic finds.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/check-client-transfer-logs.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.activityLog.findMany({
    where: {
      OR: [
        // Bulk client updates whose details mention operatorId
        { module: 'CLIENTS', action: 'BULK_UPDATE', details: { contains: 'operatorId' } },
        // Single-client updates whose details mention operator (per current PATCH log line, this
        // only shows status/remark — but we keep the filter open in case logs vary historically)
        { module: 'CLIENTS', action: 'UPDATE', details: { contains: 'operator' } },
        // Employee deletes with transferToId — logged at module=EMPLOYEES
        { module: 'EMPLOYEES', action: 'DELETE' },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, email: true } } },
  });

  console.log(`Found ${logs.length} candidate log entries\n`);
  console.log('─'.repeat(100));
  for (const l of logs) {
    const when = l.createdAt.toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[${when}]  ${l.module}/${l.action}  by ${l.user.name}`);
    console.log(`  ${l.details ?? '(no details)'}`);
    console.log('─'.repeat(100));
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

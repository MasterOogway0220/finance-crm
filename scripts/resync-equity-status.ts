/**
 * Recomputes Client.status for EQUITY clients from the active brokerage data — the
 * repair for flag drift (a client sitting at TRADED with no current-month rows, or
 * the reverse after a backfill).
 *
 * All EQUITY clients:      npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/resync-equity-status.ts
 * Specific client codes:   ...same... 18S479 18V212
 */
import { PrismaClient } from '@prisma/client'
import { resyncEquityClientStatus } from '../src/lib/brokerage-status'

const prisma = new PrismaClient()
const codes = process.argv.slice(2).map((c) => c.toUpperCase())

async function main() {
  const clients = await prisma.client.findMany({
    where: { department: 'EQUITY', ...(codes.length ? { clientCode: { in: codes } } : {}) },
    select: { id: true, clientCode: true, status: true },
    orderBy: { clientCode: 'asc' },
  })
  console.log(`Resyncing ${clients.length} EQUITY client(s)${codes.length ? ` (${codes.join(', ')})` : ' — all'}\n`)

  const before = new Map(clients.map((c) => [c.id, c.status]))
  const res = await resyncEquityClientStatus(prisma, clients.map((c) => c.id))

  const after = await prisma.client.findMany({
    where: { id: { in: clients.map((c) => c.id) } },
    select: { id: true, clientCode: true, status: true },
    orderBy: { clientCode: 'asc' },
  })
  for (const c of after) {
    const was = before.get(c.id)
    if (was !== c.status) console.log(`  ${c.clientCode.padEnd(10)} ${was} -> ${c.status}`)
  }
  console.log(`\nChanged: ${res.traded} -> TRADED, ${res.notTraded} -> NOT_TRADED`)
}

main()
  .catch((e) => { console.error('ERROR:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })

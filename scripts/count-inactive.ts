/**
 * READ-ONLY: counts inactive clients for the WhatsApp outreach feature.
 * No writes. Run:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/count-inactive.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** Normalize like src/lib/whatsapp.ts: digits only; valid if a real 10-digit Indian number (not placeholder). */
function messageablePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length !== 10) return null
  if (d === '0000000000') return null
  return d
}

async function main() {
  await prisma.$queryRaw`SELECT 1`
  console.log('✓ DB reachable\n')

  // --- Totals by department ---
  const total = await prisma.client.count()
  const equityTotal = await prisma.client.count({ where: { department: 'EQUITY' } })
  const mfTotal = await prisma.client.count({ where: { department: 'MUTUAL_FUND' } })

  // --- Status splits ---
  const equityNotTraded = await prisma.client.count({
    where: { department: 'EQUITY', status: 'NOT_TRADED' },
  })
  const equityTraded = await prisma.client.count({
    where: { department: 'EQUITY', status: 'TRADED' },
  })
  const mfInactive = await prisma.client.count({
    where: { department: 'MUTUAL_FUND', mfStatus: 'INACTIVE' },
  })
  const mfActive = await prisma.client.count({
    where: { department: 'MUTUAL_FUND', mfStatus: 'ACTIVE' },
  })

  console.log('=== CLIENT TOTALS ===')
  console.log(`Total client records:        ${total}`)
  console.log(`  Equity:                    ${equityTotal}  (NOT_TRADED ${equityNotTraded} / TRADED ${equityTraded})`)
  console.log(`  Mutual Fund:               ${mfTotal}  (INACTIVE ${mfInactive} / ACTIVE ${mfActive})`)
  console.log('')

  // --- Messageable audience: inactive equity + inactive MF, deduped by phone ---
  const inactiveEquity = await prisma.client.findMany({
    where: { department: 'EQUITY', status: 'NOT_TRADED' },
    select: { phone: true, firstName: true, lastName: true },
  })
  const inactiveMf = await prisma.client.findMany({
    where: { department: 'MUTUAL_FUND', mfStatus: 'INACTIVE' },
    select: { phone: true, firstName: true, lastName: true },
  })

  const inactiveRecords = [...inactiveEquity, ...inactiveMf]
  const validPhones = new Set<string>()
  let invalidOrPlaceholder = 0
  for (const r of inactiveRecords) {
    const p = messageablePhone(r.phone)
    if (p) validPhones.add(p)
    else invalidOrPlaceholder++
  }

  console.log('=== MESSAGEABLE INACTIVE AUDIENCE (Equity NOT_TRADED + MF INACTIVE) ===')
  console.log(`Inactive client records (both depts): ${inactiveRecords.length}`)
  console.log(`  ...with a missing/placeholder/invalid phone: ${invalidOrPlaceholder}`)
  console.log(`UNIQUE messageable phone numbers:     ${validPhones.size}   <-- real send count`)
  console.log('')

  // --- Secondary view: dormant 2+ months (equity, no brokerage since 1st of last month) ---
  const now = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1) // 1st of previous month
  const dormant2mEquity = await prisma.client.count({
    where: {
      department: 'EQUITY',
      NOT: {
        brokerageDetails: { some: { brokerage: { isActive: true, uploadDate: { gte: cutoff } } } },
      },
    },
  })
  console.log('=== FOR REFERENCE: dormant 2+ months ===')
  console.log(`Equity clients with NO brokerage since ${cutoff.toISOString().slice(0, 10)}: ${dormant2mEquity}`)
  console.log('')
}

main()
  .catch((e) => {
    console.error('ERROR:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

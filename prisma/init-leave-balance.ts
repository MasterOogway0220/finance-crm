import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ANNUAL_LEAVE_DAYS = 30

async function main() {
  const year = new Date().getFullYear()
  console.log(`Initialising ${ANNUAL_LEAVE_DAYS} leave days for all active employees for ${year}...`)

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  })

  let upserted = 0
  for (const emp of employees) {
    await prisma.leaveBalance.upsert({
      where: { employeeId_year: { employeeId: emp.id, year } },
      update: { totalLeaves: ANNUAL_LEAVE_DAYS },
      create: { employeeId: emp.id, year, totalLeaves: ANNUAL_LEAVE_DAYS },
    })
    console.log(`  ✓ ${emp.name}`)
    upserted++
  }

  console.log(`\n✅ ${upserted} employee(s) set to ${ANNUAL_LEAVE_DAYS} leaves for ${year}.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })

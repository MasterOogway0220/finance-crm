import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Clearing all leave data...')

  const apps = await prisma.leaveApplication.deleteMany({})
  console.log(`Deleted ${apps.count} leave applications`)

  const balances = await prisma.leaveBalance.deleteMany({})
  console.log(`Deleted ${balances.count} leave balance records`)

  // Clear leave-related notifications
  const notifications = await prisma.notification.deleteMany({
    where: {
      type: { in: ['LEAVE_APPLIED', 'LEAVE_APPROVED', 'LEAVE_REJECTED'] },
    },
  })
  console.log(`Deleted ${notifications.count} leave notifications`)

  console.log('✅ All leave data cleared successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

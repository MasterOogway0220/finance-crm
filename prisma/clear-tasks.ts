import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Clearing task-related data...')

  // Delete in dependency order
  const proofs = await prisma.taskCompletionProof.deleteMany({})
  console.log(`Deleted ${proofs.count} task completion proofs`)

  const comments = await prisma.taskComment.deleteMany({})
  console.log(`Deleted ${comments.count} task comments`)

  const tasks = await prisma.task.deleteMany({})
  console.log(`Deleted ${tasks.count} tasks`)

  // Clear task-related notifications
  const notifications = await prisma.notification.deleteMany({
    where: {
      type: {
        in: ['TASK_ASSIGNED', 'TASK_COMPLETED', 'TASK_EDITED'],
      },
    },
  })
  console.log(`Deleted ${notifications.count} task notifications`)

  console.log('✅ All tasks and related data cleared successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

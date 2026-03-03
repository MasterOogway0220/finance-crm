import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasourceUrl: process.env.DATABASE_URL,
  })

// Cache the client in both dev and production to prevent connection exhaustion
// In serverless environments, each cold start creates a new client without this
if (!globalForPrisma.prisma) globalForPrisma.prisma = prisma

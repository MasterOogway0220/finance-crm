import { PrismaClient } from '@prisma/client'
import { withServerlessPool } from '@/lib/db-url'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Cap the pool to one connection per instance. The shared MySQL host allows only
// 75 connections per user across Vercel + local dev + the worker, so a high
// connection_limit lets warm serverless instances exhaust it — surfacing as a
// generic CredentialsSignin on login. See withServerlessPool for the full note.
const datasourceUrl = withServerlessPool(process.env.DATABASE_URL)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasourceUrl,
  })

// Cache the client in both dev and production to prevent connection exhaustion
// In serverless environments, each cold start creates a new client without this
if (!globalForPrisma.prisma) globalForPrisma.prisma = prisma

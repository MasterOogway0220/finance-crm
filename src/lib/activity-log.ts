import { prisma } from '@/lib/prisma'

export async function logActivity(params: {
  userId: string
  action: string
  module: string
  details?: string
  ipAddress?: string
}) {
  return prisma.activityLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      module: params.module,
      details: params.details,
      ipAddress: params.ipAddress,
    },
  })
}

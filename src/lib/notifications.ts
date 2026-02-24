import { prisma } from '@/lib/prisma'

export async function createNotification(params: {
  userId: string
  type: string
  title: string
  message: string
  link?: string
}) {
  return prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
    },
  })
}

export async function createNotificationForMany(params: {
  userIds: string[]
  type: string
  title: string
  message: string
  link?: string
}) {
  return prisma.notification.createMany({
    data: params.userIds.map((userId) => ({
      userId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
    })),
  })
}

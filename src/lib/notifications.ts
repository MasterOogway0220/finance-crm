import { prisma } from '@/lib/prisma'
import { notifyEmployeeWhatsApp } from '@/lib/whatsapp'
import { Department } from '@prisma/client'

export function tasksLinkForDepartment(department: Department): string {
  switch (department) {
    case 'EQUITY':
      return '/equity/tasks'
    case 'MUTUAL_FUND':
      return '/mf/tasks'
    case 'BACK_OFFICE':
      return '/backoffice/tasks'
    case 'ADMIN':
      return '/tasks'
  }
}

export async function createNotification(params: {
  userId: string
  type: string
  title: string
  message: string
  link?: string
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
    },
  })

  // Fire-and-forget WhatsApp notification
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: params.userId },
      select: { phone: true },
    })
    if (employee?.phone) {
      notifyEmployeeWhatsApp(employee.phone, params.title, params.message)
    }
  } catch (error) {
    console.error('[WhatsApp] Failed to send notification:', error)
  }

  return notification
}

export async function createNotificationForMany(params: {
  userIds: string[]
  type: string
  title: string
  message: string
  link?: string
}) {
  const result = await prisma.notification.createMany({
    data: params.userIds.map((userId) => ({
      userId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
    })),
  })

  // Fire-and-forget WhatsApp notifications to all recipients
  try {
    const employees = await prisma.employee.findMany({
      where: { id: { in: params.userIds } },
      select: { phone: true },
    })
    for (const emp of employees) {
      if (emp.phone) {
        notifyEmployeeWhatsApp(emp.phone, params.title, params.message)
      }
    }
  } catch (error) {
    console.error('[WhatsApp] Failed to send bulk notifications:', error)
  }

  return result
}

import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { createNotification } from '@/lib/notifications'
import { taskSchema } from '@/lib/validations'
import { Department, Role, TaskPriority, TaskStatus } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '25'))
    const skip = (page - 1) * limit

    const assignedToId = searchParams.get('assignedToId')
    const assignedById = searchParams.get('assignedById')
    const status = searchParams.get('status') as TaskStatus | null
    const priority = searchParams.get('priority') as TaskPriority | null
    const department = searchParams.get('department') as Department | null
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const userRole = getEffectiveRole(session.user)

    const where: Record<string, unknown> = {}

    // Auto-expire overdue PENDING tasks before listing
    await prisma.task.updateMany({
      where: {
        status: 'PENDING',
        deadline: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    })

    const assignedByMe = searchParams.get('assignedByMe') === 'true'
    const assignedToMe = searchParams.get('assignedToMe') === 'true'

    // BACK_OFFICE can only see tasks assigned to themselves
    if (userRole === 'BACK_OFFICE') {
      where.assignedToId = session.user.id
    } else if (assignedByMe) {
      where.assignedById = session.user.id
    } else if (assignedToMe) {
      where.assignedToId = session.user.id
    } else {
      if (assignedToId) where.assignedToId = assignedToId
      if (assignedById) where.assignedById = assignedById
    }

    if (status) where.status = status
    if (priority) where.priority = priority

    if (department) {
      where.assignedTo = { department }
    }

    if (dateFrom || dateTo) {
      where.deadline = {}
      if (dateFrom) (where.deadline as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.deadline as Record<string, unknown>).lte = new Date(dateTo)
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true, department: true } },
          assignedBy: { select: { id: true, name: true, department: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.task.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        tasks,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    })
  } catch (error) {
    console.error('[GET /api/tasks]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = getEffectiveRole(session.user)

    // BACK_OFFICE employees cannot assign tasks
    if (userRole === 'BACK_OFFICE') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = taskSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const data = parsed.data

    const assignee = await prisma.employee.findUnique({
      where: { id: data.assignedToId },
      select: { id: true, name: true, isActive: true, department: true },
    })

    if (!assignee || !assignee.isActive) {
      return NextResponse.json({ success: false, error: 'Assignee not found or inactive' }, { status: 404 })
    }

    // EQUITY_DEALER and MF_DEALER can only assign tasks to Back Office employees
    if (userRole === 'EQUITY_DEALER' || userRole === 'MF_DEALER') {
      if (assignee.department !== 'BACK_OFFICE') {
        return NextResponse.json(
          { success: false, error: 'You can only assign tasks to Back Office employees' },
          { status: 403 }
        )
      }
    }

    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        assignedToId: data.assignedToId,
        assignedById: session.user.id,
        deadline: data.deadline,
        priority: data.priority as TaskPriority,
      },
      include: {
        assignedTo: { select: { id: true, name: true, department: true } },
        assignedBy: { select: { id: true, name: true, department: true } },
      },
    })

    // Notify assignee
    await createNotification({
      userId: data.assignedToId,
      type: 'TASK_ASSIGNED',
      title: 'New task assigned',
      message: `New task assigned: ${data.title}`,
      link: `/tasks/${task.id}`,
    })

    await logActivity({
      userId: session.user.id,
      action: 'CREATE',
      module: 'TASKS',
      details: `Created task: "${task.title}" assigned to ${assignee.name}`,
    })

    return NextResponse.json({ success: true, data: task }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/tasks]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

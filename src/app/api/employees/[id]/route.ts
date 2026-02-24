import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const updateEmployeeSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  phone: z.string().length(10, 'Phone must be 10 digits').regex(/^\d{10}$/).optional(),
  designation: z.string().min(1, 'Designation is required').optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EQUITY_DEALER', 'MF_DEALER', 'BACK_OFFICE']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        department: true,
        designation: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!employee) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: employee })
  } catch (error) {
    console.error('[GET /api/employees/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = session.user.role as Role
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = updateEmployeeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const existing = await prisma.employee.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 })
    }

    const { password, ...rest } = parsed.data
    const updateData: Record<string, unknown> = { ...rest }

    if (password) {
      updateData.password = await bcrypt.hash(password, 12)
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        department: true,
        designation: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    })

    await logActivity({
      userId: session.user.id,
      action: 'UPDATE',
      module: 'EMPLOYEES',
      details: `Updated employee: ${employee.name} (${employee.id})`,
    })

    return NextResponse.json({ success: true, data: employee })
  } catch (error) {
    console.error('[PATCH /api/employees/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = session.user.role as Role
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    if (id === session.user.id) {
      return NextResponse.json({ success: false, error: 'You cannot delete your own account' }, { status: 400 })
    }

    const existing = await prisma.employee.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assignedClients: true,
            tasksReceived: true,
            tasksAssigned: true,
            brokerageUploads: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 })
    }

    const { _count } = existing
    if (_count.assignedClients > 0 || _count.tasksReceived > 0 || _count.tasksAssigned > 0 || _count.brokerageUploads > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete employee with assigned clients, tasks, or brokerage data. Deactivate them instead.' },
        { status: 400 }
      )
    }

    await prisma.employee.delete({ where: { id } })

    await logActivity({
      userId: session.user.id,
      action: 'DELETE',
      module: 'EMPLOYEES',
      details: `Deleted employee: ${existing.name} (${existing.email})`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/employees/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { employeeSchema } from '@/lib/validations'
import { Department, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const createEmployeeSchema = employeeSchema.extend({
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const department = searchParams.get('department') as Department | null
    const role = searchParams.get('role') as Role | null
    const search = searchParams.get('search')
    const isActive = searchParams.get('isActive')

    const where: Record<string, unknown> = {}

    if (department) where.department = department
    if (role) where.role = role
    if (isActive !== null && isActive !== '') {
      where.isActive = isActive === 'true'
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    const employees = await prisma.employee.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, data: employees })
  } catch (error) {
    console.error('[GET /api/employees]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = session.user.role as Role
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createEmployeeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const data = parsed.data

    const existing = await prisma.employee.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ success: false, error: 'Employee with this email already exists' }, { status: 409 })
    }

    const hashedPassword = await bcrypt.hash(data.password, 12)

    const employee = await prisma.employee.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        department: data.department as Department,
        designation: data.designation,
        role: data.role as Role,
        password: hashedPassword,
        isActive: data.isActive ?? true,
      },
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
      },
    })

    await logActivity({
      userId: session.user.id,
      action: 'CREATE',
      module: 'EMPLOYEES',
      details: `Created employee: ${employee.name} (${employee.email})`,
    })

    return NextResponse.json({ success: true, data: employee }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/employees]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

import { auth, getActiveRole } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/recurring-tasks — monthly assignment templates.
// Admins see all; everyone else sees the ones they created.
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = await getActiveRole(session.user)
    const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'

    const recurring = await prisma.recurringTask.findMany({
      where: isAdmin ? {} : { assignedById: session.user.id },
      include: {
        assignedTo: { select: { id: true, name: true, department: true } },
        assignedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, data: recurring })
  } catch (error) {
    console.error('[GET /api/recurring-tasks]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

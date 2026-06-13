import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { canViewAdmin, isHrViewer } from '@/lib/roles'
import { getLeaveReport } from '@/lib/leave-report'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = (await getActiveRole(session.user))
    if (!canViewAdmin(userRole) && !isHrViewer(session.user.email)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const department = searchParams.get('department')
    const employeeId = searchParams.get('employeeId')
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    const leaveData = await getLeaveReport({ year, department, employeeId })

    return NextResponse.json({ success: true, data: leaveData })
  } catch (error) {
    console.error('[GET /api/reports/leave]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

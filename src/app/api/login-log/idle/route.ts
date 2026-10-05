import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { closeOpenLoginLogs } from '@/lib/login-log'

// POST /api/login-log/idle — called by the inactivity guard just before it signs
// the user out, so the log is marked as a system (idle) logout instead of Self.
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false }, { status: 401 })
    }
    await closeOpenLoginLogs(session.user.id, 'IDLE')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/login-log/idle]', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

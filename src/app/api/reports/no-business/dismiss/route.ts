import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEffectiveRole } from '@/lib/roles'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const role = getEffectiveRole(session.user)
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const clientId = (typeof body?.clientId === 'string' ? body.clientId : '').trim()
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'clientId is required' }, { status: 400 })
    }

    // Verify client exists and is an equity client
    const client = await prisma.client.findFirst({
      where: { id: clientId, department: 'EQUITY' },
      select: { id: true },
    })
    if (!client) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 })
    }

    const now = new Date()
    await prisma.noBusinessDismissal.upsert({
      where: { clientId },
      create: { clientId, dismissedById: session.user.id, dismissedAt: now },
      update: { dismissedById: session.user.id, dismissedAt: now },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/reports/no-business/dismiss]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

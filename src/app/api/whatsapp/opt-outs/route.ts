import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canSendWhatsapp } from '@/lib/roles'
import { logActivity } from '@/lib/activity-log'
import { normalizeWhatsappPhone } from '@/lib/whatsapp-outreach'
import { z } from 'zod'

const addSchema = z.object({ phone: z.string().min(1), reason: z.string().optional() })

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    const search = new URL(request.url).searchParams.get('search')
    const optOuts = await prisma.whatsappOptOut.findMany({
      where: search ? { OR: [{ phone: { contains: search } }, { reason: { contains: search } }] } : undefined,
      orderBy: { createdAt: 'desc' },
      select: { id: true, phone: true, source: true, reason: true, createdAt: true },
    })
    return NextResponse.json({ success: true, data: { optOuts } })
  } catch (error) {
    console.error('[GET /api/whatsapp/opt-outs]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    const parsed = addSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 })
    const phone = normalizeWhatsappPhone(parsed.data.phone)
    if (!phone) return NextResponse.json({ success: false, error: 'Invalid phone number' }, { status: 400 })
    const reason = parsed.data.reason?.trim() || null
    const row = await prisma.whatsappOptOut.upsert({
      where: { phone },
      update: { reason, source: 'MANUAL', createdById: session.user.id },
      create: { phone, reason, source: 'MANUAL', createdById: session.user.id },
      select: { id: true, phone: true, source: true, reason: true, createdAt: true },
    })
    await logActivity({ userId: session.user.id, action: 'CREATE', module: 'WHATSAPP', details: `Added ${phone} to Do-Not-Contact` })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/whatsapp/opt-outs]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

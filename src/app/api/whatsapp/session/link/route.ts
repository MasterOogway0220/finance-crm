import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canSendWhatsapp } from '@/lib/roles'
import { normalizeWhatsappPhone } from '@/lib/whatsapp-outreach'
import { z } from 'zod'

const linkSchema = z.object({ phone: z.string().min(1) })

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    const parsed = linkSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: 'A phone number is required' }, { status: 400 })
    const normalised = normalizeWhatsappPhone(parsed.data.phone)
    if (!normalised) return NextResponse.json({ success: false, error: 'Invalid phone number' }, { status: 400 })
    await prisma.whatsappSession.upsert({
      where: { id: 'default' },
      update: { requestedPhone: normalised, state: 'CONNECTING', qr: null, linkCode: null },
      create: { id: 'default', requestedPhone: normalised, state: 'CONNECTING' },
    })
    return NextResponse.json({ success: true, data: { requestedPhone: normalised } })
  } catch (error) {
    console.error('[POST /api/whatsapp/session/link]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

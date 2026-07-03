import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canSendWhatsapp } from '@/lib/roles'
import { logActivity } from '@/lib/activity-log'
import { z } from 'zod'

const templateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  body: z.string().min(1, 'Message body is required'),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    const templates = await prisma.whatsappTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, body: true, createdAt: true },
    })
    return NextResponse.json({ success: true, data: { templates } })
  } catch (error) {
    console.error('[GET /api/whatsapp/templates]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    const parsed = templateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 })
    }
    const template = await prisma.whatsappTemplate.create({
      data: { name: parsed.data.name, body: parsed.data.body, createdById: session.user.id },
      select: { id: true, name: true, body: true, createdAt: true },
    })
    await logActivity({ userId: session.user.id, action: 'CREATE', module: 'WHATSAPP', details: `Created WhatsApp template "${template.name}"` })
    return NextResponse.json({ success: true, data: template }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/whatsapp/templates]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

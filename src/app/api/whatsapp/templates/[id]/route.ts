import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canSendWhatsapp } from '@/lib/roles'
import { logActivity } from '@/lib/activity-log'
import { z } from 'zod'

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  body: z.string().min(1).optional(),
}).refine((d) => d.name !== undefined || d.body !== undefined, { message: 'Nothing to update' })

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 })
    }
    const template = await prisma.whatsappTemplate.update({
      where: { id },
      data: parsed.data,
      select: { id: true, name: true, body: true, createdAt: true },
    })
    await logActivity({ userId: session.user.id, action: 'UPDATE', module: 'WHATSAPP', details: `Updated WhatsApp template "${template.name}"` })
    return NextResponse.json({ success: true, data: template })
  } catch (error) {
    console.error('[PATCH /api/whatsapp/templates/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    await prisma.whatsappTemplate.delete({ where: { id } })
    await logActivity({ userId: session.user.id, action: 'DELETE', module: 'WHATSAPP', details: `Deleted WhatsApp template ${id}` })
    return NextResponse.json({ success: true, data: { id } })
  } catch (error) {
    console.error('[DELETE /api/whatsapp/templates/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

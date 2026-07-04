import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canSendWhatsapp } from '@/lib/roles'
import { logActivity } from '@/lib/activity-log'
import { Prisma } from '@prisma/client'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    const { id } = await params
    await prisma.whatsappOptOut.delete({ where: { id } })
    await logActivity({ userId: session.user.id, action: 'DELETE', module: 'WHATSAPP', details: `Removed ${id} from Do-Not-Contact` })
    return NextResponse.json({ success: true, data: { id } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    console.error('[DELETE /api/whatsapp/opt-outs/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

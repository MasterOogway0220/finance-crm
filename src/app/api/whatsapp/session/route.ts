import { auth, getActiveRole } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canSendWhatsapp } from '@/lib/roles'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    const row = await prisma.whatsappSession.findUnique({ where: { id: 'default' } })
    let groups: { id: string; title: string; canSend: boolean }[] = []
    if (row?.groupsJson) {
      try { groups = JSON.parse(row.groupsJson) } catch { groups = [] }
    }
    return NextResponse.json({
      success: true,
      data: {
        state: row?.state ?? 'DISCONNECTED',
        qr: row?.state === 'QR' ? row.qr : null,
        groups,
      },
    })
  } catch (error) {
    console.error('[GET /api/whatsapp/session]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

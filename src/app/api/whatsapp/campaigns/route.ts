import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/roles'
import { logActivity } from '@/lib/activity-log'
import { normalizeWhatsappPhone, personalizeMessage } from '@/lib/whatsapp-outreach'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'

const campaignSchema = z.object({
  clientIds: z.array(z.string()).min(1, 'Select at least one client'),
  message: z.string().min(1, 'Message cannot be empty'),
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const role = await getActiveRole(session.user)
    if (!isManager(role)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const parsed = campaignSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 })
    }
    const { clientIds, message } = parsed.data

    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, clientCode: true, firstName: true, middleName: true, lastName: true, phone: true },
    })

    const campaignId = randomUUID()
    const seen = new Set<string>()
    let skippedInvalid = 0
    let skippedDuplicate = 0
    const rows: Array<{
      campaignId: string; clientId: string; clientCode: string; clientName: string
      phone: string; body: string; createdById: string
    }> = []

    for (const c of clients) {
      const normalised = normalizeWhatsappPhone(c.phone)
      if (!normalised) { skippedInvalid++; continue }
      if (seen.has(normalised)) { skippedDuplicate++; continue }
      seen.add(normalised)
      const name = [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ')
      rows.push({
        campaignId,
        clientId: c.id,
        clientCode: c.clientCode,
        clientName: name,
        phone: c.phone,
        body: personalizeMessage(message, c.firstName),
        createdById: session.user.id,
      })
    }

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid recipients (all skipped as invalid or duplicate).' }, { status: 400 })
    }

    await prisma.whatsappMessage.createMany({ data: rows })
    await logActivity({
      userId: session.user.id,
      action: 'QUEUE',
      module: 'WHATSAPP',
      details: `Queued ${rows.length} WhatsApp messages (campaign ${campaignId}). Skipped ${skippedInvalid} invalid, ${skippedDuplicate} duplicate.`,
    })

    return NextResponse.json({ success: true, data: { campaignId, queued: rows.length, skippedInvalid, skippedDuplicate } })
  } catch (error) {
    console.error('[POST /api/whatsapp/campaigns]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const role = await getActiveRole(session.user)
    if (!isManager(role)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [sentToday, pendingTotal, grouped, createdAts] = await Promise.all([
      prisma.whatsappMessage.count({ where: { status: 'SENT', sentAt: { gte: startOfToday } } }),
      prisma.whatsappMessage.count({ where: { status: 'PENDING' } }),
      prisma.whatsappMessage.groupBy({ by: ['campaignId', 'status'], _count: { _all: true } }),
      prisma.whatsappMessage.groupBy({ by: ['campaignId'], _max: { createdAt: true } }),
    ])

    const createdAtMap = new Map(createdAts.map((c) => [c.campaignId, c._max.createdAt]))
    const map = new Map<string, { campaignId: string; total: number; pending: number; sent: number; failed: number; skipped: number }>()
    for (const g of grouped) {
      const e = map.get(g.campaignId) ?? { campaignId: g.campaignId, total: 0, pending: 0, sent: 0, failed: 0, skipped: 0 }
      const n = g._count._all
      e.total += n
      if (g.status === 'PENDING') e.pending += n
      else if (g.status === 'SENT') e.sent += n
      else if (g.status === 'FAILED') e.failed += n
      else if (g.status === 'SKIPPED') e.skipped += n
      map.set(g.campaignId, e)
    }

    const campaigns = [...map.values()]
      .map((c) => ({ ...c, createdAt: createdAtMap.get(c.campaignId) ?? null }))
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, 20)

    return NextResponse.json({ success: true, data: { sentToday, pendingTotal, campaigns } })
  } catch (error) {
    console.error('[GET /api/whatsapp/campaigns]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

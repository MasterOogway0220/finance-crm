import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canSendWhatsapp } from '@/lib/roles'
import { logActivity } from '@/lib/activity-log'
import { normalizeWhatsappPhone, personalizeMessage } from '@/lib/whatsapp-outreach'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'

const manualRecipientSchema = z.object({
  phone: z.string().min(1),
  name: z.string().optional(),
})

const campaignSchema = z.object({
  clientIds: z.array(z.string()).optional().default([]),
  manualRecipients: z.array(manualRecipientSchema).optional().default([]),
  message: z.string().min(1, 'Message cannot be empty'),
}).refine((d) => d.clientIds.length + d.manualRecipients.length > 0, {
  message: 'Select at least one recipient',
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const role = await getActiveRole(session.user)
    if (!canSendWhatsapp(role)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const parsed = campaignSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 })
    }
    const { clientIds, manualRecipients, message } = parsed.data

    const clients = clientIds.length
      ? await prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, clientCode: true, firstName: true, middleName: true, lastName: true, phone: true },
        })
      : []
    // clientIds selected that no longer resolve to a Client row (e.g. deleted between
    // select-all and queue) — surfaced so the reported counts reconcile with the selection.
    const skippedMissing = clientIds.length - clients.length

    // Unify client + manual recipients into one target list (clients first → win dedupe ties).
    type Target = { clientId: string | null; clientCode: string; clientName: string; phone: string; personalizeName: string }
    const targets: Target[] = []
    for (const c of clients) {
      targets.push({
        clientId: c.id,
        clientCode: c.clientCode,
        clientName: [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' '),
        phone: c.phone,
        personalizeName: c.firstName,
      })
    }
    for (const m of manualRecipients) {
      const name = m.name?.trim() || ''
      targets.push({
        clientId: null,
        clientCode: 'MANUAL',
        clientName: name || m.phone,
        phone: m.phone,
        personalizeName: name,
      })
    }

    const campaignId = randomUUID()
    const seen = new Set<string>()
    let skippedInvalid = 0
    let skippedDuplicate = 0
    const rows: Array<{
      campaignId: string; clientId: string | null; clientCode: string; clientName: string
      phone: string; body: string; createdById: string
    }> = []

    for (const t of targets) {
      const normalised = normalizeWhatsappPhone(t.phone)
      if (!normalised) { skippedInvalid++; continue }
      if (seen.has(normalised)) { skippedDuplicate++; continue }
      seen.add(normalised)
      rows.push({
        campaignId,
        clientId: t.clientId,
        clientCode: t.clientCode,
        clientName: t.clientName,
        phone: t.phone,
        body: personalizeMessage(message, t.personalizeName),
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
      details: `Queued ${rows.length} WhatsApp messages (campaign ${campaignId}). Skipped ${skippedInvalid} invalid, ${skippedDuplicate} duplicate, ${skippedMissing} missing.`,
    })

    return NextResponse.json({ success: true, data: { campaignId, queued: rows.length, skippedInvalid, skippedDuplicate, skippedMissing } })
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
    if (!canSendWhatsapp(role)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

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

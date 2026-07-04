require('dotenv').config()
const { create, ev } = require('@open-wa/wa-automate')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '30', 10)
const GAP_MS = parseInt(process.env.GAP_MS || '300000', 10)
const JITTER_MS = parseInt(process.env.JITTER_MS || '60000', 10)
const START_HOUR = parseInt(process.env.WINDOW_START_HOUR || '10', 10)
const END_HOUR = parseInt(process.env.WINDOW_END_HOUR || '16', 10)
const SESSION_ID = 'default'

/** Mirror of src/lib/whatsapp-outreach.ts normalizeWhatsappPhone (worker is standalone CommonJS). */
function normalizeWhatsappPhone(raw) {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length !== 10) return null
  if (d === '0000000000') return null
  return `91${d}`
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function startOfToday() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()) }

/** Publish live bridge state to the shared DB row the web Connect panel reads. */
async function setSession(data) {
  try {
    await prisma.whatsappSession.upsert({ where: { id: SESSION_ID }, update: data, create: { id: SESSION_ID, ...data } })
  } catch (e) {
    console.error('[worker] setSession failed', e)
  }
}

// open-wa emits the QR as a base64 PNG data URL before the session is authed — push it to the DB.
ev.on('qr.**', async (qrcode) => { await setSession({ state: 'QR', qr: qrcode }) })

async function refreshGroups(client) {
  try {
    const groups = await client.getAllGroups()
    const mapped = (groups || []).map((g) => ({
      id: g.id,
      title: g.formattedTitle || g.name || g.id,
      canSend: g.canSend !== false,
    }))
    await setSession({ groupsJson: JSON.stringify(mapped) })
    console.log(`[worker] Published ${mapped.length} groups.`)
  } catch (e) {
    console.error('[worker] getAllGroups failed', e)
  }
}

async function isConnected(client) {
  try { return (await client.getConnectionState()) === 'CONNECTED' } catch { return false }
}

async function drainQueue(client) {
  await setSession({ state: 'CONNECTED', qr: null, linkCode: null, requestedPhone: null })
  await refreshGroups(client)

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hour = new Date().getHours() // office PC local time == IST
    if (hour >= END_HOUR) {
      console.log(`[worker] Send window closed (>= ${END_HOUR}:00). Exiting.`)
      return
    }
    if (hour < START_HOUR) {
      const now = new Date()
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), START_HOUR, 0, 0, 0)
      const ms = Math.max(1000, target.getTime() - now.getTime())
      console.log(`[worker] Before send window; sleeping ${Math.round(ms / 60000)} min until ${START_HOUR}:00.`)
      await sleep(ms)
      continue
    }

    if (!(await isConnected(client))) {
      console.error('[worker] WhatsApp session not connected; aborting run (queue left intact).')
      await setSession({ state: 'DISCONNECTED' })
      return
    }

    // Keep the published group list fresh so groups joined mid-run show up in the app.
    await refreshGroups(client)

    const sentToday = await prisma.whatsappMessage.count({ where: { status: 'SENT', sentAt: { gte: startOfToday() } } })
    if (sentToday >= DAILY_LIMIT) {
      console.log(`[worker] Daily limit reached (${sentToday}/${DAILY_LIMIT}). Exiting.`)
      return
    }
    const msg = await prisma.whatsappMessage.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } })
    if (!msg) { console.log('[worker] Queue empty. Exiting.'); return }

    // Contacts resolve their chat id from the phone; groups use the stored targetId (…@g.us).
    const target = msg.targetType === 'GROUP'
      ? (msg.targetId || null)
      : (() => { const n = normalizeWhatsappPhone(msg.phone); return n ? `${n}@c.us` : null })()

    if (!target) {
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'SKIPPED', error: 'Invalid target' } })
      console.log(`[worker] SKIPPED ${msg.clientCode} (invalid target "${msg.phone || msg.targetId}")`)
      continue
    }

    try {
      await client.sendText(target, msg.body)
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'SENT', sentAt: new Date() } })
      console.log(`[worker] SENT ${msg.clientCode} -> ${target}  (${sentToday + 1}/${DAILY_LIMIT} today)`)
    } catch (err) {
      if (!(await isConnected(client))) {
        console.error(`[worker] Send errored and session is now disconnected; leaving ${msg.clientCode} PENDING and aborting run.`, err)
        await setSession({ state: 'DISCONNECTED' })
        return
      }
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'FAILED', error: String(err) } })
      console.error(`[worker] FAILED ${msg.clientCode}:`, err)
    }

    const wait = GAP_MS + Math.floor((Math.random() * 2 - 1) * JITTER_MS)
    console.log(`[worker] Waiting ${Math.round(Math.max(0, wait) / 1000)}s before next send...`)
    await sleep(Math.max(0, wait))
  }
}

let running = false
async function start(client) {
  if (running) { console.log('[worker] A drain is already active; ignoring duplicate start.'); return }
  running = true
  try {
    await drainQueue(client)
  } catch (e) {
    console.error('[worker] Fatal error draining queue:', e)
    await setSession({ state: 'DISCONNECTED' })
  } finally {
    running = false
    // The worker is exiting → it is no longer draining, so stop reporting CONNECTED.
    await setSession({ state: 'DISCONNECTED' })
    await prisma.$disconnect()
    try { await client.kill() } catch { /* ignore */ }
    process.exit(0)
  }
}

async function boot() {
  await setSession({ state: 'CONNECTING' })

  const opts = {
    sessionId: 'kesar-outreach',
    headless: true,
    qrTimeout: 0,
    authTimeout: 0,
    useChrome: false,
    throwErrorOnTosBlock: false,
    disableSpins: true,
  }

  // In-app linking is QR-only: open-wa surfaces a phone-pairing code only to THIS
  // console, so it can't be shown reliably in the web app. To link by phone number
  // instead, add `linkCode: '<number>'` to `opts` and read the code from this window.
  // NOTE: no `restartOnCrash` — a single loop avoids overlapping senders / double-sends.
  create(opts)
    .then((client) => start(client))
    .catch(async (err) => {
      console.error('[worker] Failed to start open-wa:', err)
      await setSession({ state: 'DISCONNECTED' })
      process.exit(1)
    })
}

boot()

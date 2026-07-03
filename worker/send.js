require('dotenv').config()
const { create } = require('@open-wa/wa-automate')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '30', 10)
const GAP_MS = parseInt(process.env.GAP_MS || '300000', 10)
const JITTER_MS = parseInt(process.env.JITTER_MS || '60000', 10)
const START_HOUR = parseInt(process.env.WINDOW_START_HOUR || '10', 10)
const END_HOUR = parseInt(process.env.WINDOW_END_HOUR || '16', 10)

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

/** True only when open-wa reports a live, connected session. */
async function isConnected(client) {
  try {
    const state = await client.getConnectionState()
    return state === 'CONNECTED'
  } catch {
    return false
  }
}

async function drainQueue(client) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hour = new Date().getHours() // office PC local time == IST
    if (hour >= END_HOUR) {
      console.log(`[worker] Send window closed (>= ${END_HOUR}:00). Exiting.`)
      return
    }
    if (hour < START_HOUR) {
      // Started before the window (e.g. auto-start at login): wait for it to open
      // instead of exiting, so the day's quota is not silently skipped.
      const now = new Date()
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), START_HOUR, 0, 0, 0)
      const ms = Math.max(1000, target.getTime() - now.getTime())
      console.log(`[worker] Before send window; sleeping ${Math.round(ms / 60000)} min until ${START_HOUR}:00.`)
      await sleep(ms)
      continue
    }

    // Never send on a dead/disconnected session — aborting leaves rows PENDING for
    // a later run rather than marking real clients FAILED (which is terminal).
    if (!(await isConnected(client))) {
      console.error('[worker] WhatsApp session not connected; aborting run (queue left intact).')
      return
    }

    const sentToday = await prisma.whatsappMessage.count({ where: { status: 'SENT', sentAt: { gte: startOfToday() } } })
    if (sentToday >= DAILY_LIMIT) {
      console.log(`[worker] Daily limit reached (${sentToday}/${DAILY_LIMIT}). Exiting.`)
      return
    }
    const msg = await prisma.whatsappMessage.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } })
    if (!msg) { console.log('[worker] Queue empty. Exiting.'); return }

    const normalised = normalizeWhatsappPhone(msg.phone)
    if (!normalised) {
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'SKIPPED', error: 'Invalid phone' } })
      console.log(`[worker] SKIPPED ${msg.clientCode} (invalid phone "${msg.phone}")`)
      continue
    }

    try {
      await client.sendText(`${normalised}@c.us`, msg.body)
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'SENT', sentAt: new Date() } })
      console.log(`[worker] SENT ${msg.clientCode} -> ${normalised}  (${sentToday + 1}/${DAILY_LIMIT} today)`)
    } catch (err) {
      // Distinguish a genuine per-recipient failure (mark FAILED) from the session
      // dropping mid-run (abort so we don't shred the whole queue into FAILED).
      if (!(await isConnected(client))) {
        console.error(`[worker] Send errored and session is now disconnected; leaving ${msg.clientCode} PENDING and aborting run.`, err)
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
  } finally {
    running = false
    await prisma.$disconnect()
    try { await client.kill() } catch { /* ignore */ }
    process.exit(0)
  }
}

// NOTE: no `restartOnCrash` — on a browser crash we prefer to end the run cleanly
// (single loop, no double-sends) and let the operator / Task Scheduler relaunch.
create({
  sessionId: 'kesar-outreach',
  headless: true,
  qrTimeout: 0,
  authTimeout: 0,
  useChrome: false,
  throwErrorOnTosBlock: false,
  disableSpins: true,
})
  .then((client) => start(client))
  .catch((err) => { console.error('[worker] Failed to start open-wa:', err); process.exit(1) })

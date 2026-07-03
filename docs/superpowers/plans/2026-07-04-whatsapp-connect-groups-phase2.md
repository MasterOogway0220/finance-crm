# WhatsApp Phase 2 — In-app Connect + Groups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface the office-PC bridge's WhatsApp connection **inside the app** (QR to scan + phone-pairing + live Connected status), and let senders target **WhatsApp groups** as recipients.

**Architecture:** The DB stays the only channel between Vercel and the office PC. A singleton `WhatsappSession` row holds the bridge's live state (`state`, `qr` base64, `linkCode`, `requestedPhone`, `groupsJson`). The evolved `worker/send.js` publishes its lifecycle to that row (QR via `ev.on('qr.**')`, state via `getConnectionState()`, groups via `getAllGroups()`) and consumes `requestedPhone`; the web polls `GET /api/whatsapp/session` to render it. `WhatsappMessage` gains `targetType`/`targetId` so a row can address a contact (`@c.us`) or a group (`@g.us`).

**Tech Stack:** Next.js 16, Prisma 6/MySQL, `@open-wa/wa-automate` (bridge), shadcn/ui + sonner.

## Global Constraints

- Gate the session + campaign routes with `canSendWhatsapp(role)`.
- **Do NOT hard-disable queuing when disconnected** (the DB queue must accept campaigns while the PC is off). Show a status banner instead.
- QR is the reliable in-app link path; **phone-pairing is best-effort** (open-wa's generated code may need to be read from the bridge terminal) — document, don't block on it.
- Bridge deps stay only in `worker/package.json`; `worker/` stays out of `tsconfig`/`eslint`.
- **Bridge tasks are validated on the office PC** — CI here is `node --check` + app-side `next build` only.
- `prisma db push` for both schemas is a deferred, owner-approved deploy step.

---

## File Structure

- **Modify** `prisma/schema.prisma` — add `WhatsappSessionState`, `WhatsappTargetType` enums; `WhatsappSession` model; `targetType`/`targetId` on `WhatsappMessage`.
- **Modify** `worker/prisma/schema.prisma` — mirror the same additions.
- **Create** `src/app/api/whatsapp/session/route.ts` — `GET` session state/qr/linkCode/groups.
- **Create** `src/app/api/whatsapp/session/link/route.ts` — `POST { phone }` → set `requestedPhone`.
- **Modify** `src/app/api/whatsapp/campaigns/route.ts` — accept `groupIds`, write GROUP rows.
- **Create** `src/components/whatsapp/connect-panel.tsx` — polling Connect card.
- **Modify** `src/app/(protected)/whatsapp/page.tsx` — mount Connect panel; add Groups recipient source; include groups + not-connected banner.
- **Modify** `worker/send.js` — publish lifecycle + send to `targetId`.
- **Modify** `worker/README.md` — document connect flow.

---

### Task 1: Data model (both schemas)

**Files:** Modify `prisma/schema.prisma`, `worker/prisma/schema.prisma`

**Interfaces (produced):** `enum WhatsappSessionState { DISCONNECTED CONNECTING QR PAIRING CONNECTED }`; `enum WhatsappTargetType { CONTACT GROUP }`; `model WhatsappSession { id="default", state, qr?, linkCode?, requestedPhone?, groupsJson?, updatedAt }`; `WhatsappMessage.targetType (default CONTACT)`, `WhatsappMessage.targetId String?`.

- [ ] **Step 1: Add to `prisma/schema.prisma`** (after the `WhatsappStatus` enum):

```prisma
enum WhatsappSessionState {
  DISCONNECTED
  CONNECTING
  QR
  PAIRING
  CONNECTED
}

enum WhatsappTargetType {
  CONTACT
  GROUP
}

model WhatsappSession {
  id             String               @id @default("default")
  state          WhatsappSessionState @default(DISCONNECTED)
  qr             String?              @db.Text
  linkCode       String?
  requestedPhone String?
  groupsJson     String?              @db.Text
  updatedAt      DateTime             @updatedAt
}
```

and add two fields to `model WhatsappMessage` (after `phone`):
```prisma
  targetType  WhatsappTargetType @default(CONTACT)
  targetId    String?
```

- [ ] **Step 2: Mirror in `worker/prisma/schema.prisma`** — add the same two enums, the `WhatsappSession` model (with `@@map("WhatsappSession")`), and the two `WhatsappMessage` fields (keep its existing `@@map("WhatsappMessage")`).

- [ ] **Step 3: Generate + typecheck**

Run: `npx prisma generate && npx tsc --noEmit 2>&1 | grep -v brokerage-archive | grep "error TS"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma worker/prisma/schema.prisma
git commit -m "feat(whatsapp): Phase 2 data model (WhatsappSession + target type/id)"
```

---

### Task 2: Session API (`GET /session`, `POST /session/link`)

**Files:** Create `src/app/api/whatsapp/session/route.ts`, `src/app/api/whatsapp/session/link/route.ts`

**Interfaces (produced):** `GET /api/whatsapp/session` → `{ success, data: { state, qr, linkCode, groups: {id,title,canSend}[] } }`; `POST /api/whatsapp/session/link` `{ phone }` → `{ success, data: { requestedPhone } }`.

- [ ] **Step 1: `src/app/api/whatsapp/session/route.ts`**

```ts
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
    if (row?.groupsJson) { try { groups = JSON.parse(row.groupsJson) } catch { groups = [] } }
    return NextResponse.json({
      success: true,
      data: {
        state: row?.state ?? 'DISCONNECTED',
        qr: row?.state === 'QR' ? row.qr : null,
        linkCode: row?.state === 'PAIRING' ? row.linkCode : null,
        groups,
      },
    })
  } catch (error) {
    console.error('[GET /api/whatsapp/session]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: `src/app/api/whatsapp/session/link/route.ts`**

```ts
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
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit 2>&1 | grep -v brokerage-archive | grep "error TS"` → no output.
```bash
git add src/app/api/whatsapp/session
git commit -m "feat(whatsapp): session API (state/qr/linkCode/groups + link request)"
```

---

### Task 3: Campaigns accept `groupIds`

**Files:** Modify `src/app/api/whatsapp/campaigns/route.ts`

**Interfaces (consumed):** session `groupsJson` (Task 1) for group titles. **(produced):** `POST` body gains `groupIds?: string[]`; GROUP rows: `targetType='GROUP'`, `targetId=<groupId>`, `clientCode='GROUP'`, `clientName=<group title>`, `phone=''`.

- [ ] **Step 1: Extend the schema + build GROUP rows.** In `campaignSchema` add `groupIds: z.array(z.string()).optional().default([])`, and update the refine to `d.clientIds.length + d.manualRecipients.length + d.groupIds.length > 0`.

- [ ] **Step 2: After building contact `rows`, append group rows** (groups are addressed by id, not phone, so they are deduped separately by `targetId`):

```ts
    // Groups: resolve titles from the session cache; dedupe by group id.
    let groupTitles: Record<string, string> = {}
    if (groupIds.length) {
      const sess = await prisma.whatsappSession.findUnique({ where: { id: 'default' }, select: { groupsJson: true } })
      if (sess?.groupsJson) {
        try { for (const g of JSON.parse(sess.groupsJson) as { id: string; title: string }[]) groupTitles[g.id] = g.title } catch { groupTitles = {} }
      }
    }
    const seenGroups = new Set<string>()
    for (const gid of groupIds) {
      if (seenGroups.has(gid)) { skippedDuplicate++; continue }
      seenGroups.add(gid)
      rows.push({
        campaignId, clientId: null, clientCode: 'GROUP',
        clientName: groupTitles[gid] ?? gid, phone: '',
        body: personalizeMessage(message, 'there'),
        createdById: session.user.id,
        targetType: 'GROUP', targetId: gid,
      })
    }
```

Update the `rows` element type to include `targetType?: 'CONTACT' | 'GROUP'` and `targetId?: string | null`, and set `targetType: 'CONTACT'` on the contact rows (or rely on the DB default by omitting — but include explicitly for clarity). Destructure `groupIds` from `parsed.data`.

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit 2>&1 | grep -v brokerage-archive | grep "error TS"` → no output.
```bash
git add src/app/api/whatsapp/campaigns/route.ts
git commit -m "feat(whatsapp): queue campaigns to WhatsApp groups (targetType/targetId)"
```

---

### Task 4: Connect panel (frontend)

**Files:** Create `src/components/whatsapp/connect-panel.tsx`; Modify `src/app/(protected)/whatsapp/page.tsx`

**Interfaces (consumed):** `GET /api/whatsapp/session`, `POST /api/whatsapp/session/link`. **(produced):** `<ConnectPanel onState={(state)=>void} />` renders status + QR + link-by-phone; calls `onState` with the latest `state` so the page can show a banner and expose groups.

- [ ] **Step 1: `src/components/whatsapp/connect-panel.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export interface SessionGroup { id: string; title: string; canSend: boolean }
interface SessionData { state: string; qr: string | null; linkCode: string | null; groups: SessionGroup[] }

const LABEL: Record<string, { text: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  CONNECTED: { text: 'Connected', variant: 'secondary' },
  QR: { text: 'Scan the QR', variant: 'outline' },
  PAIRING: { text: 'Enter the code', variant: 'outline' },
  CONNECTING: { text: 'Connecting…', variant: 'outline' },
  DISCONNECTED: { text: 'Disconnected', variant: 'destructive' },
}

export function ConnectPanel({ onSession }: { onSession: (data: SessionData) => void }) {
  const [data, setData] = useState<SessionData>({ state: 'DISCONNECTED', qr: null, linkCode: null, groups: [] })
  const [phone, setPhone] = useState('')
  const [linking, setLinking] = useState(false)
  const onSessionRef = useRef(onSession)
  onSessionRef.current = onSession

  useEffect(() => {
    let alive = true
    const poll = () => fetch('/api/whatsapp/session').then((r) => r.json()).then((d) => {
      if (alive && d.success) { setData(d.data); onSessionRef.current(d.data) }
    }).catch(() => {})
    poll()
    const id = setInterval(poll, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const link = async () => {
    setLinking(true)
    try {
      const d = await (await fetch('/api/whatsapp/session/link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
      })).json()
      if (d.success) toast.success('Requested. Restart the office-PC worker if needed; the pairing code will appear here or in the worker window.')
      else toast.error(d.error || 'Failed to request link')
    } catch { toast.error('Failed to request link') } finally { setLinking(false) }
  }

  const s = LABEL[data.state] ?? LABEL.DISCONNECTED

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2">WhatsApp connection <Badge variant={s.variant}>{s.text}</Badge></CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {data.state === 'CONNECTED' ? (
          <p className="text-sm text-green-700">Linked and ready — queued messages will send from the office PC.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Link the sending WhatsApp number once. The office-PC worker must be running for a QR/code to appear.
            </p>
            {data.qr && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Scan this QR (WhatsApp → Linked devices → Link a device):</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.qr} alt="WhatsApp QR code" className="h-56 w-56 rounded border bg-white p-2" />
              </div>
            )}
            {data.linkCode && (
              <p className="text-sm">Or enter this code in WhatsApp → Linked devices → Link with phone number: <b className="font-mono tracking-widest">{data.linkCode}</b></p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Link with phone number instead</label>
                <Input className="w-56" placeholder="e.g. 9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <Button size="sm" variant="outline" onClick={link} disabled={linking || phone.trim().length === 0}>
                {linking ? 'Requesting…' : 'Request code'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Mount it + not-connected banner + groups source in `page.tsx`.**
  - Import `ConnectPanel` + its `SessionGroup` type.
  - Add state: `const [sessionState, setSessionState] = useState('DISCONNECTED')`, `const [groups, setGroups] = useState<SessionGroup[]>([])`, `const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())`.
  - Render `<ConnectPanel onSession={(d) => { setSessionState(d.state); setGroups(d.groups) }} />` right under the page heading (above Queue status).
  - Add a **Groups** card (only if `groups.length > 0`): a checkbox list of `groups` (title), toggling `selectedGroups`.
  - In `recipientCount`, add `selectedGroups.size`.
  - In `submit()`, include `groupIds: [...selectedGroups]` in the POST body; clear `selectedGroups` on success.
  - Add a banner when `sessionState !== 'CONNECTED'`: `<div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">WhatsApp isn't connected — you can still queue; messages send once the office-PC worker is linked and running.</div>`

- [ ] **Step 3: Build + commit**

Run: `npm run build 2>&1 | grep -iE "error|Compiled successfully"` → "Compiled successfully".
```bash
git add "src/components/whatsapp/connect-panel.tsx" "src/app/(protected)/whatsapp/page.tsx"
git commit -m "feat(whatsapp): in-app Connect panel (QR + pairing + status) and group recipients"
```

---

### Task 5: Bridge — publish lifecycle + send to targetId

**Files:** Modify `worker/send.js`, `worker/README.md`

> **VALIDATION:** structure only here (`node --check`). Real behavior is validated on the office PC.

**Interfaces (consumed):** `WhatsappSession` row (Task 1), `@open-wa/wa-automate` `ev.on('qr.**')`, `getConnectionState()`, `getAllGroups()`, `create({ linkCode })`.

- [ ] **Step 1: Rewrite `worker/send.js`** to add session publishing. Key additions (full file):

```js
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

async function setSession(data) {
  await prisma.whatsappSession.upsert({ where: { id: SESSION_ID }, update: data, create: { id: SESSION_ID, ...data } })
}

// Publish the QR (base64 PNG) to the DB for the web Connect panel.
ev.on('qr.**', async (qrcode) => { try { await setSession({ state: 'QR', qr: qrcode }) } catch (e) { console.error('[worker] qr publish failed', e) } })

async function refreshGroups(client) {
  try {
    const groups = await client.getAllGroups()
    const mapped = (groups || []).map((g) => ({ id: g.id, title: g.formattedTitle || g.name || g.id, canSend: g.canSend !== false }))
    await setSession({ groupsJson: JSON.stringify(mapped) })
  } catch (e) { console.error('[worker] getAllGroups failed', e) }
}

async function isConnected(client) {
  try { return (await client.getConnectionState()) === 'CONNECTED' } catch { return false }
}

async function drainQueue(client) {
  await setSession({ state: 'CONNECTED', qr: null, linkCode: null, requestedPhone: null })
  await refreshGroups(client)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hour = new Date().getHours()
    if (hour >= END_HOUR) { console.log('[worker] Window closed. Exiting.'); return }
    if (hour < START_HOUR) {
      const now = new Date(); const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), START_HOUR, 0, 0, 0)
      const ms = Math.max(1000, target.getTime() - now.getTime())
      console.log(`[worker] Before window; sleeping ${Math.round(ms / 60000)} min.`); await sleep(ms); continue
    }
    if (!(await isConnected(client))) { console.error('[worker] Not connected; aborting run.'); await setSession({ state: 'DISCONNECTED' }); return }
    const sentToday = await prisma.whatsappMessage.count({ where: { status: 'SENT', sentAt: { gte: startOfToday() } } })
    if (sentToday >= DAILY_LIMIT) { console.log(`[worker] Daily limit ${DAILY_LIMIT} reached. Exiting.`); return }
    const msg = await prisma.whatsappMessage.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } })
    if (!msg) { console.log('[worker] Queue empty. Exiting.'); return }

    // Contacts resolve from phone; groups use the stored targetId (@g.us).
    const target = msg.targetType === 'GROUP'
      ? (msg.targetId || null)
      : (() => { const n = normalizeWhatsappPhone(msg.phone); return n ? `${n}@c.us` : null })()
    if (!target) {
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'SKIPPED', error: 'Invalid target' } })
      console.log(`[worker] SKIPPED ${msg.clientCode} (invalid target)`); continue
    }
    try {
      await client.sendText(target, msg.body)
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'SENT', sentAt: new Date() } })
      console.log(`[worker] SENT ${msg.clientCode} -> ${target} (${sentToday + 1}/${DAILY_LIMIT})`)
    } catch (err) {
      if (!(await isConnected(client))) { console.error('[worker] Disconnected mid-send; leaving PENDING, aborting.', err); await setSession({ state: 'DISCONNECTED' }); return }
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'FAILED', error: String(err) } })
      console.error(`[worker] FAILED ${msg.clientCode}:`, err)
    }
    const wait = GAP_MS + Math.floor((Math.random() * 2 - 1) * JITTER_MS)
    console.log(`[worker] Waiting ${Math.round(Math.max(0, wait) / 1000)}s.`); await sleep(Math.max(0, wait))
  }
}

let running = false
async function start(client) {
  if (running) return
  running = true
  try { await drainQueue(client) } catch (e) { console.error('[worker] Fatal:', e); await setSession({ state: 'DISCONNECTED' }) }
  finally { running = false; await prisma.$disconnect(); try { await client.kill() } catch { /* ignore */ } process.exit(0) }
}

async function boot() {
  await setSession({ state: 'CONNECTING' })
  // If the web requested phone-linking, use a link code; otherwise QR.
  let linkCode
  try { const row = await prisma.whatsappSession.findUnique({ where: { id: SESSION_ID } }); linkCode = row?.requestedPhone || undefined } catch { /* ignore */ }
  if (linkCode) { await setSession({ state: 'PAIRING' }) }
  const opts = { sessionId: 'kesar-outreach', headless: true, qrTimeout: 0, authTimeout: 0, useChrome: false, throwErrorOnTosBlock: false, disableSpins: true }
  create(linkCode ? { ...opts, linkCode } : opts)
    .then((client) => start(client))
    .catch(async (err) => { console.error('[worker] Failed to start open-wa:', err); await setSession({ state: 'DISCONNECTED' }); process.exit(1) })
}
boot()
```

- [ ] **Step 2: `node --check`**

Run: `node --check worker/send.js` → no output.

- [ ] **Step 3: Update `worker/README.md`** — add a "Connecting from the app" section: start the worker → the QR appears on the WhatsApp page's Connect card → scan it; or type the number on the page ("Request code") and restart the worker to link by code (the code prints in the worker window and, when captured, on the page). Note the session state is published live to the page.

- [ ] **Step 4: Commit**

```bash
git add worker/send.js worker/README.md
git commit -m "feat(whatsapp): bridge publishes connect lifecycle + groups; sends to targetId"
```

---

### Task 6: Verify + deploy

- [ ] `npx tsc --noEmit 2>&1 | grep -v brokerage-archive | grep "error TS"` → none.
- [ ] `npm test` → 32/32 green (no unit surface added; regression check).
- [ ] `npm run build` → Compiled successfully.
- [ ] `node --check worker/send.js` → clean.
- [ ] **Deferred (owner):** `npx prisma db push` (adds `WhatsappSession`, enums, `WhatsappMessage.targetType/targetId`); office-PC: `cd worker && npm install` (pulls updated schema), run, then link via the app's Connect card.

## Self-review notes
- Spec §7 mapped: data model → T1; session API → T2; groups queue → T3; connect panel + groups UI → T4; bridge lifecycle/groups/targetId → T5.
- Deviation from spec (intentional): queuing is **not** gated on `CONNECTED` (banner instead) to preserve queue/PC decoupling. Phone-pairing is best-effort (T5 boot picks link-code mode on start; hot-switch mid-run is out of scope).

# WhatsApp Desktop Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let non-technical staff connect and run the WhatsApp sender entirely from the existing Electron desktop app (open app → Connect → scan QR once), with a DB-enforced single-sender lease + atomic per-message claim so an in-flight send can never be interrupted or duplicated across machines.

**Architecture:** Bundle the existing `open-wa` worker inside the Electron desktop app and run it with Electron's built-in Node via `utilityProcess.fork` (no Node/npm install on the office PC). The worker keeps its direct-DB (Prisma) access. A new `WhatsappSenderLease` row + a new `SENDING` message status enforce exactly one active sender and exclusive per-message ownership. The website's existing Connect panel gains Connect/Disconnect buttons when running inside the desktop app.

**Tech Stack:** Next.js 16 (App Router) on Vercel, NextAuth v5, Prisma 6.19.2 / MySQL (Hostinger), Electron 33 (`electron-app/`), `@open-wa/wa-automate` ^4, Vitest 2 (test runner, `environment: 'node'`, `include: ['src/**/*.test.ts']`).

## Global Constraints

- **Free method only** — `@open-wa/wa-automate`; do NOT add the paid Meta Business API. Never add `@open-wa/wa-automate` to the root `package.json` (breaks the Vercel build; the worker is standalone and `tsconfig.json` excludes `worker`).
- **Direct DB access is accepted** because the installer is distributed strictly internally. The built installer must never be published publicly; keep GitHub releases private.
- **Concurrency guarantee is non-negotiable:** exactly one active sender (DB lease), and an in-flight (`SENDING`) message is untouchable by any other machine. Never auto-retry a stuck `SENDING` message — surface it for manual review instead. Prefer "never duplicate" over "never miss".
- **Prod DB safety:** `.env` `DATABASE_URL` is the PRODUCTION Hostinger DB. Run `prisma db push` ONLY from the app schema `prisma/schema.prisma` (the worker schema is a minimal subset — pushing it would DROP tables). Always preview the diff and get explicit user authorization before any prod push.
- **Lease timing:** lease valid 30_000 ms; renew every 10_000 ms. Stale-`SENDING` threshold: 600_000 ms (10 min).
- **QR-only linking** is kept (no phone pairing codes).
- Test source of truth for pure logic lives in `src/lib/*.ts` (Vitest); the standalone CommonJS worker **mirrors** that logic, matching the existing convention already documented in `worker/send.js`.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/lib/whatsapp-sender-lease.ts` | Pure lease/claim/status decision helpers (tested source of truth) | Create |
| `src/lib/whatsapp-sender-lease.test.ts` | Vitest unit tests for the helpers | Create |
| `prisma/schema.prisma` | App schema: add `SENDING`, add `WhatsappSenderLease` | Modify |
| `worker/prisma/schema.prisma` | Worker schema: mirror enum/model + Windows binary target | Modify |
| `worker/send.js` | Resident worker: lease + atomic claim + idle loop | Modify |
| `src/app/api/whatsapp/campaigns/route.ts` | Aggregate + surface `SENDING` / stuck counts | Modify |
| `src/app/(protected)/whatsapp/page.tsx` | Show "sending" / "needs review" badges | Modify |
| `electron-app/main.js` | IPC `whatsapp-start`/`whatsapp-stop`; fork/stop worker | Modify |
| `electron-app/preload.js` | Expose `startWhatsapp`/`stopWhatsapp`/`isDesktopApp` | Modify |
| `electron-app/electron-builder.yml` | Bundle worker + node_modules + prisma engine + Chromium | Modify |
| `electron-app/package.json` | Build helper scripts for worker bundling | Modify |
| `src/components/whatsapp/connect-panel.tsx` | Connect/Disconnect buttons in desktop app; plain-browser hint | Modify |

---

## Task 1: Pure lease/claim/status helpers (tested)

**Files:**
- Create: `src/lib/whatsapp-sender-lease.ts`
- Test: `src/lib/whatsapp-sender-lease.test.ts`

**Interfaces:**
- Produces:
  - `LEASE_TTL_MS = 30_000`, `LEASE_RENEW_MS = 10_000`, `STALE_SENDING_MS = 600_000`
  - `canAcquireLease(lease: { holderId: string | null; expiresAt: Date | null } | null, me: string, now: Date): boolean`
  - `nextExpiry(now: Date, ttlMs?: number): Date`
  - `isSendingStale(updatedAt: Date, now: Date, thresholdMs?: number): boolean`
  - `messageStatusLabel(status: string, updatedAt: Date, now: Date): 'pending' | 'sending' | 'needs-review' | 'sent' | 'failed' | 'skipped'`

- [ ] **Step 1: Write the failing test**

Create `src/lib/whatsapp-sender-lease.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  LEASE_TTL_MS,
  canAcquireLease,
  nextExpiry,
  isSendingStale,
  messageStatusLabel,
} from '@/lib/whatsapp-sender-lease'

const T0 = new Date('2026-07-04T10:00:00.000Z')

describe('canAcquireLease', () => {
  it('acquires when no lease row exists', () => {
    expect(canAcquireLease(null, 'me', T0)).toBe(true)
  })
  it('acquires when holder is empty', () => {
    expect(canAcquireLease({ holderId: null, expiresAt: null }, 'me', T0)).toBe(true)
  })
  it('renews when we already hold it (even if unexpired)', () => {
    const future = new Date(T0.getTime() + 20_000)
    expect(canAcquireLease({ holderId: 'me', expiresAt: future }, 'me', T0)).toBe(true)
  })
  it('refuses when another holder has an unexpired lease', () => {
    const future = new Date(T0.getTime() + 20_000)
    expect(canAcquireLease({ holderId: 'other', expiresAt: future }, 'me', T0)).toBe(false)
  })
  it('takes over when another holder lease is expired', () => {
    const past = new Date(T0.getTime() - 1)
    expect(canAcquireLease({ holderId: 'other', expiresAt: past }, 'me', T0)).toBe(true)
  })
  it('takes over when another holder has no expiry set', () => {
    expect(canAcquireLease({ holderId: 'other', expiresAt: null }, 'me', T0)).toBe(true)
  })
})

describe('nextExpiry', () => {
  it('adds the TTL to now', () => {
    expect(nextExpiry(T0).getTime()).toBe(T0.getTime() + LEASE_TTL_MS)
  })
})

describe('isSendingStale', () => {
  it('is false just under the threshold', () => {
    const updated = new Date(T0.getTime() - 599_000)
    expect(isSendingStale(updated, T0)).toBe(false)
  })
  it('is true at/over the threshold', () => {
    const updated = new Date(T0.getTime() - 600_000)
    expect(isSendingStale(updated, T0)).toBe(true)
  })
})

describe('messageStatusLabel', () => {
  it('maps SENDING within threshold to "sending"', () => {
    const updated = new Date(T0.getTime() - 1000)
    expect(messageStatusLabel('SENDING', updated, T0)).toBe('sending')
  })
  it('maps stale SENDING to "needs-review"', () => {
    const updated = new Date(T0.getTime() - 700_000)
    expect(messageStatusLabel('SENDING', updated, T0)).toBe('needs-review')
  })
  it('passes through terminal statuses', () => {
    expect(messageStatusLabel('SENT', T0, T0)).toBe('sent')
    expect(messageStatusLabel('FAILED', T0, T0)).toBe('failed')
    expect(messageStatusLabel('SKIPPED', T0, T0)).toBe('skipped')
    expect(messageStatusLabel('PENDING', T0, T0)).toBe('pending')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/whatsapp-sender-lease.test.ts`
Expected: FAIL — "Failed to resolve import '@/lib/whatsapp-sender-lease'".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/whatsapp-sender-lease.ts`:

```ts
/**
 * Pure decision helpers for the single-sender lease and per-message claim.
 *
 * The lease and claim are ATOMICALLY enforced in the database (updateMany with a
 * conditional WHERE); these functions mirror those conditions so they can be unit
 * tested and reused for UI hints. `worker/send.js` mirrors this logic in CommonJS.
 */
export const LEASE_TTL_MS = 30_000
export const LEASE_RENEW_MS = 10_000
export const STALE_SENDING_MS = 600_000

export function canAcquireLease(
  lease: { holderId: string | null; expiresAt: Date | null } | null,
  me: string,
  now: Date,
): boolean {
  if (!lease) return true
  if (!lease.holderId) return true
  if (lease.holderId === me) return true
  if (!lease.expiresAt) return true
  return lease.expiresAt.getTime() < now.getTime()
}

export function nextExpiry(now: Date, ttlMs: number = LEASE_TTL_MS): Date {
  return new Date(now.getTime() + ttlMs)
}

export function isSendingStale(
  updatedAt: Date,
  now: Date,
  thresholdMs: number = STALE_SENDING_MS,
): boolean {
  return now.getTime() - updatedAt.getTime() >= thresholdMs
}

export type MessageStatusLabel =
  | 'pending' | 'sending' | 'needs-review' | 'sent' | 'failed' | 'skipped'

export function messageStatusLabel(status: string, updatedAt: Date, now: Date): MessageStatusLabel {
  switch (status) {
    case 'SENDING': return isSendingStale(updatedAt, now) ? 'needs-review' : 'sending'
    case 'SENT': return 'sent'
    case 'FAILED': return 'failed'
    case 'SKIPPED': return 'skipped'
    default: return 'pending'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/whatsapp-sender-lease.test.ts`
Expected: PASS (16 assertions across the describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp-sender-lease.ts src/lib/whatsapp-sender-lease.test.ts
git commit -m "feat(whatsapp): pure lease/claim/status helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Schema changes + generate + prod push

**Files:**
- Modify: `prisma/schema.prisma` (enum `WhatsappStatus`, new model `WhatsappSenderLease`)
- Modify: `worker/prisma/schema.prisma` (mirror enum + model, add Windows binary target)

**Interfaces:**
- Produces: DB table `WhatsappSenderLease(id, holderId, holderName, expiresAt, updatedAt)`; `WhatsappStatus` gains `SENDING`. Prisma clients for both packages regenerated.

- [ ] **Step 1: Edit the app schema enum**

In `prisma/schema.prisma`, change the `WhatsappStatus` enum to:

```prisma
enum WhatsappStatus {
  PENDING
  SENDING
  SENT
  FAILED
  SKIPPED
}
```

- [ ] **Step 2: Add the lease model to the app schema**

In `prisma/schema.prisma`, add after the `WhatsappSession` model:

```prisma
model WhatsappSenderLease {
  id         String    @id @default("default")
  holderId   String?
  holderName String?
  expiresAt  DateTime?
  updatedAt  DateTime  @updatedAt
}
```

- [ ] **Step 3: Mirror the enum + model in the worker schema and add the Windows engine target**

In `worker/prisma/schema.prisma`:

Change the generator block to include the Windows binary target (needed because the desktop app is built for Windows, possibly cross-built from macOS/CI):

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "windows"]
}
```

Change `WhatsappStatus` to add `SENDING` (same as Step 1), and add the same `WhatsappSenderLease` model (same as Step 2) with an explicit table map to be safe:

```prisma
model WhatsappSenderLease {
  id         String    @id @default("default")
  holderId   String?
  holderName String?
  expiresAt  DateTime?
  updatedAt  DateTime  @updatedAt

  @@map("WhatsappSenderLease")
}
```

- [ ] **Step 4: Regenerate both Prisma clients**

Run: `npx prisma generate` (app) then `cd worker && npx prisma generate --schema=./prisma/schema.prisma && cd ..`
Expected: both print "Generated Prisma Client". The worker generate also downloads the Windows query engine.

- [ ] **Step 5: Preview the prod diff (READ-ONLY) — do NOT push yet**

Run: `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`
Expected: an additive SQL script only — `ALTER TABLE ... MODIFY ... WhatsappStatus enum` adding `SENDING`, and `CREATE TABLE WhatsappSenderLease (...)`. Confirm there are NO `DROP` statements.

- [ ] **Step 6: STOP — get explicit user authorization, then push to prod**

This writes to the PRODUCTION database. Show the user the diff from Step 5 and get an explicit "yes". Only then run — from the APP schema only:

Run: `npx prisma db push --schema=prisma/schema.prisma`
Expected: "Your database is now in sync with your Prisma schema." Never run `db push` from `worker/prisma/schema.prisma`.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma worker/prisma/schema.prisma
git commit -m "feat(whatsapp): add SENDING status + WhatsappSenderLease

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Worker — lease, atomic claim, resident loop

**Files:**
- Modify: `worker/send.js`

**Interfaces:**
- Consumes: `WhatsappSenderLease` table, `SENDING` status (Task 2); mirrors `canAcquireLease`/`nextExpiry` semantics (Task 1).
- Produces: a resident worker that holds the WhatsApp session, drains only while holding the lease, claims each message atomically to `SENDING` before sending, and reads config from env vars passed by the parent process.

- [ ] **Step 1: Add a lease identity + helpers near the top of `worker/send.js`**

After the existing `const SESSION_ID = 'default'` line (currently line 12), add:

```js
const LEASE_ID = 'default'
const LEASE_TTL_MS = 30000
const LEASE_RENEW_MS = 10000
// A stable-per-process id so lease ownership survives renewals within one run.
const HOLDER_ID = `${process.pid}-${Math.floor(process.uptime() * 1000)}`
const HOLDER_NAME = process.env.WA_MACHINE_NAME || require('os').hostname()

/**
 * Atomically acquire or renew the single-sender lease. Returns true iff THIS
 * process now holds it. The WHERE clause is the atomic guarantee — only one row
 * matches, so only one machine can win. Mirrors src/lib/whatsapp-sender-lease.ts.
 */
async function acquireLease() {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LEASE_TTL_MS)
  try {
    // Ensure the row exists (id is fixed 'default'); ignore races.
    await prisma.whatsappSenderLease.upsert({
      where: { id: LEASE_ID },
      update: {},
      create: { id: LEASE_ID },
    })
    const res = await prisma.whatsappSenderLease.updateMany({
      where: {
        id: LEASE_ID,
        OR: [
          { holderId: null },
          { holderId: HOLDER_ID },
          { expiresAt: null },
          { expiresAt: { lt: now } },
        ],
      },
      data: { holderId: HOLDER_ID, holderName: HOLDER_NAME, expiresAt },
    })
    return res.count === 1
  } catch (e) {
    console.error('[worker] acquireLease failed', e)
    return false
  }
}

async function releaseLease() {
  try {
    await prisma.whatsappSenderLease.updateMany({
      where: { id: LEASE_ID, holderId: HOLDER_ID },
      data: { holderId: null, holderName: null, expiresAt: null },
    })
  } catch (e) { console.error('[worker] releaseLease failed', e) }
}
```

- [ ] **Step 2: Make the send loop lease-gated and claim atomically**

In `drainQueue(client)` (currently lines 66–140), replace the body from the message pick through the send with this. Specifically, replace the block that currently starts at `const msg = await prisma.whatsappMessage.findFirst(...)` (line 100) down to the send/catch that ends at line 134, with:

```js
    // Renew (or lose) the lease before every send. If we can't hold it, another
    // machine is the active sender — stop draining so we never double-send.
    if (!(await acquireLease())) {
      console.log('[worker] Another machine holds the sender lease; not draining.')
      await sleep(LEASE_RENEW_MS)
      continue
    }

    const candidate = await prisma.whatsappMessage.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } })
    if (!candidate) { console.log('[worker] Queue empty.'); return }

    // Atomic claim: flip PENDING -> SENDING. Only the winner gets count === 1.
    // A row left in SENDING (crash mid-send) is never auto-retried here.
    const claim = await prisma.whatsappMessage.updateMany({
      where: { id: candidate.id, status: 'PENDING' },
      data: { status: 'SENDING' },
    })
    if (claim.count !== 1) { console.log('[worker] Lost race to claim; re-picking.'); continue }
    const msg = candidate

    // Contacts resolve their chat id from the phone; groups use the stored targetId (…@g.us).
    const normalised = msg.targetType === 'GROUP' ? null : normalizeWhatsappPhone(msg.phone)
    const target = msg.targetType === 'GROUP' ? (msg.targetId || null) : (normalised ? `${normalised}@c.us` : null)

    if (!target) {
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'SKIPPED', error: 'Invalid target' } })
      console.log(`[worker] SKIPPED ${msg.clientCode} (invalid target "${msg.phone || msg.targetId}")`)
      continue
    }
    if (normalised) {
      const optedOut = await prisma.whatsappOptOut.findUnique({ where: { phone: normalised } })
      if (optedOut) {
        await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'SKIPPED', error: 'Opted out' } })
        console.log(`[worker] SKIPPED ${msg.clientCode} (opted out)`)
        continue
      }
    }

    try {
      await client.sendText(target, msg.body)
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'SENT', sentAt: new Date() } })
      console.log(`[worker] SENT ${msg.clientCode} -> ${target}  (${sentToday + 1}/${DAILY_LIMIT} today)`)
    } catch (err) {
      if (!(await isConnected(client))) {
        // Leave it SENDING (untouchable, surfaced for manual review) — never auto-resend.
        console.error(`[worker] Send errored and session disconnected; leaving ${msg.clientCode} SENDING for review and aborting.`, err)
        await setSession({ state: 'DISCONNECTED' })
        return
      }
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'FAILED', error: String(err) } })
      console.error(`[worker] FAILED ${msg.clientCode}:`, err)
    }
```

Note: the `sentToday` count query and the daily-limit / window checks earlier in the loop are unchanged.

- [ ] **Step 3: Make the worker resident (idle instead of exiting when empty)**

In `drainQueue`, the two `return` statements for "queue empty" and "daily limit reached" currently end the process. Change them to idle-and-continue so the worker keeps the WhatsApp session alive:

Replace `if (!msg) { console.log('[worker] Queue empty. Exiting.'); return }` behavior — with the Step 2 rewrite the empty case is now `if (!candidate) { console.log('[worker] Queue empty.'); return }`. Change that `return` to:

```js
    if (!candidate) { console.log('[worker] Queue empty; idling.'); await sleep(30000); continue }
```

And change the daily-limit block to idle until the next day instead of returning:

```js
    if (sentToday >= DAILY_LIMIT) {
      console.log(`[worker] Daily limit reached (${sentToday}/${DAILY_LIMIT}); idling.`)
      await sleep(60000)
      continue
    }
```

Leave the "window closed / before window" handling as-is (it already sleeps or waits). The loop now never exits on its own — it exits only on disconnect or when the parent kills the process.

- [ ] **Step 4: Release the lease on shutdown**

In `start(client)`'s `finally` block (currently lines 163–170), add a lease release before `prisma.$disconnect()`:

```js
  } finally {
    running = false
    await setSession({ state: 'DISCONNECTED' })
    await releaseLease()
    await prisma.$disconnect()
    try { await client.kill() } catch { /* ignore */ }
    process.exit(0)
  }
```

- [ ] **Step 5: Use a writable session/data dir when the parent provides one**

In `boot()`, extend `opts` so open-wa writes its session under the Electron `userData` dir when running inside the desktop app (falls back to the default when run standalone):

```js
  const opts = {
    sessionId: 'kesar-outreach',
    headless: true,
    qrTimeout: 0,
    authTimeout: 0,
    useChrome: false,
    throwErrorOnTosBlock: false,
    disableSpins: true,
    ...(process.env.WA_USER_DATA ? { sessionDataPath: process.env.WA_USER_DATA } : {}),
    ...(process.env.WA_CHROME_PATH ? { executablePath: process.env.WA_CHROME_PATH, useChrome: true } : {}),
  }
```

- [ ] **Step 6: Manual verification (documented — no automated DB test)**

Because the only DB available is production, verify logic by inspection and a dry check:
Run: `cd worker && node -e "require('./send.js')" ` is NOT safe (it boots open-wa). Instead verify syntax only:
Run: `node --check worker/send.js`
Expected: no output (valid syntax). Full behavior is verified in Task 7's manual desktop test.

- [ ] **Step 7: Commit**

```bash
git add worker/send.js
git commit -m "feat(whatsapp): lease-gated resident worker with atomic SENDING claim

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Surface SENDING / needs-review in the campaigns API + page

**Files:**
- Modify: `src/app/api/whatsapp/campaigns/route.ts:170-183` (groupBy aggregation)
- Modify: `src/app/(protected)/whatsapp/page.tsx:39` (interface) and `:207-214` (badges)

**Interfaces:**
- Consumes: `messageStatusLabel` / `isSendingStale` (Task 1), `SENDING` status (Task 2).
- Produces: `CampaignSummary` gains `sending: number` and `needsReview: number`; the queue-status card shows them.

- [ ] **Step 1: Add sending / needs-review counts in the GET aggregation**

In `src/app/api/whatsapp/campaigns/route.ts`, the `groupBy` loop (around lines 178–183) accumulates per-campaign counts. Add `SENDING` handling. First, extend the per-campaign accumulator initialization to include `sending: 0` and `needsReview: 0`. Then in the switch add:

```ts
      else if (g.status === 'SENDING') e.sending += n
```

Then, after the groupBy loop, compute stuck (`needs-review`) counts with a targeted query (groupBy can't express the 10-min age filter). Add:

```ts
    const staleBefore = new Date(Date.now() - 600_000) // STALE_SENDING_MS
    const stuck = await prisma.whatsappMessage.groupBy({
      by: ['campaignId'],
      where: { status: 'SENDING', updatedAt: { lt: staleBefore } },
      _count: { _all: true },
    })
    for (const s of stuck) {
      const e = byCampaign.get(s.campaignId)
      if (e) e.needsReview = s._count._all
    }
```

(Use the existing `byCampaign` map variable name from the surrounding code; if it differs, match the local name already in the file.)

- [ ] **Step 2: Extend the CampaignSummary type on the page**

In `src/app/(protected)/whatsapp/page.tsx` line 39, change the interface to:

```ts
interface CampaignSummary { campaignId: string; total: number; pending: number; sending: number; sent: number; failed: number; skipped: number; needsReview: number; createdAt: string | null }
```

- [ ] **Step 3: Render the new badges**

In `src/app/(protected)/whatsapp/page.tsx`, in the per-campaign badge row (around lines 211–214), add a "sending" badge after "pending" and a prominent "needs review" badge:

```tsx
                  <Badge variant="secondary">{c.sent} sent</Badge>
                  {c.sending > 0 && <Badge variant="outline">{c.sending} sending</Badge>}
                  <Badge variant="outline">{c.pending} pending</Badge>
                  {c.failed > 0 && <Badge variant="destructive">{c.failed} failed</Badge>}
                  {c.skipped > 0 && <Badge variant="outline">{c.skipped} skipped</Badge>}
                  {c.needsReview > 0 && <Badge variant="destructive">{c.needsReview} needs review</Badge>}
```

- [ ] **Step 4: Verify build + types**

Run: `npx tsc --noEmit`
Expected: no errors related to `CampaignSummary`, `sending`, or `needsReview`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/whatsapp/campaigns/route.ts "src/app/(protected)/whatsapp/page.tsx"
git commit -m "feat(whatsapp): surface SENDING and stuck (needs-review) counts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Electron main + preload — spawn/stop the worker

**Files:**
- Modify: `electron-app/main.js` (IPC handlers + `utilityProcess.fork`)
- Modify: `electron-app/preload.js` (expose `startWhatsapp`/`stopWhatsapp`/`isDesktopApp`)

**Interfaces:**
- Consumes: the resident worker at `worker/send.js` (Task 3).
- Produces: `window.electronAPI.startWhatsapp()`, `window.electronAPI.stopWhatsapp()`, `window.electronAPI.isDesktopApp === true`.

- [ ] **Step 1: Import `utilityProcess` and add worker management to `electron-app/main.js`**

At the top of `electron-app/main.js`, change the electron require (line 2) to include `utilityProcess`:

```js
const { app, BrowserWindow, ipcMain, globalShortcut, utilityProcess } = require('electron')
```

Add near the other module-scope state (after `let isQuitting = false`, line 22):

```js
let waWorker = null

// The bundled worker + its Prisma DATABASE_URL. In a packaged app the worker lives
// under process.resourcesPath (extraResources); in dev it's the repo's worker folder.
function workerEntry() {
  const packaged = path.join(process.resourcesPath, 'worker', 'send.js')
  return fs.existsSync(packaged) ? packaged : path.join(__dirname, '..', 'worker', 'send.js')
}

// DATABASE_URL is injected at build time into config.js (see packaging task); falls
// back to the process env for dev runs.
function workerEnv() {
  let dbUrl = process.env.DATABASE_URL || ''
  try {
    const cfg = require(path.join(process.resourcesPath, 'worker-config.js'))
    if (cfg && cfg.DATABASE_URL) dbUrl = cfg.DATABASE_URL
  } catch { /* dev: no bundled config */ }
  return {
    DATABASE_URL: dbUrl,
    WA_USER_DATA: app.getPath('userData'),
    WA_MACHINE_NAME: require('os').hostname(),
    DAILY_LIMIT: process.env.DAILY_LIMIT || '30',
    GAP_MS: process.env.GAP_MS || '300000',
    JITTER_MS: process.env.JITTER_MS || '60000',
    WINDOW_START_HOUR: process.env.WINDOW_START_HOUR || '10',
    WINDOW_END_HOUR: process.env.WINDOW_END_HOUR || '16',
  }
}

function startWhatsappWorker() {
  if (waWorker) return // already running
  waWorker = utilityProcess.fork(workerEntry(), [], {
    env: { ...process.env, ...workerEnv() },
    stdio: 'inherit',
  })
  waWorker.on('exit', () => { waWorker = null })
}

function stopWhatsappWorker() {
  if (!waWorker) return
  try { waWorker.kill() } catch { /* ignore */ }
  waWorker = null
}
```

- [ ] **Step 2: Register IPC handlers**

In `electron-app/main.js`, after the existing IPC handlers (after `ipcMain.on('window-refresh', ...)`, line 127), add:

```js
ipcMain.on('whatsapp-start', () => startWhatsappWorker())
ipcMain.on('whatsapp-stop',  () => stopWhatsappWorker())
```

- [ ] **Step 3: Kill the worker on quit**

In `electron-app/main.js`, inside the `before-quit` handler's `recordAndQuit` (before `app.quit()` at line 176), add:

```js
    stopWhatsappWorker()
```

- [ ] **Step 4: Expose the API in `electron-app/preload.js`**

In `electron-app/preload.js`, extend the `exposeInMainWorld` object (lines 5–10) to:

```js
contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),
  refresh:  () => ipcRenderer.send('window-refresh'),
  isDesktopApp: true,
  startWhatsapp: () => ipcRenderer.send('whatsapp-start'),
  stopWhatsapp:  () => ipcRenderer.send('whatsapp-stop'),
})
```

- [ ] **Step 5: Syntax check**

Run: `node --check electron-app/main.js && node --check electron-app/preload.js`
Expected: no output (both valid).

- [ ] **Step 6: Commit**

```bash
git add electron-app/main.js electron-app/preload.js
git commit -m "feat(desktop): fork/stop bundled WhatsApp worker via IPC

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Package the worker + Chromium into the Electron build

**Files:**
- Modify: `electron-app/electron-builder.yml` (bundle worker, node_modules, prisma engine, Chromium)
- Modify: `electron-app/package.json` (prebuild helper)

**Interfaces:**
- Consumes: `worker/` folder with generated Prisma client (Windows engine) and installed deps (Task 2/3).
- Produces: an installer that carries the worker at `resourcesPath/worker` and a `worker-config.js` with the embedded `DATABASE_URL`.

- [ ] **Step 1: Add a prebuild script that stages the worker + config**

Create `electron-app/prepare-worker.js`:

```js
// Copies the standalone worker (code + node_modules + generated prisma client) into
// electron-app/build-resources/worker, and writes worker-config.js with the DB URL.
// The Windows Prisma engine must already be generated (worker/prisma binaryTargets).
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const src = path.join(root, 'worker')
const outRoot = path.join(__dirname, 'build-resources')
const outWorker = path.join(outRoot, 'worker')

fs.rmSync(outRoot, { recursive: true, force: true })
fs.mkdirSync(outWorker, { recursive: true })

// Copy the worker folder except its own .env (never ship a dev .env).
fs.cpSync(src, outWorker, {
  recursive: true,
  filter: (p) => path.basename(p) !== '.env',
})

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) { console.error('DATABASE_URL must be set to embed into the build'); process.exit(1) }
fs.writeFileSync(
  path.join(outRoot, 'worker-config.js'),
  `module.exports = { DATABASE_URL: ${JSON.stringify(dbUrl)} }\n`,
)
console.log('[prepare-worker] staged worker + worker-config.js')
```

- [ ] **Step 2: Wire the prebuild + resources into `electron-app/package.json`**

Change the `scripts` block in `electron-app/package.json` to:

```json
  "scripts": {
    "start": "electron .",
    "prepare-worker": "node prepare-worker.js",
    "build": "npm run prepare-worker && electron-builder --win --x64"
  },
```

- [ ] **Step 3: Add the staged resources to `electron-app/electron-builder.yml`**

In `electron-app/electron-builder.yml`, add an `extraResources` block (top level, e.g. after the `files:` list):

```yaml
extraResources:
  - from: build-resources/worker
    to: worker
  - from: build-resources/worker-config.js
    to: worker-config.js
```

- [ ] **Step 4: Ignore the staged build resources in git**

Append to `electron-app/.gitignore`:

```
build-resources/
```

- [ ] **Step 5: Verify the staging step runs (without a full Windows build)**

Run: `cd electron-app && DATABASE_URL="mysql://x:y@localhost:3306/z" node prepare-worker.js && ls build-resources && ls build-resources/worker/send.js && cd ..`
Expected: prints "staged worker...", lists `worker` and `worker-config.js`, and the `send.js` path resolves. Then clean up: `rm -rf electron-app/build-resources`.

- [ ] **Step 6: Commit**

```bash
git add electron-app/prepare-worker.js electron-app/package.json electron-app/electron-builder.yml electron-app/.gitignore
git commit -m "build(desktop): bundle WhatsApp worker + embedded DB config as extraResources

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Connect panel — desktop Connect/Disconnect + plain-browser hint

**Files:**
- Modify: `src/components/whatsapp/connect-panel.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.isDesktopApp`, `startWhatsapp()`, `stopWhatsapp()` (Task 5).
- Produces: a Connect button (desktop only) that boots the worker; a plain-browser hint elsewhere.

- [ ] **Step 1: Add a typed accessor for the Electron API**

In `src/components/whatsapp/connect-panel.tsx`, add near the top (after imports):

```tsx
type ElectronAPI = { isDesktopApp?: boolean; startWhatsapp?: () => void; stopWhatsapp?: () => void }
function electron(): ElectronAPI | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI ?? null
}
```

- [ ] **Step 2: Replace the non-connected render branch with desktop-aware UI**

In `src/components/whatsapp/connect-panel.tsx`, replace the final `else` branch (the terminal how-to `<ol>…</ol>` block, currently lines 64–82) with:

```tsx
        ) : electron()?.isDesktopApp ? (
          <div className="space-y-3">
            {data.qr ? null : (
              <>
                <p className="text-sm">Click connect, then scan the QR that appears here with the sending phone (WhatsApp → <b>Linked devices</b> → <b>Link a device</b>).</p>
                <button
                  onClick={() => electron()?.startWhatsapp?.()}
                  className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Connect WhatsApp
                </button>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              {data.state === 'CONNECTING' ? 'Starting up… the QR will appear in a few seconds.' : 'Not linked yet.'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open the <b>Kesar Securities CRM desktop app</b> on the office PC to connect WhatsApp, then click <b>Connect</b> and scan the QR.
          </p>
        )}
```

- [ ] **Step 3: Add a Disconnect button to the CONNECTED branch (desktop only)**

In `src/components/whatsapp/connect-panel.tsx`, change the CONNECTED branch (currently line 54) to include a disconnect control:

```tsx
        {data.state === 'CONNECTED' ? (
          <div className="space-y-2">
            <p className="text-sm text-green-700">Linked and ready — queued messages will send from this PC.</p>
            {electron()?.isDesktopApp && (
              <button
                onClick={() => electron()?.stopWhatsapp?.()}
                className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Disconnect
              </button>
            )}
          </div>
        ) : data.qr ? (
```

- [ ] **Step 4: Verify types + lint build**

Run: `npx tsc --noEmit && npx next lint --file src/components/whatsapp/connect-panel.tsx`
Expected: no type errors; lint clean (or only pre-existing warnings).

- [ ] **Step 5: Commit**

```bash
git add src/components/whatsapp/connect-panel.tsx
git commit -m "feat(whatsapp): in-desktop-app Connect/Disconnect buttons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Full manual desktop verification (end-to-end)**

On a Windows office PC with the newly built installer:
1. Install and launch the desktop app; log into the CRM; open the WhatsApp page.
2. Click **Connect WhatsApp** → confirm a QR appears in the panel within a few seconds.
3. Scan with the sending phone → badge turns **Connected**.
4. Queue a small test campaign → confirm exactly one test message sends and the campaign shows `1 sent`.
5. Open the desktop app on a **second** PC, click Connect → confirm it does NOT double-send (its logs show "Another machine holds the sender lease").
6. Click **Disconnect** → badge returns to Disconnected; the WhatsApp link persists (reconnect needs no re-scan).

---

## Self-Review

**1. Spec coverage:**
- One-click Connect in desktop app → Task 5 (IPC/fork) + Task 7 (button). ✓
- QR shown in-app → existing panel poll + Task 7. ✓
- Runs with Electron's built-in Node, no npm install → Task 5 (`utilityProcess.fork`). ✓
- Direct DB, embedded URL → Task 6 (`worker-config.js`). ✓
- `SENDING` status + `WhatsappSenderLease` → Task 2. ✓
- Single-sender lease (acquire/renew/expire) → Task 1 (logic) + Task 3 (wiring). ✓
- Atomic per-message claim → Task 3 Step 2. ✓
- Stale SENDING surfaced, never auto-retried → Task 3 (no reset) + Task 4 (needs-review badge). ✓
- Resident worker (idle, keep session) → Task 3 Step 3. ✓
- Plain-browser hint (no terminal instructions) → Task 7 Step 2. ✓
- Bundle Chromium + Windows Prisma engine → Task 2 (binaryTargets) + Task 6 (extraResources). ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code. Manual-verification steps are explicitly labeled where automated DB tests are impossible (prod-only DB).

**3. Type consistency:** `holderId`/`holderName`/`expiresAt` consistent across Task 1 helper, Task 2 schema, Task 3 worker. `sending`/`needsReview` fields consistent across Task 4 route and page. `startWhatsapp`/`stopWhatsapp`/`isDesktopApp` consistent across Task 5 preload and Task 7 consumer.

**Note for the executor:** Task 2 Step 6 and Task 7 Step 6 touch production (DB push) and require a real Windows PC + phone (manual). Pause for user authorization at Task 2 Step 6.

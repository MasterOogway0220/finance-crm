# WhatsApp Do-Not-Contact (Opt-Out) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Never message a number that has opted out — staff manage a Do-Not-Contact list and the office-PC bridge auto-adds anyone who replies "STOP".

**Architecture:** New `WhatsappOptOut` table. Queue-time filter in the campaigns route drops opted-out CONTACT recipients (groups unaffected); the bridge double-checks at send time and auto-adds STOP repliers via `onMessage`. Pure helpers keep the logic unit-testable.

**Tech Stack:** Next.js 16, Prisma 6/MySQL, next-auth v5, shadcn/ui + sonner, vitest; open-wa bridge.

## Global Constraints

- API gated by `canSendWhatsapp`; shape `{success,data?,error?}`; `logActivity(module:'WHATSAPP')`; zod validation.
- Phones stored/compared as normalized `91…` via `normalizeWhatsappPhone`. Opt-out applies to CONTACT targets only.
- Worker stays tsc/eslint-excluded; bridge tasks structure-verified (`node --check`), validated on the office PC.
- `prisma db push` is a deferred, owner-approved deploy step.

---

## File Structure
- **Modify** `prisma/schema.prisma`, `worker/prisma/schema.prisma` — `WhatsappOptOut` model + `WhatsappOptOutSource` enum.
- **Modify** `src/lib/whatsapp-outreach.ts` (+ `.test.ts`) — `isOptOutMessage`, `filterOptedOut`.
- **Create** `src/app/api/whatsapp/opt-outs/route.ts` (GET/POST) + `src/app/api/whatsapp/opt-outs/[id]/route.ts` (DELETE).
- **Modify** `src/app/api/whatsapp/campaigns/route.ts` — queue-time filter + `skippedOptedOut`.
- **Create** `src/components/whatsapp/opt-out-manager.tsx`; **Modify** `src/app/(protected)/whatsapp/page.tsx` — button + toast.
- **Modify** `worker/send.js` — send-time skip + `onMessage` auto-STOP.

---

### Task 1: Data model

**Files:** Modify `prisma/schema.prisma`, `worker/prisma/schema.prisma`

**Produces:** `enum WhatsappOptOutSource { STOP MANUAL }`; `model WhatsappOptOut { id, phone @unique, source @default(MANUAL), reason?, createdById?, createdAt }`.

- [ ] **Step 1: Add to `prisma/schema.prisma`** (after the `WhatsappTargetType` enum):
```prisma
enum WhatsappOptOutSource {
  STOP
  MANUAL
}

model WhatsappOptOut {
  id          String               @id @default(cuid())
  phone       String               @unique
  source      WhatsappOptOutSource @default(MANUAL)
  reason      String?
  createdById String?
  createdAt   DateTime             @default(now())

  @@index([createdAt])
}
```
- [ ] **Step 2: Mirror in `worker/prisma/schema.prisma`** — same enum + model, adding `@@map("WhatsappOptOut")`.
- [ ] **Step 3:** `npx prisma generate && npx tsc --noEmit 2>&1 | grep -v -E "brokerage-archive|session/link" | grep "error TS"` → no output.
- [ ] **Step 4:** `git add prisma/schema.prisma worker/prisma/schema.prisma && git commit -m "feat(whatsapp): WhatsappOptOut data model"`

---

### Task 2: Pure helpers (TDD)

**Files:** Modify `src/lib/whatsapp-outreach.ts`, `src/lib/whatsapp-outreach.test.ts`

**Produces:** `isOptOutMessage(body: string): boolean`; `filterOptedOut<T extends { phone: string; targetType: 'CONTACT' | 'GROUP' }>(rows: T[], optedOut: Set<string>): { kept: T[]; skippedOptedOut: number }`.

- [ ] **Step 1: Append tests** to `src/lib/whatsapp-outreach.test.ts`:
```ts
import { isOptOutMessage, filterOptedOut } from './whatsapp-outreach'

describe('isOptOutMessage', () => {
  it('matches opt-out keywords, case/space-insensitive', () => {
    expect(isOptOutMessage('STOP')).toBe(true)
    expect(isOptOutMessage('  stop ')).toBe(true)
    expect(isOptOutMessage('Unsubscribe')).toBe(true)
    expect(isOptOutMessage('please REMOVE me')).toBe(true)
    expect(isOptOutMessage('opt out')).toBe(true)
  })
  it('does not match normal messages', () => {
    expect(isOptOutMessage('hello, I want to invest')).toBe(false)
    expect(isOptOutMessage('')).toBe(false)
    expect(isOptOutMessage('stopwatch')).toBe(false)
  })
})

describe('filterOptedOut', () => {
  const rows = [
    { phone: '9876543210', targetType: 'CONTACT' as const },
    { phone: '9811111111', targetType: 'CONTACT' as const },
    { phone: '', targetType: 'GROUP' as const },
  ]
  it('drops CONTACT rows whose normalized phone is opted out; keeps groups', () => {
    const r = filterOptedOut(rows, new Set(['919876543210']))
    expect(r.skippedOptedOut).toBe(1)
    expect(r.kept.map((x) => x.phone)).toEqual(['9811111111', ''])
  })
  it('keeps everything when the set is empty', () => {
    const r = filterOptedOut(rows, new Set())
    expect(r.skippedOptedOut).toBe(0)
    expect(r.kept).toHaveLength(3)
  })
})
```
- [ ] **Step 2:** `npx vitest run src/lib/whatsapp-outreach.test.ts` → FAIL (functions not defined).
- [ ] **Step 3: Append to `src/lib/whatsapp-outreach.ts`:**
```ts
const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'OPT OUT', 'OPTOUT', 'REMOVE', 'CANCEL']

/** True when an inbound message body signals an opt-out (whole-word / prefix match, case-insensitive). */
export function isOptOutMessage(body: string): boolean {
  const text = (body || '').trim().toUpperCase()
  if (!text) return false
  return OPT_OUT_KEYWORDS.some((kw) => text === kw || text.startsWith(kw + ' ') || text.includes(' ' + kw))
}

/** Drop CONTACT rows whose normalized phone is opted out; GROUP rows and unnormalizable phones are always kept. */
export function filterOptedOut<T extends { phone: string; targetType: 'CONTACT' | 'GROUP' }>(
  rows: T[], optedOut: Set<string>,
): { kept: T[]; skippedOptedOut: number } {
  const kept: T[] = []
  let skippedOptedOut = 0
  for (const row of rows) {
    if (row.targetType === 'CONTACT') {
      const n = normalizeWhatsappPhone(row.phone)
      if (n && optedOut.has(n)) { skippedOptedOut++; continue }
    }
    kept.push(row)
  }
  return { kept, skippedOptedOut }
}
```
- [ ] **Step 4:** `npx vitest run src/lib/whatsapp-outreach.test.ts` → PASS.
- [ ] **Step 5:** `git add src/lib/whatsapp-outreach.ts src/lib/whatsapp-outreach.test.ts && git commit -m "feat(whatsapp): isOptOutMessage + filterOptedOut helpers"`

---

### Task 3: Opt-out API

**Files:** Create `src/app/api/whatsapp/opt-outs/route.ts`, `src/app/api/whatsapp/opt-outs/[id]/route.ts`

**Produces:** `GET /api/whatsapp/opt-outs?search=` → `{ success, data: { optOuts: {id,phone,source,reason,createdAt}[] } }`; `POST {phone,reason?}` → row; `DELETE /[id]`.

- [ ] **Step 1: `src/app/api/whatsapp/opt-outs/route.ts`:**
```ts
import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canSendWhatsapp } from '@/lib/roles'
import { logActivity } from '@/lib/activity-log'
import { normalizeWhatsappPhone } from '@/lib/whatsapp-outreach'
import { z } from 'zod'

const addSchema = z.object({ phone: z.string().min(1), reason: z.string().optional() })

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    const search = new URL(request.url).searchParams.get('search')
    const optOuts = await prisma.whatsappOptOut.findMany({
      where: search ? { OR: [{ phone: { contains: search } }, { reason: { contains: search } }] } : undefined,
      orderBy: { createdAt: 'desc' },
      select: { id: true, phone: true, source: true, reason: true, createdAt: true },
    })
    return NextResponse.json({ success: true, data: { optOuts } })
  } catch (error) {
    console.error('[GET /api/whatsapp/opt-outs]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    const parsed = addSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 })
    const phone = normalizeWhatsappPhone(parsed.data.phone)
    if (!phone) return NextResponse.json({ success: false, error: 'Invalid phone number' }, { status: 400 })
    const reason = parsed.data.reason?.trim() || null
    const row = await prisma.whatsappOptOut.upsert({
      where: { phone },
      update: { reason, source: 'MANUAL', createdById: session.user.id },
      create: { phone, reason, source: 'MANUAL', createdById: session.user.id },
      select: { id: true, phone: true, source: true, reason: true, createdAt: true },
    })
    await logActivity({ userId: session.user.id, action: 'CREATE', module: 'WHATSAPP', details: `Added ${phone} to Do-Not-Contact` })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/whatsapp/opt-outs]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```
- [ ] **Step 2: `src/app/api/whatsapp/opt-outs/[id]/route.ts`:**
```ts
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
```
- [ ] **Step 3:** `npx tsc --noEmit 2>&1 | grep -v -E "brokerage-archive|session/link" | grep "error TS"` → none. Commit: `git add src/app/api/whatsapp/opt-outs && git commit -m "feat(whatsapp): opt-out list API (list/add/remove)"`

---

### Task 4: Queue-time enforcement in campaigns

**Files:** Modify `src/app/api/whatsapp/campaigns/route.ts`

**Consumes:** `filterOptedOut` (Task 2), `WhatsappOptOut` (Task 1).

- [ ] **Step 1:** Import `filterOptedOut` (add to the existing `@/lib/whatsapp-outreach` import). After the group loop (just before `if (rows.length === 0)`), insert:
```ts
    // Drop opted-out contacts (Do-Not-Contact). Groups are never filtered.
    const contactPhones = rows
      .filter((r) => r.targetType === 'CONTACT')
      .map((r) => normalizeWhatsappPhone(r.phone))
      .filter((p): p is string => !!p)
    const optedOutRows = contactPhones.length
      ? await prisma.whatsappOptOut.findMany({ where: { phone: { in: contactPhones } }, select: { phone: true } })
      : []
    const optedOutSet = new Set(optedOutRows.map((o) => o.phone))
    const { kept: finalRows, skippedOptedOut } = filterOptedOut(rows, optedOutSet)
```
- [ ] **Step 2:** Replace the remaining uses of `rows` with `finalRows` and add `skippedOptedOut` to the response/log/empty-message:
```ts
    if (finalRows.length === 0) {
      return NextResponse.json({ success: false, error: `No valid recipients (skipped ${skippedInvalid} invalid, ${skippedDuplicate} duplicate, ${skippedMissing} missing, ${skippedOptedOut} opted-out).` }, { status: 400 })
    }

    await prisma.whatsappMessage.createMany({ data: finalRows })
    await logActivity({
      userId: session.user.id,
      action: 'QUEUE',
      module: 'WHATSAPP',
      details: `Queued ${finalRows.length} WhatsApp messages (campaign ${campaignId}). Skipped ${skippedInvalid} invalid, ${skippedDuplicate} duplicate, ${skippedMissing} missing, ${skippedOptedOut} opted-out.`,
    })

    return NextResponse.json({ success: true, data: { campaignId, queued: finalRows.length, skippedInvalid, skippedDuplicate, skippedMissing, skippedOptedOut } })
```
- [ ] **Step 3:** `npx tsc --noEmit 2>&1 | grep -v -E "brokerage-archive|session/link" | grep "error TS"` → none. Commit: `git add src/app/api/whatsapp/campaigns/route.ts && git commit -m "feat(whatsapp): filter opted-out contacts at queue time"`

---

### Task 5: UI — Do-Not-Contact manager + page wiring

**Files:** Create `src/components/whatsapp/opt-out-manager.tsx`; Modify `src/app/(protected)/whatsapp/page.tsx`

- [ ] **Step 1: `src/components/whatsapp/opt-out-manager.tsx`:**
```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trash2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/use-debounce'

interface OptOut { id: string; phone: string; source: 'STOP' | 'MANUAL'; reason: string | null; createdAt: string }

export function OptOutManager({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [items, setItems] = useState<OptOut[]>([])
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 400)
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    const q = search ? `?search=${encodeURIComponent(search)}` : ''
    fetch(`/api/whatsapp/opt-outs${q}`).then((r) => r.json()).then((d) => { if (d.success) setItems(d.data.optOuts) }).catch(() => {})
  }, [search])
  useEffect(() => { if (open) load() }, [open, load])

  const add = async () => {
    if (!phone.trim()) { toast.error('Enter a phone number'); return }
    setAdding(true)
    try {
      const d = await (await fetch('/api/whatsapp/opt-outs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, reason }),
      })).json()
      if (d.success) { toast.success('Added to Do-Not-Contact'); setPhone(''); setReason(''); load() }
      else toast.error(d.error || 'Failed to add')
    } catch { toast.error('Failed to add') } finally { setAdding(false) }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Remove this number from Do-Not-Contact? They may be messaged again.')) return
    setBusyId(id)
    try {
      const d = await (await fetch(`/api/whatsapp/opt-outs/${id}`, { method: 'DELETE' })).json()
      if (d.success) { toast.success('Removed'); load() } else toast.error(d.error || 'Failed to remove')
    } catch { toast.error('Failed to remove') } finally { setBusyId(null) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Do-Not-Contact list</DialogTitle>
          <DialogDescription>These numbers are never messaged. People who reply STOP are added automatically.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add a number</div>
          <div className="flex flex-wrap gap-2">
            <Input className="w-48" placeholder="Phone e.g. 9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input className="flex-1 min-w-40" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" onClick={add} disabled={adding}>{adding ? 'Adding…' : 'Add'}</Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search phone or reason…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <div className="space-y-1">
          <div className="text-sm font-medium">Numbers ({items.length})</div>
          {items.length === 0 && <p className="text-sm text-muted-foreground">No opted-out numbers.</p>}
          {items.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{o.phone}</span>
                <Badge variant={o.source === 'STOP' ? 'secondary' : 'outline'}>{o.source}</Badge>
                {o.reason && <span className="text-xs text-muted-foreground">{o.reason}</span>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(o.id)} disabled={busyId === o.id} aria-label="Remove"><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```
- [ ] **Step 2: Wire into `page.tsx`:** import `OptOutManager`; add `const [optOutOpen, setOptOutOpen] = useState(false)`; add a **Do-Not-Contact** button next to "Manage templates" (`<Button type="button" variant="outline" size="sm" onClick={() => setOptOutOpen(true)}>Do-Not-Contact</Button>`); mount `<OptOutManager open={optOutOpen} onOpenChange={setOptOutOpen} />` beside `<TemplatesManager .../>`; and extend the success toast to append opted-out: change the `missing` line to also compute `const optedOut = d.data.skippedOptedOut ? \`, ${d.data.skippedOptedOut} opted-out\` : ''` and include `${optedOut}` in the toast string.
- [ ] **Step 3:** `npx tsc --noEmit 2>&1 | grep -v -E "brokerage-archive|session/link" | grep "error TS"` → none; `npx eslint "src/components/whatsapp/opt-out-manager.tsx" "src/app/(protected)/whatsapp/page.tsx"` → exit 0. Commit: `git add "src/components/whatsapp/opt-out-manager.tsx" "src/app/(protected)/whatsapp/page.tsx" && git commit -m "feat(whatsapp): Do-Not-Contact manager UI + opted-out toast"`

---

### Task 6: Bridge — send-time skip + auto-STOP

**Files:** Modify `worker/send.js` (structure-verified only)

- [ ] **Step 1: Add a worker-local `isOptOutMessage`** (mirror of the lib) near `normalizeWhatsappPhone`:
```js
const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'OPT OUT', 'OPTOUT', 'REMOVE', 'CANCEL']
function isOptOutMessage(body) {
  const text = String(body || '').trim().toUpperCase()
  if (!text) return false
  return OPT_OUT_KEYWORDS.some((kw) => text === kw || text.startsWith(kw + ' ') || text.includes(' ' + kw))
}
```
- [ ] **Step 2: Send-time skip.** In `drainQueue`, replace the target/skip block so CONTACT targets are checked against the opt-out table before sending:
```js
    const normalised = msg.targetType === 'GROUP' ? null : normalizeWhatsappPhone(msg.phone)
    const target = msg.targetType === 'GROUP' ? (msg.targetId || null) : (normalised ? `${normalised}@c.us` : null)

    if (!target) {
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'SKIPPED', error: 'Invalid target' } })
      console.log(`[worker] SKIPPED ${msg.clientCode} (invalid target)`)
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
```
(This replaces the existing `const target = msg.targetType === 'GROUP' ? ... ` block and its `if (!target)` skip.)
- [ ] **Step 3: Auto-STOP.** In `start(client)`, right after `running = true`, register once:
```js
  client.onMessage(async (message) => {
    try {
      if (message.isGroupMsg) return
      if (!isOptOutMessage(message.body)) return
      const from = String(message.from || '').replace('@c.us', '')
      const phone = normalizeWhatsappPhone(from)
      if (!phone) return
      await prisma.whatsappOptOut.upsert({ where: { phone }, update: {}, create: { phone, source: 'STOP' } })
      console.log(`[worker] Auto opt-out (STOP) from ${phone}`)
    } catch (e) { console.error('[worker] onMessage opt-out failed', e) }
  })
```
- [ ] **Step 4:** `node --check worker/send.js` → clean. Commit: `git add worker/send.js && git commit -m "feat(whatsapp): bridge honours + auto-adds opt-outs (send-time skip + STOP)"`

---

### Task 7: Verify + deploy
- [ ] `npx tsc --noEmit 2>&1 | grep -v -E "brokerage-archive|session/link" | grep "error TS"` → none.
- [ ] `npm test` → all green (adds isOptOutMessage/filterOptedOut tests).
- [ ] `npm run build` → Compiled successfully. `node --check worker/send.js` → clean.
- [ ] **Deploy (owner-approved):** preview diff → `npx prisma db push` (adds `WhatsappOptOut` + enum) → push `master`. Office PC: `cd worker && npm install` to regenerate its client.

## Self-review
- Spec §2 model → T1; §3 API → T3; §4 queue enforcement → T2+T4; §5 auto-STOP → T6; §6 UI → T5; §7 tests → T2+T7. All covered.

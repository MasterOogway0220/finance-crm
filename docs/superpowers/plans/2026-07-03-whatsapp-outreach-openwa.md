# WhatsApp Outreach (open-wa) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin pick inactive/non-traded clients, write one message, and queue it in the DB; an office-PC open-wa worker drains the queue at ~30/day during office hours.

**Architecture:** All campaign state lives in the always-on Hostinger MySQL DB as `WhatsappMessage` rows (status PENDING→SENT/FAILED/SKIPPED). The Next.js app (on Vercel) provides an admin page + API to compute the audience and queue rows. A **separate, self-contained CommonJS `worker/`** (NOT built or deployed with the app) runs on an office PC, logs into WhatsApp once via `@open-wa/wa-automate`, and sends ≤30/day between 10:00–16:00 IST, resuming across days.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 6 / MySQL, next-auth v5, shadcn/ui + sonner + zustand, vitest (node). Worker: Node + `@open-wa/wa-automate` + its own `@prisma/client`.

## Global Constraints

- **Free + ban-safe:** worker only ever calls `sendText` to our own clients; no image/story/group features; low daily cap; office-hours-only; random gaps.
- **Worker isolation:** the `worker/` folder MUST be in `tsconfig.json` `exclude`. Its deps (`@open-wa/wa-automate`, `@prisma/client`, `prisma`, `dotenv`) live ONLY in `worker/package.json` — NEVER in root `package.json` (would break the Vercel build).
- **Roles:** all whatsapp API routes gate `auth()` + `getActiveRole(session.user)` + `isManager(role)` (SUPER_ADMIN/ADMIN only; CHARTERED_ACCOUNTANT excluded). The page redirects non-`['ADMIN','SUPER_ADMIN']` roles to `/dashboard`.
- **API shape:** `{ success, data?, error? }`; try/catch with `console.error('[METHOD /path]', e)` + 500 fallback; zod inline validation. Mirror `src/app/api/clients/bulk/route.ts`.
- **DB migration:** repo uses `prisma db push` (not migrations). The `db push` itself is a DEFERRED deploy step needing owner approval — NOT part of coding tasks.
- **Phone normalisation (canonical):** strip non-digits; 12 digits starting `91` → drop the `91`; must then be exactly 10 digits; reject `0000000000`; return `91`+10digits. Placeholder `910000000000` therefore rejected.
- **logActivity signature:** `logActivity({ userId, action, module, details? })` — note `userId` (NOT `createdById`).

---

## File Structure

- **Create** `src/lib/whatsapp-outreach.ts` — pure helpers: `normalizeWhatsappPhone`, `personalizeMessage`, `dedupeAudienceByPhone`, `Segment` type. Reused by both API routes.
- **Create** `src/lib/whatsapp-outreach.test.ts` — vitest unit tests for the above.
- **Modify** `prisma/schema.prisma` — add `WhatsappStatus` enum + `WhatsappMessage` model (no relation on `Client`).
- **Modify** `tsconfig.json` — add `"worker"` to `exclude`.
- **Create** `src/app/api/whatsapp/audience/route.ts` — `GET` audience (segments, search, pagination, `idsOnly`).
- **Create** `src/app/api/whatsapp/campaigns/route.ts` — `POST` (queue) + `GET` (status).
- **Create** `src/app/(protected)/whatsapp/page.tsx` — admin UI.
- **Modify** `src/components/layout/sidebar.tsx` — add WhatsApp nav item; exclude it for CA.
- **Create** `worker/package.json`, `worker/prisma/schema.prisma`, `worker/send.js`, `worker/.env.example`, `worker/.gitignore`, `worker/README.md`.

**Worker Prisma note (intentional deviation from spec §9):** instead of `prisma generate --schema=../prisma/schema.prisma` (which resolves the generated-client output ambiguously across the two node_modules), the worker keeps a **minimal own schema** containing only the `WhatsappMessage` model + enum, `@@map("WhatsappMessage")` to the same table, and generates into its own `node_modules`. Fully self-contained; no cross-package client-resolution surprises.

---

### Task 1: Pure outreach helpers (TDD)

**Files:**
- Create: `src/lib/whatsapp-outreach.ts`
- Test: `src/lib/whatsapp-outreach.test.ts`

**Interfaces:**
- Produces: `normalizeWhatsappPhone(raw: string | null | undefined): string | null` (returns `91XXXXXXXXXX` or null); `personalizeMessage(template: string, firstName: string): string`; `dedupeAudienceByPhone<T extends { phone: string; department: string }>(records: T[]): T[]`; `type Segment = 'all' | 'equity' | 'mf' | 'dormant2m'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/whatsapp-outreach.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeWhatsappPhone, personalizeMessage, dedupeAudienceByPhone } from './whatsapp-outreach'

describe('normalizeWhatsappPhone', () => {
  it('prefixes 91 to a bare 10-digit number', () => {
    expect(normalizeWhatsappPhone('9876543210')).toBe('919876543210')
  })
  it('keeps an already 91-prefixed 12-digit number', () => {
    expect(normalizeWhatsappPhone('919876543210')).toBe('919876543210')
  })
  it('strips spaces, dashes and +', () => {
    expect(normalizeWhatsappPhone('+91 98765-43210')).toBe('919876543210')
  })
  it('rejects the placeholder numbers', () => {
    expect(normalizeWhatsappPhone('0000000000')).toBeNull()
    expect(normalizeWhatsappPhone('910000000000')).toBeNull()
  })
  it('rejects wrong-length / empty / null / undefined', () => {
    expect(normalizeWhatsappPhone('12345')).toBeNull()
    expect(normalizeWhatsappPhone('')).toBeNull()
    expect(normalizeWhatsappPhone(null)).toBeNull()
    expect(normalizeWhatsappPhone(undefined)).toBeNull()
  })
})

describe('personalizeMessage', () => {
  it('replaces every {{name}} token', () => {
    expect(personalizeMessage('Hi {{name}}, welcome {{name}}', 'Rahul')).toBe('Hi Rahul, welcome Rahul')
  })
  it('leaves a template without tokens unchanged', () => {
    expect(personalizeMessage('Hello there', 'Rahul')).toBe('Hello there')
  })
})

describe('dedupeAudienceByPhone', () => {
  it('drops invalid phones', () => {
    expect(dedupeAudienceByPhone([{ id: '1', phone: '0000000000', department: 'EQUITY' }])).toEqual([])
  })
  it('prefers the EQUITY record over MF for the same phone', () => {
    const out = dedupeAudienceByPhone([
      { id: 'mf1', phone: '9876543210', department: 'MUTUAL_FUND' },
      { id: 'eq1', phone: '9876543210', department: 'EQUITY' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('eq1')
  })
  it('keeps distinct phones', () => {
    const out = dedupeAudienceByPhone([
      { id: 'a', phone: '9876543210', department: 'EQUITY' },
      { id: 'b', phone: '9811111111', department: 'MUTUAL_FUND' },
    ])
    expect(out).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/whatsapp-outreach.test.ts`
Expected: FAIL — cannot resolve `./whatsapp-outreach`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/whatsapp-outreach.ts
/**
 * Pure helpers for the inactive-client WhatsApp outreach feature.
 * Shared by the audience/campaign API routes. The office-PC worker keeps its
 * own CommonJS copy of normalizeWhatsappPhone (it cannot import from '@/lib').
 */

export type Segment = 'all' | 'equity' | 'mf' | 'dormant2m'

/** Normalise an Indian phone to WhatsApp's 12-digit `91XXXXXXXXXX` form; null if invalid/placeholder. */
export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length !== 10) return null
  if (d === '0000000000') return null
  return `91${d}`
}

/** Replace every {{name}} token with the client's first name. */
export function personalizeMessage(template: string, firstName: string): string {
  return template.replaceAll('{{name}}', firstName)
}

/**
 * Dedupe audience records by normalised phone, preferring the EQUITY record when
 * the same phone exists in both departments. Drops invalid phones. Stable within a department.
 */
export function dedupeAudienceByPhone<T extends { phone: string; department: string }>(records: T[]): T[] {
  const equity = records.filter((r) => r.department === 'EQUITY')
  const others = records.filter((r) => r.department !== 'EQUITY')
  const ordered = [...equity, ...others]
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of ordered) {
    const p = normalizeWhatsappPhone(r.phone)
    if (!p) continue
    if (seen.has(p)) continue
    seen.add(p)
    out.push(r)
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/whatsapp-outreach.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp-outreach.ts src/lib/whatsapp-outreach.test.ts
git commit -m "feat(whatsapp): pure outreach helpers (phone normalise, personalise, dedupe)"
```

---

### Task 2: Prisma model + worker exclude

**Files:**
- Modify: `prisma/schema.prisma` (append enum + model)
- Modify: `tsconfig.json` (`exclude`)

**Interfaces:**
- Produces: Prisma model `WhatsappMessage` with fields `{ id, campaignId, clientId?, clientCode, clientName, phone, body, status: WhatsappStatus=PENDING, error?, sentAt?, createdById, createdAt, updatedAt }`; enum `WhatsappStatus { PENDING SENT FAILED SKIPPED }`. Consumed by Tasks 4 & 6.

- [ ] **Step 1: Append the enum + model to `prisma/schema.prisma`**

```prisma
enum WhatsappStatus {
  PENDING
  SENT
  FAILED
  SKIPPED
}

model WhatsappMessage {
  id          String         @id @default(cuid())
  campaignId  String
  clientId    String?
  clientCode  String
  clientName  String
  phone       String
  body        String         @db.Text
  status      WhatsappStatus @default(PENDING)
  error       String?        @db.Text
  sentAt      DateTime?
  createdById String
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@index([status])
  @@index([campaignId])
  @@index([sentAt])
}
```

- [ ] **Step 2: Add `"worker"` to `tsconfig.json` exclude**

Change `"exclude": ["node_modules"]` → `"exclude": ["node_modules", "worker"]`.

- [ ] **Step 3: Generate the Prisma client (no DB write)**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" — `prisma.whatsappMessage` now typed. (Do NOT run `db push` — that is a deferred deploy step.)

- [ ] **Step 4: Verify the app still type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma tsconfig.json
git commit -m "feat(whatsapp): add WhatsappMessage model + enum; exclude worker/ from tsc"
```

---

### Task 3: Audience API (`GET /api/whatsapp/audience`)

**Files:**
- Create: `src/app/api/whatsapp/audience/route.ts`

**Interfaces:**
- Consumes: `dedupeAudienceByPhone`, `normalizeWhatsappPhone`, `Segment` (Task 1); `prisma` `@/lib/prisma`; `auth`, `getActiveRole` `@/lib/auth`; `isManager` `@/lib/roles`.
- Produces: `GET` returns — if `idsOnly=true`: `{ success, data: { ids: string[] } }`; else `{ success, data: { clients: { id, clientCode, name, phone, department }[], total } }`. Consumed by the page (Task 5).

- [ ] **Step 1: Write the route**

```ts
// src/app/api/whatsapp/audience/route.ts
import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/roles'
import { dedupeAudienceByPhone, normalizeWhatsappPhone, type Segment } from '@/lib/whatsapp-outreach'
import { Prisma } from '@prisma/client'

const AUDIENCE_SELECT = {
  id: true, clientCode: true, firstName: true, middleName: true, lastName: true, phone: true, department: true,
} satisfies Prisma.ClientSelect

function segmentWhere(segment: Segment, search: string | null): { equity?: Prisma.ClientWhereInput; mf?: Prisma.ClientWhereInput } {
  const now = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const searchOR: Prisma.ClientWhereInput = search
    ? { OR: [
        { clientCode: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
      ] }
    : {}
  const equityInactive: Prisma.ClientWhereInput = { department: 'EQUITY', status: 'NOT_TRADED', ...searchOR }
  const mfInactive: Prisma.ClientWhereInput = { department: 'MUTUAL_FUND', mfStatus: 'INACTIVE', ...searchOR }
  const dormant: Prisma.ClientWhereInput = {
    department: 'EQUITY',
    NOT: { brokerageDetails: { some: { brokerage: { isActive: true, uploadDate: { gte: cutoff } } } } },
    ...searchOR,
  }
  switch (segment) {
    case 'equity': return { equity: equityInactive }
    case 'mf': return { mf: mfInactive }
    case 'dormant2m': return { equity: dormant }
    case 'all':
    default: return { equity: equityInactive, mf: mfInactive }
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const role = await getActiveRole(session.user)
    if (!isManager(role)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const segment = (searchParams.get('segment') ?? 'all') as Segment
    const search = searchParams.get('search')
    const idsOnly = searchParams.get('idsOnly') === 'true'
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '25'))

    const where = segmentWhere(segment, search)
    const [equityRecs, mfRecs] = await Promise.all([
      where.equity ? prisma.client.findMany({ where: where.equity, select: AUDIENCE_SELECT }) : Promise.resolve([]),
      where.mf ? prisma.client.findMany({ where: where.mf, select: AUDIENCE_SELECT }) : Promise.resolve([]),
    ])

    const deduped = dedupeAudienceByPhone([...equityRecs, ...mfRecs])

    if (idsOnly) {
      return NextResponse.json({ success: true, data: { ids: deduped.map((c) => c.id) } })
    }

    const total = deduped.length
    const start = (page - 1) * limit
    const pageItems = deduped.slice(start, start + limit).map((c) => ({
      id: c.id,
      clientCode: c.clientCode,
      name: [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' '),
      phone: normalizeWhatsappPhone(c.phone),
      department: c.department,
    }))

    return NextResponse.json({ success: true, data: { clients: pageItems, total } })
  } catch (error) {
    console.error('[GET /api/whatsapp/audience]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/whatsapp/audience/route.ts
git commit -m "feat(whatsapp): audience API (segments, search, dedupe, idsOnly)"
```

---

### Task 4: Campaigns API (`POST` queue + `GET` status)

**Files:**
- Create: `src/app/api/whatsapp/campaigns/route.ts`

**Interfaces:**
- Consumes: `normalizeWhatsappPhone`, `personalizeMessage` (Task 1); `prisma.whatsappMessage` (Task 2); `logActivity` `@/lib/activity-log`; `isManager`.
- Produces: `POST` `{ clientIds: string[], message: string }` → `{ success, data: { campaignId, queued, skippedInvalid, skippedDuplicate } }`. `GET` → `{ success, data: { sentToday, pendingTotal, campaigns: { campaignId, total, pending, sent, failed, skipped, createdAt }[] } }`. Consumed by the page (Task 5).

- [ ] **Step 1: Write the route**

```ts
// src/app/api/whatsapp/campaigns/route.ts
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/whatsapp/campaigns/route.ts
git commit -m "feat(whatsapp): campaigns API (queue POST + status GET)"
```

---

### Task 5: Admin page + sidebar nav

**Files:**
- Create: `src/app/(protected)/whatsapp/page.tsx`
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/whatsapp/audience`, `POST`/`GET /api/whatsapp/campaigns` (Tasks 3–4); shadcn `button/input/textarea/checkbox/card/badge/select/table/alert-dialog`; `useDebounce`; `toast`.

- [ ] **Step 1: Create the page**

```tsx
// src/app/(protected)/whatsapp/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MessageCircle, Search, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/use-debounce'

const SEGMENTS = [
  { value: 'all', label: 'All inactive' },
  { value: 'equity', label: 'Equity — not traded' },
  { value: 'mf', label: 'MF — inactive' },
  { value: 'dormant2m', label: 'Dormant 2+ months (equity)' },
]

const DEFAULT_TEMPLATE =
  `Hi {{name}}, this is Kesar Securities. We noticed it's been a while since your last activity. ` +
  `We'd love to help you get back on track with your investments — reply to this message and our team will assist you.\n\nReply STOP to opt out.`

interface AudienceClient { id: string; clientCode: string; name: string; phone: string | null; department: string }
interface CampaignSummary { campaignId: string; total: number; pending: number; sent: number; failed: number; skipped: number; createdAt: string | null }

const LIMIT = 25

export default function WhatsAppOutreachPage() {
  const { data: session } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (session?.user) {
      const role = session.user.role
      const secondaryRole = session.user.secondaryRole
      const allowed = ['ADMIN', 'SUPER_ADMIN']
      if (!allowed.includes(role) && (!secondaryRole || !allowed.includes(secondaryRole))) {
        router.replace('/dashboard')
      }
    }
  }, [session, router])

  const [status, setStatus] = useState<{ sentToday: number; pendingTotal: number; campaigns: CampaignSummary[] } | null>(null)
  const refreshStatus = useCallback(() => {
    fetch('/api/whatsapp/campaigns').then((r) => r.json()).then((d) => { if (d.success) setStatus(d.data) }).catch(() => {})
  }, [])
  useEffect(() => { refreshStatus() }, [refreshStatus])

  const [segment, setSegment] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 400)
  const [clients, setClients] = useState<AudienceClient[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectingAll, setSelectingAll] = useState(false)

  useEffect(() => { setPage(1) }, [segment, search])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ segment, page: String(page), limit: String(LIMIT) })
    if (search) params.set('search', search)
    fetch(`/api/whatsapp/audience?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) { setClients(d.data.clients); setTotal(d.data.total) }
        else toast.error(d.error || 'Failed to load audience')
      })
      .catch(() => toast.error('Failed to load audience'))
      .finally(() => setLoading(false))
  }, [segment, search, page])

  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const pageAllSelected = clients.length > 0 && clients.every((c) => selected.has(c.id))
  const togglePage = () => setSelected((prev) => {
    const next = new Set(prev)
    if (pageAllSelected) clients.forEach((c) => next.delete(c.id))
    else clients.forEach((c) => next.add(c.id))
    return next
  })

  const selectAllMatching = async () => {
    setSelectingAll(true)
    try {
      const params = new URLSearchParams({ segment, idsOnly: 'true' })
      if (search) params.set('search', search)
      const d = await (await fetch(`/api/whatsapp/audience?${params}`)).json()
      if (d.success) { setSelected(new Set<string>(d.data.ids)); toast.success(`Selected ${d.data.ids.length} matching clients`) }
      else toast.error(d.error || 'Failed to select all')
    } catch { toast.error('Failed to select all') } finally { setSelectingAll(false) }
  }

  const clearSelection = () => setSelected(new Set())

  const [message, setMessage] = useState(DEFAULT_TEMPLATE)
  const preview = message.replaceAll('{{name}}', 'Rahul')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [queueing, setQueueing] = useState(false)
  const submit = async () => {
    setQueueing(true)
    try {
      const d = await (await fetch('/api/whatsapp/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientIds: [...selected], message }),
      })).json()
      if (d.success) {
        toast.success(`Queued ${d.data.queued} (skipped ${d.data.skippedInvalid} invalid, ${d.data.skippedDuplicate} duplicate)`)
        clearSelection(); refreshStatus()
      } else toast.error(d.error || 'Failed to queue campaign')
    } catch { toast.error('Failed to queue campaign') } finally { setQueueing(false); setConfirmOpen(false) }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-6 w-6 text-green-600" />
        <h1 className="text-2xl font-bold">WhatsApp Outreach</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Queue status</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>Sent today: <b>{status?.sentToday ?? '—'}</b></span>
            <span>Pending in queue: <b>{status?.pendingTotal ?? '—'}</b></span>
          </div>
          <p className="text-xs text-muted-foreground">
            Messages are sent by the office-PC worker at ~30/day during office hours (10:00–16:00).
          </p>
          {status && status.campaigns.length > 0 && (
            <div className="space-y-1">
              {status.campaigns.slice(0, 5).map((c) => (
                <div key={c.campaignId} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</span>
                  <span>· {c.total} total</span>
                  <Badge variant="secondary">{c.sent} sent</Badge>
                  <Badge variant="outline">{c.pending} pending</Badge>
                  {c.failed > 0 && <Badge variant="destructive">{c.failed} failed</Badge>}
                  {c.skipped > 0 && <Badge variant="outline">{c.skipped} skipped</Badge>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Audience</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEGMENTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search code, name, phone…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{total} matching · {selected.size} selected</span>
            <Button variant="outline" size="sm" onClick={selectAllMatching} disabled={selectingAll || total === 0}>
              {selectingAll ? 'Selecting…' : `Select all ${total} matching`}
            </Button>
            {selected.size > 0 && <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>}
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={pageAllSelected} onCheckedChange={togglePage} aria-label="Select page" /></TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Dept</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                ) : clients.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No matching clients</TableCell></TableRow>
                ) : clients.map((c) => (
                  <TableRow key={c.id} data-state={selected.has(c.id) ? 'selected' : undefined}>
                    <TableCell><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} aria-label={`Select ${c.clientCode}`} /></TableCell>
                    <TableCell className="font-mono text-xs">{c.clientCode}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.phone ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline">{c.department === 'EQUITY' ? 'Equity' : 'MF'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Compose message</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} placeholder="Type your message… use {{name}} for the client's first name" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Use <code>{'{{name}}'}</code> to insert the client&apos;s first name.</span>
            <span>{message.length} chars</span>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
            <span className="text-xs text-muted-foreground block mb-1">Preview (name → Rahul):</span>
            {preview}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => setConfirmOpen(true)} disabled={selected.size === 0 || message.trim().length === 0}>
          <Send className="h-4 w-4 mr-2" /> Queue Campaign
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Queue {selected.size} messages?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll be sent by the office-PC worker at ~30/day during office hours (10:00–16:00). Invalid or duplicate numbers are skipped automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={queueing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); submit() }} disabled={queueing}>
              {queueing ? 'Queuing…' : 'Queue Campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: Add the sidebar nav entry (gated for CA)**

In `src/components/layout/sidebar.tsx`:
1. Add `MessageCircle` to the `lucide-react` import.
2. In `ADMIN_NAV`, insert after the `Reports` item:
   ```ts
   { label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
   ```
3. Split the `CHARTERED_ACCOUNTANT` case out of the shared `ADMIN`/`SUPER_ADMIN` case in `getNavItems`:
   ```ts
   case 'SUPER_ADMIN':
   case 'ADMIN':
     return ADMIN_NAV
   case 'CHARTERED_ACCOUNTANT':
     return ADMIN_NAV.filter((i) => i.href !== '/whatsapp')
   ```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/whatsapp/page.tsx" src/components/layout/sidebar.tsx
git commit -m "feat(whatsapp): admin outreach page + sidebar nav (CA excluded)"
```

---

### Task 6: Office-PC worker (open-wa)

**Files:**
- Create: `worker/package.json`, `worker/prisma/schema.prisma`, `worker/send.js`, `worker/.env.example`, `worker/.gitignore`, `worker/README.md`

**Interfaces:**
- Consumes: the `WhatsappMessage` table (Task 2) via its own generated client; `@open-wa/wa-automate` `create()`/`sendText()`.

- [ ] **Step 1: `worker/package.json`**

```json
{
  "name": "kesar-whatsapp-worker",
  "version": "1.0.0",
  "private": true,
  "description": "Office-PC WhatsApp outreach sender (open-wa). Drains the PENDING WhatsappMessage queue during office hours.",
  "scripts": {
    "start": "node send.js",
    "postinstall": "prisma generate --schema=./prisma/schema.prisma"
  },
  "dependencies": {
    "@open-wa/wa-automate": "^4",
    "@prisma/client": "6.19.2",
    "dotenv": "^17.3.1",
    "prisma": "6.19.2"
  }
}
```

- [ ] **Step 2: `worker/prisma/schema.prisma` (minimal, self-contained)**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

enum WhatsappStatus {
  PENDING
  SENT
  FAILED
  SKIPPED
}

model WhatsappMessage {
  id          String         @id @default(cuid())
  campaignId  String
  clientId    String?
  clientCode  String
  clientName  String
  phone       String
  body        String         @db.Text
  status      WhatsappStatus @default(PENDING)
  error       String?        @db.Text
  sentAt      DateTime?
  createdById String
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@index([status])
  @@index([campaignId])
  @@index([sentAt])
  @@map("WhatsappMessage")
}
```

- [ ] **Step 3: `worker/send.js`**

```js
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

async function drainQueue(client) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hour = new Date().getHours() // office PC local time == IST
    if (hour < START_HOUR || hour >= END_HOUR) {
      console.log(`[worker] Outside send window (${START_HOUR}:00-${END_HOUR}:00). Exiting.`)
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
      await prisma.whatsappMessage.update({ where: { id: msg.id }, data: { status: 'FAILED', error: String(err) } })
      console.error(`[worker] FAILED ${msg.clientCode}:`, err)
    }

    const wait = GAP_MS + Math.floor((Math.random() * 2 - 1) * JITTER_MS)
    console.log(`[worker] Waiting ${Math.round(Math.max(0, wait) / 1000)}s before next send...`)
    await sleep(Math.max(0, wait))
  }
}

async function start(client) {
  try {
    await drainQueue(client)
  } catch (e) {
    console.error('[worker] Fatal error draining queue:', e)
  } finally {
    await prisma.$disconnect()
    try { await client.kill() } catch { /* ignore */ }
    process.exit(0)
  }
}

create({
  sessionId: 'kesar-outreach',
  headless: true,
  qrTimeout: 0,
  authTimeout: 0,
  restartOnCrash: start,
  useChrome: false,
  throwErrorOnTosBlock: false,
  disableSpins: true,
})
  .then((client) => start(client))
  .catch((err) => { console.error('[worker] Failed to start open-wa:', err); process.exit(1) })
```

- [ ] **Step 4: `worker/.env.example`**

```
DATABASE_URL=
DAILY_LIMIT=30
GAP_MS=300000
JITTER_MS=60000
WINDOW_START_HOUR=10
WINDOW_END_HOUR=16
```

- [ ] **Step 5: `worker/.gitignore`**

```
node_modules/
.env
# open-wa session + chromium profile
_IGNORE_*
*.data.json
.wwebjs_auth/
```

- [ ] **Step 6: `worker/README.md`** (setup + ban-safety)

```markdown
# Kesar WhatsApp Outreach Worker (open-wa)

Sends the queued inactive-client WhatsApp messages from an **office PC**. It reads
`PENDING` rows from the shared Hostinger DB and sends them via a real WhatsApp
number using `@open-wa/wa-automate`. It sends at most `DAILY_LIMIT` per day, only
between `WINDOW_START_HOUR`–`WINDOW_END_HOUR`, then exits so the PC can be shut off.

## One-time setup (Windows)
1. Install Node.js LTS.
2. In this `worker/` folder, copy `.env.example` to `.env` and paste the same
   `DATABASE_URL` the app uses (Hostinger MySQL).
3. `npm install` (installs deps and runs `prisma generate`).
4. `npm start` — a QR code prints in the terminal. Open WhatsApp on the
   **dedicated company phone** → Linked Devices → Link a device → scan it. This
   is a **one-time** scan; the session is saved on disk (`kesar-outreach`).

## Daily
Turn the PC on during office hours → `npm start` (or a Task Scheduler task at
login/10:00). It sends the day's quota with ~5-min gaps and then exits. Turn the
PC off at night; it resumes from the DB next morning. The daily cap is enforced by
counting today's `SENT` rows, so restarts never exceed it.

## Ban-safety
- Use a **dedicated number** you can afford to lose — not the primary business line.
- Keep `DAILY_LIMIT` low (20–40). Messages go **only to our own clients**.
- Office-hours-only + random gaps keep traffic human-looking; keep the opt-out line.
- open-wa is unofficial → expect an occasional QR re-scan and library updates.
- Free tier is sufficient (we only use `sendText`); ignore the startup sponsor notice.
```

- [ ] **Step 7: Local sanity (optional, no live send)**

`worker/` is standalone; it is NOT part of `npx tsc --noEmit` (excluded). A live run requires a scanned WhatsApp session + DB access, so it is validated during office-PC setup, not in CI. Confirm the file parses: `node --check worker/send.js` → no output = OK.

- [ ] **Step 8: Commit**

```bash
git add worker/
git commit -m "feat(whatsapp): office-PC open-wa worker (self-contained, office-hours drip)"
```

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: clean (worker excluded).

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: existing suites + new `whatsapp-outreach.test.ts` all green.

- [ ] **Step 3: Lint the touched app files**

Run: `npx eslint "src/app/(protected)/whatsapp/page.tsx" src/app/api/whatsapp/**/route.ts src/lib/whatsapp-outreach.ts src/components/layout/sidebar.tsx`
Expected: no errors.

- [ ] **Step 4: Worker parse check**

Run: `node --check worker/send.js`
Expected: no output.

- [ ] **Step 5: Report deferred deploy steps (DO NOT run without owner approval)**
  - `npx prisma db push` once against the Hostinger DB to create the `WhatsappMessage` table.
  - Office-PC setup per `worker/README.md` (install, scan QR on the dedicated number).

---

## Deferred / Out of scope (per spec §11)
- Editable daily-cap/window in the UI; per-campaign progress detail view; "don't re-message" guards across campaigns; skip Sundays/holidays; dedicated messaging-only login. Build later if wanted.

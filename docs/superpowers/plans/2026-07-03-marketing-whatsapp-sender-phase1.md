# Marketing WhatsApp Sender — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `MARKETING` login and let it (and admins) send WhatsApp to freely-chosen recipients — the whole client book plus pasted/typed numbers — using saved message templates.

**Architecture:** Pure app work on the existing DB-queue WhatsApp feature. New `MARKETING` role wired through the standard role spots; the audience API gains an all-clients scope; the campaigns API accepts manual recipients alongside client ids; a new `WhatsappTemplate` table + CRUD backs a template picker. No worker/bridge changes (that's Phase 2).

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 6/MySQL, next-auth v5, shadcn/ui + sonner + zustand, vitest.

## Global Constraints

- Gate every WhatsApp API route + the page with `canSendWhatsapp(role)` (ADMIN/SUPER_ADMIN/MARKETING; CA excluded). Do **not** add `MARKETING` to global `isReadOnly`/`shouldBlockMutation` — it must keep write access to WhatsApp endpoints.
- API shape `{ success, data?, error? }`; try/catch `console.error('[METHOD /path]', e)` + 500; zod inline validation; `logActivity({ userId, action, module:'WHATSAPP', details })`.
- Phone canonicalisation via existing `normalizeWhatsappPhone` (`91`+10 digits, placeholder-rejecting). Dedupe recipients by normalized phone.
- Manual rows: `clientId=null`, `clientCode='MANUAL'`, `clientName` = provided name or the number.
- Repo uses `prisma db push` (deferred owner-approved deploy) — coding tasks run `prisma generate` only.
- Worker stays excluded from `tsc`/`eslint`.

---

## File Structure

- **Modify** `prisma/schema.prisma` — add `MARKETING` to `Role`; add `WhatsappTemplate` model.
- **Modify** `src/lib/roles.ts` — add `canSendWhatsapp`; `MARKETING: 2` in `ROLE_PRIORITY`.
- **Modify** `src/lib/roles.test.ts` — tests for `canSendWhatsapp`.
- **Modify** `src/stores/active-role-store.ts` — `ROLE_LABELS.MARKETING`; `getDashboardForRole` → `/whatsapp`.
- **Modify** `src/components/layout/sidebar.tsx` — `MARKETING_NAV` + `getNavItems` case.
- **Modify** `src/app/(protected)/masters/clients/page.tsx` — allow `MARKETING`, read-only.
- **Modify** `prisma/seed-test-users.ts` — add a `MARKETING` test login.
- **Create** `src/lib/whatsapp-recipients.ts` (+ `.test.ts`) — `parseManualRecipients`.
- **Modify** `src/app/api/whatsapp/audience/route.ts` — `scope=all`; `canSendWhatsapp`.
- **Modify** `src/app/api/whatsapp/campaigns/route.ts` — `manualRecipients`; `canSendWhatsapp`.
- **Create** `src/app/api/whatsapp/templates/route.ts` (GET/POST) + `src/app/api/whatsapp/templates/[id]/route.ts` (PATCH/DELETE).
- **Modify** `src/app/(protected)/whatsapp/page.tsx` — scope toggle + manual box + templates UI + `MARKETING` gate.

---

### Task 1: `MARKETING` role + gating + wiring + seed

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/roles.ts`, `src/lib/roles.test.ts`, `src/stores/active-role-store.ts`, `src/components/layout/sidebar.tsx`, `src/app/(protected)/masters/clients/page.tsx`, `src/app/(protected)/whatsapp/page.tsx`, `prisma/seed-test-users.ts`

**Interfaces:**
- Produces: `canSendWhatsapp(role?: string | null): boolean`; `Role.MARKETING`; nav/dashboard/label wiring. Consumed by Tasks 4, 5.

- [ ] **Step 1: Write the failing test** — append to `src/lib/roles.test.ts`

```ts
import { canSendWhatsapp } from './roles'

describe('canSendWhatsapp', () => {
  it('allows admins and marketing; rejects CA, dealers, null', () => {
    expect(canSendWhatsapp('SUPER_ADMIN')).toBe(true)
    expect(canSendWhatsapp('ADMIN')).toBe(true)
    expect(canSendWhatsapp('MARKETING')).toBe(true)
    expect(canSendWhatsapp('CHARTERED_ACCOUNTANT')).toBe(false)
    expect(canSendWhatsapp('EQUITY_DEALER')).toBe(false)
    expect(canSendWhatsapp(null)).toBe(false)
    expect(canSendWhatsapp(undefined)).toBe(false)
  })
})
```

(If `roles.test.ts` already imports from `./roles`, add `canSendWhatsapp` to that import instead of a new line.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/roles.test.ts`
Expected: FAIL — `canSendWhatsapp is not a function`.

- [ ] **Step 3: Implement**

`src/lib/roles.ts` — add after `isManager`:
```ts
/** Can operate the WhatsApp sender: real admins plus the Marketing role (CA excluded). */
export function canSendWhatsapp(role?: string | null): boolean {
  return isManager(role) || role === 'MARKETING'
}
```
and add to `ROLE_PRIORITY`:
```ts
  MARKETING: 2,
```

`prisma/schema.prisma` — add to `enum Role { … }`:
```prisma
  MARKETING
```

`src/stores/active-role-store.ts` — in `getDashboardForRole` switch add:
```ts
    case 'MARKETING':
      return '/whatsapp'
```
and in `ROLE_LABELS` add:
```ts
  MARKETING: 'Marketing',
```

`src/components/layout/sidebar.tsx` — add a nav array after `BACK_OFFICE_NAV`:
```ts
const MARKETING_NAV: NavItem[] = [
  { label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
  { label: 'Clients', href: '/masters/clients', icon: Database },
]
```
and in `getNavItems` add before `default`:
```ts
    case 'MARKETING':
      return MARKETING_NAV
```

`src/app/(protected)/whatsapp/page.tsx` — widen the gate allow-list:
```ts
    if (!['ADMIN', 'SUPER_ADMIN', 'MARKETING'].includes(effectiveRole)) {
```

`src/app/(protected)/masters/clients/page.tsx` — make Marketing a read-only viewer:
```ts
  const readOnly = isReadOnly(session?.user?.role) || session?.user?.role === 'MARKETING'
```
and add `'MARKETING'` to the `allowed` array (the one currently `['ADMIN', 'SUPER_ADMIN', 'CHARTERED_ACCOUNTANT']`).

`prisma/seed-test-users.ts` — add to the `USERS` array:
```ts
  {
    name: 'Test Marketing',
    email: 'marketing@test.local',
    phone: '0000000006',
    department: Department.ADMIN,
    designation: 'Marketing',
    role: Role.MARKETING,
  },
```

- [ ] **Step 4: Generate client + run tests + typecheck**

Run: `npx prisma generate && npx vitest run src/lib/roles.test.ts`
Expected: Prisma generated; roles test PASS.
Run: `npx tsc --noEmit 2>&1 | grep -v brokerage-archive | grep -iE "error TS|roles|sidebar|active-role|clients|whatsapp"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/lib/roles.ts src/lib/roles.test.ts src/stores/active-role-store.ts src/components/layout/sidebar.tsx "src/app/(protected)/masters/clients/page.tsx" "src/app/(protected)/whatsapp/page.tsx" prisma/seed-test-users.ts
git commit -m "feat(whatsapp): add MARKETING role, canSendWhatsapp gate, nav + read-only clients"
```

---

### Task 2: `WhatsappTemplate` model + templates API

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/app/api/whatsapp/templates/route.ts`, `src/app/api/whatsapp/templates/[id]/route.ts`

**Interfaces:**
- Consumes: `canSendWhatsapp` (Task 1), `prisma.whatsappTemplate`, `logActivity`.
- Produces: `GET /api/whatsapp/templates` → `{ success, data: { templates: {id,name,body,createdAt}[] } }`; `POST` `{name,body}` → `{ success, data: template }`; `PATCH /[id]` `{name?,body?}`; `DELETE /[id]`.

- [ ] **Step 1: Add the model** — `prisma/schema.prisma`

```prisma
model WhatsappTemplate {
  id          String   @id @default(cuid())
  name        String
  body        String   @db.Text
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([createdById])
}
```

Run: `npx prisma generate`
Expected: `prisma.whatsappTemplate` typed.

- [ ] **Step 2: Create `src/app/api/whatsapp/templates/route.ts`**

```ts
import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canSendWhatsapp } from '@/lib/roles'
import { logActivity } from '@/lib/activity-log'
import { z } from 'zod'

const templateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  body: z.string().min(1, 'Message body is required'),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    const templates = await prisma.whatsappTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, body: true, createdAt: true },
    })
    return NextResponse.json({ success: true, data: { templates } })
  } catch (error) {
    console.error('[GET /api/whatsapp/templates]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    const parsed = templateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 })
    }
    const template = await prisma.whatsappTemplate.create({
      data: { name: parsed.data.name, body: parsed.data.body, createdById: session.user.id },
      select: { id: true, name: true, body: true, createdAt: true },
    })
    await logActivity({ userId: session.user.id, action: 'CREATE', module: 'WHATSAPP', details: `Created WhatsApp template "${template.name}"` })
    return NextResponse.json({ success: true, data: template }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/whatsapp/templates]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create `src/app/api/whatsapp/templates/[id]/route.ts`**

(Next 16 dynamic params are async — mirror `src/app/api/clients/[id]/route.ts`.)
```ts
import { auth, getActiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canSendWhatsapp } from '@/lib/roles'
import { logActivity } from '@/lib/activity-log'
import { z } from 'zod'

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  body: z.string().min(1).optional(),
}).refine((d) => d.name !== undefined || d.body !== undefined, { message: 'Nothing to update' })

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 })
    }
    const template = await prisma.whatsappTemplate.update({
      where: { id },
      data: parsed.data,
      select: { id: true, name: true, body: true, createdAt: true },
    })
    await logActivity({ userId: session.user.id, action: 'UPDATE', module: 'WHATSAPP', details: `Updated WhatsApp template "${template.name}"` })
    return NextResponse.json({ success: true, data: template })
  } catch (error) {
    console.error('[PATCH /api/whatsapp/templates/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    if (!canSendWhatsapp(await getActiveRole(session.user))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    await prisma.whatsappTemplate.delete({ where: { id } })
    await logActivity({ userId: session.user.id, action: 'DELETE', module: 'WHATSAPP', details: `Deleted WhatsApp template ${id}` })
    return NextResponse.json({ success: true, data: { id } })
  } catch (error) {
    console.error('[DELETE /api/whatsapp/templates/[id]]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v brokerage-archive | grep -iE "error TS|templates"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/app/api/whatsapp/templates
git commit -m "feat(whatsapp): WhatsappTemplate model + templates CRUD API"
```

---

### Task 3: Manual-recipient parser (TDD)

**Files:**
- Create: `src/lib/whatsapp-recipients.ts`, `src/lib/whatsapp-recipients.test.ts`

**Interfaces:**
- Consumes: `normalizeWhatsappPhone` (`@/lib/whatsapp-outreach`).
- Produces: `interface ManualRecipient { phone: string; name?: string }`; `parseManualRecipients(text: string): { valid: ManualRecipient[]; invalidLines: string[] }` (phones returned already normalized to `91…`). Consumed by Tasks 4, 5.

- [ ] **Step 1: Write the failing test** — `src/lib/whatsapp-recipients.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { parseManualRecipients } from './whatsapp-recipients'

describe('parseManualRecipients', () => {
  it('parses bare numbers and normalizes them', () => {
    const r = parseManualRecipients('9876543210\n919811111111')
    expect(r.valid).toEqual([{ phone: '919876543210' }, { phone: '919811111111' }])
    expect(r.invalidLines).toEqual([])
  })
  it('parses "number,Name" and keeps the name', () => {
    const r = parseManualRecipients('9876543210, Rahul Sharma')
    expect(r.valid).toEqual([{ phone: '919876543210', name: 'Rahul Sharma' }])
  })
  it('collects invalid lines and skips blanks', () => {
    const r = parseManualRecipients('9876543210\n\n12345\n0000000000')
    expect(r.valid).toEqual([{ phone: '919876543210' }])
    expect(r.invalidLines).toEqual(['12345', '0000000000'])
  })
  it('handles a name containing commas', () => {
    const r = parseManualRecipients('9876543210, Sharma, Rahul')
    expect(r.valid).toEqual([{ phone: '919876543210', name: 'Sharma, Rahul' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/whatsapp-recipients.test.ts`
Expected: FAIL — cannot resolve `./whatsapp-recipients`.

- [ ] **Step 3: Implement** — `src/lib/whatsapp-recipients.ts`

```ts
import { normalizeWhatsappPhone } from './whatsapp-outreach'

export interface ManualRecipient {
  phone: string
  name?: string
}

/**
 * Parse a textarea of "number" or "number,Name" lines. Phones are normalized to the
 * `91XXXXXXXXXX` form; unparseable lines are returned in `invalidLines`. Blank lines are ignored.
 */
export function parseManualRecipients(text: string): { valid: ManualRecipient[]; invalidLines: string[] } {
  const valid: ManualRecipient[] = []
  const invalidLines: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const commaIdx = line.indexOf(',')
    const rawPhone = commaIdx === -1 ? line : line.slice(0, commaIdx)
    const name = commaIdx === -1 ? '' : line.slice(commaIdx + 1).trim()
    const normalized = normalizeWhatsappPhone(rawPhone)
    if (!normalized) { invalidLines.push(line); continue }
    valid.push(name ? { phone: normalized, name } : { phone: normalized })
  }
  return { valid, invalidLines }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/whatsapp-recipients.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp-recipients.ts src/lib/whatsapp-recipients.test.ts
git commit -m "feat(whatsapp): parseManualRecipients helper for pasted numbers"
```

---

### Task 4: Audience `scope=all` + campaigns `manualRecipients` + `canSendWhatsapp`

**Files:**
- Modify: `src/app/api/whatsapp/audience/route.ts`, `src/app/api/whatsapp/campaigns/route.ts`

**Interfaces:**
- Consumes: `canSendWhatsapp`, `parseManualRecipients`'s `ManualRecipient` shape, `normalizeWhatsappPhone`, `personalizeMessage`, `dedupeAudienceByPhone`.
- Produces: `GET /audience?scope=all` returns all clients (deduped); `POST /campaigns` accepts `{ clientIds?, manualRecipients?, message }`.

- [ ] **Step 1: Audience — add `scope=all` + swap gate.** In `audience/route.ts`:

Replace the gate `isManager(role)` with `canSendWhatsapp(role)` (update the import from `@/lib/roles`).

Extract the search-OR builder and add an all-clients where. Add above `segmentWhere`:
```ts
function buildSearchOR(search: string | null): Prisma.ClientWhereInput {
  return search
    ? { OR: [
        { clientCode: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
      ] }
    : {}
}

function allClientsWhere(search: string | null): { equity: Prisma.ClientWhereInput; mf: Prisma.ClientWhereInput } {
  const searchOR = buildSearchOR(search)
  return {
    equity: { department: 'EQUITY', ...searchOR },
    mf: { department: 'MUTUAL_FUND', ...searchOR },
  }
}
```
Refactor `segmentWhere` to use `buildSearchOR(search)` in place of its inline `searchOR`. Then in `GET`, choose the where by scope:
```ts
    const scope = searchParams.get('scope') === 'all' ? 'all' : 'inactive'
    const where = scope === 'all' ? allClientsWhere(search) : segmentWhere(segment, search)
```
(everything after — the two `findMany` with `orderBy`, dedupe, `idsOnly`, pagination — is unchanged.)

- [ ] **Step 2: Campaigns — accept manual recipients + swap gate.** Rewrite the `POST` body of `campaigns/route.ts`:

Update imports: `import { canSendWhatsapp } from '@/lib/roles'` (drop `isManager`); keep `normalizeWhatsappPhone, personalizeMessage`.
```ts
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
    if (!canSendWhatsapp(await getActiveRole(session.user))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

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
```
Also swap the `GET` (status) gate in the same file from `isManager` to `canSendWhatsapp`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v brokerage-archive | grep -iE "error TS|whatsapp"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/audience/route.ts src/app/api/whatsapp/campaigns/route.ts
git commit -m "feat(whatsapp): all-clients scope + manual recipients; gate on canSendWhatsapp"
```

---

### Task 5: Page — scope toggle, manual numbers, templates

**Files:**
- Modify: `src/app/(protected)/whatsapp/page.tsx`

**Interfaces:**
- Consumes: `GET /audience?scope=…`, `POST /campaigns` with `manualRecipients`, templates CRUD (Tasks 2, 4), `parseManualRecipients` (Task 3).

- [ ] **Step 1: Add state + helpers.** After the existing audience state, add:

```tsx
  // recipient scope
  const [scope, setScope] = useState<'all' | 'inactive'>('all')
  // manual recipients
  const [manualText, setManualText] = useState('')
  const manual = useMemo(() => parseManualRecipients(manualText), [manualText])
  // templates
  const [templates, setTemplates] = useState<{ id: string; name: string; body: string }[]>([])
  const loadTemplates = useCallback(() => {
    fetch('/api/whatsapp/templates').then((r) => r.json()).then((d) => { if (d.success) setTemplates(d.data.templates) }).catch(() => {})
  }, [])
  useEffect(() => { loadTemplates() }, [loadTemplates])
```
Add imports: `useMemo` to the `react` import; `import { parseManualRecipients } from '@/lib/whatsapp-recipients'`. Reset page also on scope change: change the reset effect deps to `[segment, search, scope]`, and include `scope` in the audience fetch params + deps.

In the audience fetch effect, add `scope` to the querystring and deps:
```tsx
    const params = new URLSearchParams({ segment, scope, page: String(page), limit: String(LIMIT) })
    …
  }, [segment, search, page, scope])
```
And in `selectAllMatching`, add `scope` to its params too.

- [ ] **Step 2: Scope toggle + conditional segment.** Replace the segment `<Select>` row so the segment picker only shows under "Inactive":

```tsx
          <div className="flex flex-wrap items-center gap-2">
            <Select value={scope} onValueChange={(v) => setScope(v as 'all' | 'inactive')}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                <SelectItem value="inactive">Inactive segments</SelectItem>
              </SelectContent>
            </Select>
            {scope === 'inactive' && (
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search code, name, phone…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            </div>
          </div>
```

- [ ] **Step 3: Manual numbers card.** Add a new `<Card>` after the Audience card:

```tsx
      <Card>
        <CardHeader><CardTitle className="text-base">Add numbers manually</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={4}
            placeholder={'One per line: 9876543210  or  9876543210, Rahul'}
          />
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{manual.valid.length} valid number{manual.valid.length === 1 ? '' : 's'}</span>
            {manual.invalidLines.length > 0 && (
              <span className="text-red-600">{manual.invalidLines.length} invalid: {manual.invalidLines.slice(0, 3).join('; ')}{manual.invalidLines.length > 3 ? '…' : ''}</span>
            )}
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 4: Templates control in the Compose card.** Add above the `<Textarea message>`:

```tsx
          <div className="flex flex-wrap items-center gap-2">
            <Select value="" onValueChange={(id) => { const t = templates.find((x) => x.id === id); if (t) setMessage(t.body) }}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Load a template…" /></SelectTrigger>
              <SelectContent>
                {templates.length === 0
                  ? <SelectItem value="none" disabled>No templates yet</SelectItem>
                  : templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              type="button" variant="outline" size="sm"
              disabled={message.trim().length === 0}
              onClick={async () => {
                const name = window.prompt('Template name?')?.trim()
                if (!name) return
                const d = await (await fetch('/api/whatsapp/templates', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name, body: message }),
                })).json()
                if (d.success) { toast.success('Template saved'); loadTemplates() } else toast.error(d.error || 'Failed to save template')
              }}
            >Save as template</Button>
          </div>
```

- [ ] **Step 5: Include manual recipients when queueing.** Update `submit()` and the Queue button/dialog:

In `submit()`, send both sources:
```tsx
        body: JSON.stringify({ clientIds: [...selected], manualRecipients: manual.valid, message }),
```
Recompute the total recipient count for the button/dialog:
```tsx
  const recipientCount = selected.size + manual.valid.length
```
Change the Queue button `disabled` to `recipientCount === 0 || message.trim().length === 0`, the dialog title to `Queue {recipientCount} messages?`, and after a successful queue also `setManualText('')` alongside `clearSelection()`.

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -v brokerage-archive | grep -iE "error TS|whatsapp"`
Expected: no output.
Run: `npx eslint "src/app/(protected)/whatsapp/page.tsx"`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(protected)/whatsapp/page.tsx"
git commit -m "feat(whatsapp): scope toggle, manual numbers, and template picker in the sender UI"
```

---

### Task 6: Final verification

- [ ] **Step 1:** `npx tsc --noEmit 2>&1 | grep -v brokerage-archive | grep "error TS"` → no output.
- [ ] **Step 2:** `npm test` → all suites green (roles + whatsapp-outreach + whatsapp-recipients + brokerage-status).
- [ ] **Step 3:** `npx eslint "src/app/(protected)/whatsapp/page.tsx" src/app/api/whatsapp/**/route.ts src/lib/whatsapp-recipients.ts src/lib/roles.ts` → exit 0.
- [ ] **Step 4: Report deferred deploy steps (do NOT run):**
  - `npx prisma db push` — adds the `MARKETING` enum value + `WhatsappTemplate` table.
  - Owner creates the real Marketing login (or runs the test seed for local: `npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-test-users.ts`).

---

## Self-review notes
- Spec §4 (role/gate/wiring/seed) → Task 1. §5 (all-clients + manual) → Tasks 3, 4, 5. §6 (templates) → Tasks 2, 5. §9 testing → Tasks 1, 3, 6.
- Phase 2 (bridge/session/groups/connect panel) is intentionally **out of scope** here — separate plan.

# No Business — Equity Clients Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Reports page showing equity clients with no brokerage for more than 2 months, visible to Admins only, with automatic removal when new business is detected and manual early dismissal.

**Architecture:** Fully computed list — no materialized table. Every page load queries `Client + BrokerageDetail + MFBusiness + NoBusinessDismissal` and filters in application code. A new `NoBusinessDismissal` Prisma model stores admin early-dismissals (one active dismissal per client, upserted). Dismissed clients re-enter the list automatically when new business is detected after their dismissal date.

**Tech Stack:** Next.js 15 App Router, Prisma ORM (MySQL), NextAuth v5, TypeScript, Tailwind CSS, shadcn/ui, Sonner toasts

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `prisma/schema.prisma` | Add `NoBusinessDismissal` model + reverse relations |
| Create | `src/app/api/reports/no-business/route.ts` | GET: paginated dormant client list + CSV export |
| Create | `src/app/api/reports/no-business/dismiss/route.ts` | POST: upsert dismissal record |
| Create | `src/app/(protected)/reports/no-business/page.tsx` | UI: table, filters, dismiss action |
| Modify | `src/app/(protected)/reports/page.tsx` | Add "No Business" card to ADMIN_REPORTS |

---

## Task 1: Add NoBusinessDismissal to Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the NoBusinessDismissal model and reverse relations**

Open `prisma/schema.prisma` and make three edits:

**A) Add model at the end of the file:**

```prisma
model NoBusinessDismissal {
  id            String   @id @default(cuid())
  clientId      String   @unique
  client        Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  dismissedById String
  dismissedBy   Employee @relation("DismissalAdmin", fields: [dismissedById], references: [id])
  dismissedAt   DateTime @default(now())

  @@index([clientId])
}
```

**B) Add reverse relation inside the `Client` model** (after the `mfServices` line):

```prisma
  noBusinessDismissal  NoBusinessDismissal?
```

**C) Add reverse relation inside the `Employee` model** (after the `mfServicesRecorded` line):

```prisma
  noBusinessDismissals NoBusinessDismissal[] @relation("DismissalAdmin")
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-no-business-dismissal
```

Expected output ends with: `Your database is now in sync with your schema.`

- [ ] **Step 3: Verify generated client**

```bash
npx prisma generate
```

Expected: no errors. The `NoBusinessDismissal` type is now available in `@prisma/client`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add NoBusinessDismissal schema model"
```

---

## Task 2: GET /api/reports/no-business

**Files:**
- Create: `src/app/api/reports/no-business/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/reports/no-business/route.ts` with the full content below:

```typescript
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEffectiveRole } from '@/lib/roles'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const role = getEffectiveRole(session.user)
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')))
    const search = searchParams.get('search')?.trim().toLowerCase() || ''
    const operatorId = searchParams.get('operator') || ''
    const exportCsv = searchParams.get('export') === 'true'

    const twoMonthsAgo = new Date()
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

    // Fetch all equity clients that are not MF-active, with latest brokerage, MF business, and dismissal
    const allClients = await prisma.client.findMany({
      where: {
        department: 'EQUITY',
        mfStatus: { not: 'ACTIVE' },
      },
      select: {
        id: true,
        clientCode: true,
        firstName: true,
        middleName: true,
        lastName: true,
        phone: true,
        createdAt: true,
        operator: { select: { id: true, name: true } },
        brokerageDetails: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
        mfBusinesses: {
          orderBy: { businessDate: 'desc' },
          take: 1,
          select: { businessDate: true },
        },
        noBusinessDismissal: {
          select: {
            dismissedAt: true,
            dismissedBy: { select: { id: true, name: true } },
          },
        },
      },
    })

    // Filter to dormant clients
    const dormant = allClients.filter((client) => {
      const lastBrokerage = client.brokerageDetails[0]?.createdAt ?? null
      const lastMFBusiness = client.mfBusinesses[0]?.businessDate ?? null

      // Exclude if recent activity (within 2 months)
      if (lastBrokerage && lastBrokerage >= twoMonthsAgo) return false
      if (lastMFBusiness && lastMFBusiness >= twoMonthsAgo) return false

      // Must be inactive: old brokerage OR never traded and account is old
      const isInactive =
        (lastBrokerage !== null && lastBrokerage < twoMonthsAgo) ||
        (lastBrokerage === null && client.createdAt < twoMonthsAgo)
      if (!isInactive) return false

      // Dismissal logic: excluded if admin-dismissed AND no new business after dismissal
      const dismissal = client.noBusinessDismissal
      if (dismissal) {
        const hasNewBrokerageAfterDismissal = lastBrokerage && lastBrokerage > dismissal.dismissedAt
        const hasNewMFAfterDismissal = lastMFBusiness && lastMFBusiness > dismissal.dismissedAt
        if (!hasNewBrokerageAfterDismissal && !hasNewMFAfterDismissal) {
          return false // still dismissed
        }
        // New business after dismissal → dismissal void, client is dormant again
      }

      return true
    })

    // Apply search and operator filters
    const filtered = dormant.filter((client) => {
      if (operatorId && client.operator.id !== operatorId) return false
      if (search) {
        const fullName = [client.firstName, client.middleName, client.lastName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!fullName.includes(search) && !client.clientCode.toLowerCase().includes(search)) {
          return false
        }
      }
      return true
    })

    const now = new Date()
    const result = filtered.map((client) => {
      const lastBrokerage = client.brokerageDetails[0]?.createdAt ?? null
      const referenceDate = lastBrokerage ?? client.createdAt
      const daysInactive = Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24))
      return {
        id: client.id,
        clientCode: client.clientCode,
        firstName: client.firstName,
        middleName: client.middleName,
        lastName: client.lastName,
        phone: client.phone,
        operator: client.operator,
        lastBrokerageDate: lastBrokerage?.toISOString() ?? null,
        daysInactive,
        dismissedAt: client.noBusinessDismissal?.dismissedAt?.toISOString() ?? null,
        dismissedBy: client.noBusinessDismissal?.dismissedBy ?? null,
      }
    })

    // Sort by daysInactive descending (longest dormant first)
    result.sort((a, b) => b.daysInactive - a.daysInactive)

    if (exportCsv) {
      const header = 'Client Code,Name,Phone,Operator,Last Brokerage,Days Inactive'
      const rows = result.map((c) => {
        const name = [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ')
        const lastBrokerage = c.lastBrokerageDate
          ? new Date(c.lastBrokerageDate).toLocaleDateString('en-IN')
          : 'Never'
        return `${c.clientCode},"${name}",${c.phone},${c.operator.name},${lastBrokerage},${c.daysInactive}`
      })
      const csv = [header, ...rows].join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="no-business-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    // Paginate
    const total = result.length
    const paginated = result.slice((page - 1) * limit, page * limit)

    // Get all operators for filter dropdown
    const operators = await prisma.employee.findMany({
      where: { department: 'EQUITY', isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      success: true,
      data: {
        clients: paginated,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        operators,
      },
    })
  } catch (error) {
    console.error('[GET /api/reports/no-business]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `no-business/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reports/no-business/route.ts
git commit -m "feat: add GET /api/reports/no-business route"
```

---

## Task 3: POST /api/reports/no-business/dismiss

**Files:**
- Create: `src/app/api/reports/no-business/dismiss/route.ts`

- [ ] **Step 1: Create the dismiss route**

Create `src/app/api/reports/no-business/dismiss/route.ts`:

```typescript
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEffectiveRole } from '@/lib/roles'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const role = getEffectiveRole(session.user)
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { clientId } = body
    if (!clientId || typeof clientId !== 'string') {
      return NextResponse.json({ success: false, error: 'clientId is required' }, { status: 400 })
    }

    // Verify client exists and is an equity client
    const client = await prisma.client.findFirst({
      where: { id: clientId, department: 'EQUITY' },
      select: { id: true },
    })
    if (!client) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 })
    }

    await prisma.noBusinessDismissal.upsert({
      where: { clientId },
      create: {
        clientId,
        dismissedById: session.user.id,
        dismissedAt: new Date(),
      },
      update: {
        dismissedById: session.user.id,
        dismissedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/reports/no-business/dismiss]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reports/no-business/dismiss/route.ts
git commit -m "feat: add POST /api/reports/no-business/dismiss route"
```

---

## Task 4: No Business Report UI Page

**Files:**
- Create: `src/app/(protected)/reports/no-business/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/(protected)/reports/no-business/page.tsx`:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Search, Download, ArrowLeft, AlertTriangle, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn, getInitials } from '@/lib/utils'
import { getEffectiveRole } from '@/lib/roles'
import { useDebounce } from '@/hooks/use-debounce'
import Link from 'next/link'

interface Operator { id: string; name: string }

interface DormantClient {
  id: string
  clientCode: string
  firstName: string
  middleName: string | null
  lastName: string
  phone: string
  operator: Operator
  lastBrokerageDate: string | null
  daysInactive: number
  dismissedAt: string | null
  dismissedBy: Operator | null
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function NoBusinessPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const role = session?.user ? getEffectiveRole(session.user) : undefined

  // Redirect non-admins
  useEffect(() => {
    if (session && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      router.replace('/reports')
    }
  }, [session, role, router])

  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 400)
  const [operatorId, setOperatorId] = useState('all')
  const [operators, setOperators] = useState<Operator[]>([])
  const [clients, setClients] = useState<DormantClient[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 25

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    if (search) params.set('search', search)
    if (operatorId !== 'all') params.set('operator', operatorId)

    fetch(`/api/reports/no-business?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setClients(d.data.clients)
          setTotal(d.data.pagination.total)
          setOperators(d.data.operators)
        }
      })
      .finally(() => setLoading(false))
  }, [search, operatorId, page])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDismiss = async (clientId: string) => {
    const res = await fetch('/api/reports/no-business/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success('Client dismissed from list')
      setClients((prev) => prev.filter((c) => c.id !== clientId))
      setTotal((t) => t - 1)
    } else {
      toast.error(data.error || 'Dismiss failed')
    }
  }

  const handleExport = () => {
    const params = new URLSearchParams({ export: 'true' })
    if (search) params.set('search', search)
    if (operatorId !== 'all') params.set('operator', operatorId)
    window.open(`/api/reports/no-business?${params}`, '_blank')
  }

  const totalPages = Math.ceil(total / limit)

  if (session && role !== 'SUPER_ADMIN' && role !== 'ADMIN') return null

  return (
    <div className="page-container space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/reports">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="page-title">No Business — Equity Clients</h1>
          <p className="text-sm text-gray-500">Equity clients with no brokerage for more than 2 months</p>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
        <p className="text-sm font-medium text-orange-800">
          {loading ? 'Loading…' : `${total} client${total === 1 ? '' : 's'} currently on this list`}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(1) }}
              placeholder="Search by code or name…"
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={operatorId} onValueChange={(v) => { setOperatorId(v); setPage(1) }}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="All Operators" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Operators</SelectItem>
              {operators.map((op) => (
                <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleExport} className="ml-auto gap-1.5">
            <Download className="h-3.5 w-3.5" />Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Code</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Phone</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Operator</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Last Brokerage</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Days Inactive</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-2">
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ))
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No dormant clients — all equity clients have recent brokerage activity</p>
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <ClientRow key={client.id} client={client} onDismiss={handleDismiss} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>{total} clients · Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientRow({ client, onDismiss }: { client: DormantClient; onDismiss: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const fullName = [client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ')

  const handleConfirmDismiss = async () => {
    setDismissing(true)
    await onDismiss(client.id)
    setDismissing(false)
    setOpen(false)
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-orange-50 transition-colors bg-white">
      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{client.clientCode}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
            {getInitials(fullName)}
          </div>
          <span className="font-medium text-gray-800">{fullName}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-gray-600 text-xs">
        <a href={`tel:${client.phone}`} className="hover:text-blue-600">{client.phone}</a>
      </td>
      <td className="px-4 py-3 text-gray-600 text-xs">{client.operator.name}</td>
      <td className="px-4 py-3 text-xs">
        {client.lastBrokerageDate ? (
          <span className="text-gray-600">{formatDateShort(client.lastBrokerageDate)}</span>
        ) : (
          <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-xs font-medium">Never</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'text-xs font-semibold px-2 py-0.5 rounded-full',
          client.daysInactive > 90
            ? 'bg-amber-100 text-amber-700'
            : 'bg-orange-100 text-orange-700'
        )}>
          {client.daysInactive} days
        </span>
      </td>
      <td className="px-4 py-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              Dismiss
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <p className="text-sm font-medium text-gray-800 mb-1">Dismiss this client?</p>
            <p className="text-xs text-gray-500 mb-3">
              They will be removed from this list. They will re-appear automatically if they remain inactive.
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleConfirmDismiss}
                disabled={dismissing}
              >
                {dismissing ? 'Dismissing…' : 'Confirm'}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </td>
    </tr>
  )
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(protected)/reports/no-business/page.tsx"
git commit -m "feat: add No Business equity clients report page"
```

---

## Task 5: Add Report Card to Reports Index

**Files:**
- Modify: `src/app/(protected)/reports/page.tsx`

- [ ] **Step 1: Add import and card entry**

In `src/app/(protected)/reports/page.tsx`:

**A) Add `Ban` to the lucide import line** (it already imports `IndianRupee, CheckSquare, Users, ArrowRight, CalendarDays, TrendingUp`):

```tsx
import { IndianRupee, CheckSquare, Users, ArrowRight, CalendarDays, TrendingUp, Ban } from 'lucide-react'
```

**B) Add the new entry to `ADMIN_REPORTS` array** (after the `MF Business Report` entry):

```tsx
  { title: 'No Business — Equity', desc: 'Equity clients with no brokerage for over 2 months', icon: Ban, color: 'text-orange-600', bg: 'bg-orange-50 ring-1 ring-orange-200/50', href: '/reports/no-business' },
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start dev server and verify manually**

```bash
npm run dev
```

Open `http://localhost:3000/reports` as an Admin user. Confirm the "No Business — Equity" card appears. Click it — the report page should load with the table.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/reports/page.tsx"
git commit -m "feat: add No Business report card to reports index"
```

---

## Verification Checklist

After all tasks are complete, verify the following manually in the browser as an Admin user:

- [ ] `/reports` shows the "No Business — Equity" card
- [ ] `/reports/no-business` loads the table with dormant equity clients
- [ ] Stats bar shows correct total count
- [ ] Search by client code filters results
- [ ] Search by client name filters results
- [ ] Operator dropdown filters by assigned dealer
- [ ] "Last Brokerage" shows date or "Never" badge
- [ ] "Days Inactive" shows amber badge for > 90 days, orange for 60–90 days
- [ ] Dismiss button shows confirm popover
- [ ] Confirming dismiss removes the row immediately
- [ ] Export CSV downloads a file with correct columns
- [ ] Non-admin user visiting `/reports/no-business` is redirected to `/reports`
- [ ] Equity dealers and MF dealers do NOT see the card on `/reports`

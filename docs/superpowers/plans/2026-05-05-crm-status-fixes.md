# CRM Status Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 issues in the Finance CRM: auto-trade for all operators, client list cache sync on brokerage upload, client list auto-refresh on monthly reset, and 2-month not-traded data visible on MF dashboard.

**Architecture:** Remove the operator email whitelist so every brokerage upload auto-marks matched clients as TRADED. Add a `/api/reset-status` endpoint that returns the latest event timestamp; client list pages poll this every 30s and call `fetchClients()` when the timestamp changes. Add a new MF dashboard API + UI for 2-consecutive-month not-traded clients.

**Tech Stack:** Next.js App Router, Prisma (MySQL), React `useEffect`/`useCallback`, shadcn/ui `KpiCard`

---

## File Map

| File | Action |
|------|--------|
| `src/lib/auto-trade-config.ts` | Delete |
| `src/app/api/brokerage/upload/route.ts` | Remove whitelist import + guard |
| `src/app/api/reset-status/route.ts` | Create new |
| `src/lib/monthly-reset.ts` | No change needed (polling handles refresh) |
| `src/app/(protected)/clients/page.tsx` | Add polling `useEffect` |
| `src/app/(protected)/mf/clients/page.tsx` | Add polling `useEffect` |
| `src/app/api/dashboard/mf/not-traded-2months/route.ts` | Create new |
| `src/app/(protected)/mf/dashboard/page.tsx` | Add KpiCard + table |

---

## Task 1: Remove Auto-Trade Operator Whitelist

**Files:**
- Delete: `src/lib/auto-trade-config.ts`
- Modify: `src/app/api/brokerage/upload/route.ts`

- [ ] **Step 1: Verify current whitelist references**

Open `src/app/api/brokerage/upload/route.ts`. Confirm these 3 references to the whitelist:
- Line 6: `import { isAutoTradeOperator } from '@/lib/auto-trade-config'`
- Lines 233–235: `const autoTradeOperatorIds = new Set(operators.filter((o) => isAutoTradeOperator(o.email)).map((o) => o.id))`
- Lines 278–285: `.filter((d) => d.clientId !== null && d.amount > 0 && autoTradeOperatorIds.has(d.operatorId))`

- [ ] **Step 2: Remove the import**

In `src/app/api/brokerage/upload/route.ts`, remove line 6:
```typescript
// DELETE this line:
import { isAutoTradeOperator } from '@/lib/auto-trade-config'
```

- [ ] **Step 3: Remove email from operator select and remove autoTradeOperatorIds**

Replace the operators query block (around lines 228–235):
```typescript
// BEFORE:
const operators = await prisma.employee.findMany({
  where: { id: { in: operatorIds } },
  select: { id: true, name: true, email: true },
})
const operatorNameMap = new Map(operators.map((o) => [o.id, o.name]))
const autoTradeOperatorIds = new Set(
  operators.filter((o) => isAutoTradeOperator(o.email)).map((o) => o.id),
)

// AFTER:
const operators = await prisma.employee.findMany({
  where: { id: { in: operatorIds } },
  select: { id: true, name: true },
})
const operatorNameMap = new Map(operators.map((o) => [o.id, o.name]))
```

- [ ] **Step 4: Remove the whitelist guard from autoTradedClientIds**

Replace the `autoTradedClientIds` filter (around lines 278–285):
```typescript
// BEFORE:
const autoTradedClientIds = details
  .filter(
    (d) =>
      d.clientId !== null &&
      d.amount > 0 &&
      autoTradeOperatorIds.has(d.operatorId),
  )
  .map((d) => d.clientId!)

// AFTER:
const autoTradedClientIds = details
  .filter((d) => d.clientId !== null && d.amount > 0)
  .map((d) => d.clientId!)
```

- [ ] **Step 5: Also remove the comment block above autoTradedClientIds**

The comment on lines 275–277 references the old whitelist. Replace it:
```typescript
// BEFORE:
// Create BrokerageUpload + BrokerageDetails and auto-flip TRADED status
// for clients owned by auto-trade operators (Kedar Sir, Sarvesh) in a
// single transaction, so the upload and status update commit together.

// AFTER:
// Create BrokerageUpload + BrokerageDetails and auto-flip TRADED status
// for all matched clients in a single transaction.
```

- [ ] **Step 6: Delete auto-trade-config.ts**

Delete the file `src/lib/auto-trade-config.ts` entirely.

- [ ] **Step 7: Verify TypeScript compiles**

Run:
```powershell
npx tsc --noEmit
```
Expected: No errors referencing `auto-trade-config` or `isAutoTradeOperator`.

- [ ] **Step 8: Manual smoke test**

Start the dev server (`npm run dev`). Upload a brokerage file for an operator that was NOT in the old whitelist. Verify that matched client codes now show `TRADED` status in the DB (check via Prisma Studio or the client list page).

- [ ] **Step 9: Commit**

```powershell
git add src/app/api/brokerage/upload/route.ts
git rm src/lib/auto-trade-config.ts
git commit -m "feat: auto-trade on brokerage upload for all operators, not just whitelist"
```

---

## Task 2: Add `/api/reset-status` Endpoint

**Files:**
- Create: `src/app/api/reset-status/route.ts`

This endpoint returns the timestamp of the most recent significant event — either a monthly archive creation or a brokerage upload. Client list pages poll this every 30s to detect changes and auto-refresh.

- [ ] **Step 1: Create the route file**

Create `src/app/api/reset-status/route.ts` with:
```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const [latestArchive, latestUpload] = await Promise.all([
    prisma.monthlyArchive.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.brokerageUpload.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  const times = [latestArchive?.createdAt, latestUpload?.createdAt].filter(
    (t): t is Date => t !== undefined,
  )
  const lastUpdated =
    times.length > 0
      ? new Date(Math.max(...times.map((t) => t.getTime())))
      : new Date(0)

  return NextResponse.json({ lastUpdated: lastUpdated.toISOString() })
}
```

- [ ] **Step 2: Verify endpoint responds correctly**

With the dev server running, open a browser or run:
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/reset-status" -UseBasicParsing | Select-Object -ExpandProperty Content
```
Expected: JSON like `{"lastUpdated":"2026-05-05T10:00:00.000Z"}`

- [ ] **Step 3: Commit**

```powershell
git add src/app/api/reset-status/route.ts
git commit -m "feat: add /api/reset-status endpoint for client list polling"
```

---

## Task 3: Add Polling to All-Clients Page

**Files:**
- Modify: `src/app/(protected)/clients/page.tsx`

The page already has `fetchClients` (a `useCallback`). We add a second `useEffect` that polls `/api/reset-status` and calls `fetchClients()` on change.

- [ ] **Step 1: Add polling useEffect**

In `src/app/(protected)/clients/page.tsx`, after the existing `useEffect` at line 54:
```typescript
// Existing line 54 (do not change):
useEffect(() => { const t = setTimeout(fetchClients, 300); return () => clearTimeout(t) }, [fetchClients])

// ADD this block immediately after:
useEffect(() => {
  const lastUpdatedRef = { current: null as string | null }
  const check = async () => {
    try {
      const res = await fetch('/api/reset-status')
      const d = await res.json()
      if (lastUpdatedRef.current === null) {
        lastUpdatedRef.current = d.lastUpdated
      } else if (d.lastUpdated !== lastUpdatedRef.current) {
        lastUpdatedRef.current = d.lastUpdated
        fetchClients()
      }
    } catch {
      // ignore transient network errors
    }
  }
  check()
  const id = setInterval(check, 30_000)
  return () => clearInterval(id)
}, [fetchClients])
```

- [ ] **Step 2: Manual test — verify polling works**

With the dev server running:
1. Open `/clients` in the browser
2. In another tab, trigger a brokerage upload via the upload page
3. Within 30 seconds, the client list should automatically show updated TRADED statuses without a manual refresh

- [ ] **Step 3: Commit**

```powershell
git add src/app/(protected)/clients/page.tsx
git commit -m "feat: auto-refresh client list on brokerage upload and monthly reset"
```

---

## Task 4: Add Polling to MF Clients Page

**Files:**
- Modify: `src/app/(protected)/mf/clients/page.tsx`

Same pattern as Task 3 — add the polling `useEffect` alongside the existing `fetchClients` callback.

- [ ] **Step 1: Locate fetchClients in mf/clients/page.tsx**

Open `src/app/(protected)/mf/clients/page.tsx`. Find the `fetchClients` useCallback definition and the `useEffect` that calls it.

- [ ] **Step 2: Add polling useEffect**

After the existing `useEffect` that calls `fetchClients`, add:
```typescript
useEffect(() => {
  const lastUpdatedRef = { current: null as string | null }
  const check = async () => {
    try {
      const res = await fetch('/api/reset-status')
      const d = await res.json()
      if (lastUpdatedRef.current === null) {
        lastUpdatedRef.current = d.lastUpdated
      } else if (d.lastUpdated !== lastUpdatedRef.current) {
        lastUpdatedRef.current = d.lastUpdated
        fetchClients()
      }
    } catch {
      // ignore transient network errors
    }
  }
  check()
  const id = setInterval(check, 30_000)
  return () => clearInterval(id)
}, [fetchClients])
```

- [ ] **Step 3: Commit**

```powershell
git add src/app/(protected)/mf/clients/page.tsx
git commit -m "feat: auto-refresh MF client list on brokerage upload and monthly reset"
```

---

## Task 5: Create `/api/dashboard/mf/not-traded-2months` Endpoint

**Files:**
- Create: `src/app/api/dashboard/mf/not-traded-2months/route.ts`

This endpoint queries `MonthlyArchive` for equity clients whose archived `status` was `NOT_TRADED` in both of the last 2 archived months.

**How month math works:** The monthly reset runs at the start of month M and archives month M-1. So "last 2 archived months" means month M-1 and month M-2 relative to today.

- [ ] **Step 1: Create the route file**

Create `src/app/api/dashboard/mf/not-traded-2months/route.ts`:
```typescript
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRoles = [session.user.role, session.user.secondaryRole].filter(Boolean) as string[]
    if (!userRoles.some((r) => r === 'MF_DEALER' || r === 'SUPER_ADMIN' || r === 'ADMIN')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    // Last archived month = current month - 1
    const m1 = now.getMonth() === 0 ? 12 : now.getMonth()
    const y1 = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    // Month before that = current month - 2
    const m2 = m1 === 1 ? 12 : m1 - 1
    const y2 = m1 === 1 ? y1 - 1 : y1

    // Find equity clients archived as NOT_TRADED in month1 (e.g. April)
    const arch1 = await prisma.monthlyArchive.findMany({
      where: {
        entityType: 'CLIENT_STATUS',
        month: m1,
        year: y1,
        data: { path: ['status'], equals: 'NOT_TRADED' },
      },
      select: { entityId: true },
    })

    if (arch1.length === 0) {
      return NextResponse.json({ success: true, data: { clients: [], count: 0 } })
    }

    const ids1 = arch1.map((a) => a.entityId)

    // Of those, find which were also NOT_TRADED in month2 (e.g. March)
    const arch2 = await prisma.monthlyArchive.findMany({
      where: {
        entityType: 'CLIENT_STATUS',
        month: m2,
        year: y2,
        entityId: { in: ids1 },
        data: { path: ['status'], equals: 'NOT_TRADED' },
      },
      select: { entityId: true },
    })

    if (arch2.length === 0) {
      return NextResponse.json({ success: true, data: { clients: [], count: 0 } })
    }

    const ids2 = arch2.map((a) => a.entityId)

    // Fetch client details for the intersection
    const clients = await prisma.client.findMany({
      where: { id: { in: ids2 }, department: 'EQUITY' },
      select: {
        id: true,
        clientCode: true,
        firstName: true,
        lastName: true,
        phone: true,
        operator: { select: { name: true } },
      },
      orderBy: { lastName: 'asc' },
    })

    return NextResponse.json({
      success: true,
      data: {
        clients: clients.map((c) => ({
          id: c.id,
          clientCode: c.clientCode,
          name: [c.firstName, c.lastName].filter(Boolean).join(' '),
          phone: c.phone,
          operatorName: c.operator.name,
        })),
        count: clients.length,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/mf/not-traded-2months]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Test the endpoint manually**

With the dev server running and logged in as an MF_DEALER or ADMIN, open:
```
http://localhost:3000/api/dashboard/mf/not-traded-2months
```
Expected: `{ "success": true, "data": { "clients": [...], "count": N } }`

If MonthlyArchive has fewer than 2 months of data, expect `count: 0` and empty clients array — that is correct behavior.

- [ ] **Step 3: Verify access control**

Log in as an EQUITY_DEALER and hit the same URL.
Expected: `{ "success": false, "error": "Forbidden" }` with status 403.

- [ ] **Step 4: Commit**

```powershell
git add src/app/api/dashboard/mf/not-traded-2months/route.ts
git commit -m "feat: add MF dashboard endpoint for 2-month consecutive not-traded clients"
```

---

## Task 6: Add 2-Month Not-Traded Section to MF Dashboard

**Files:**
- Modify: `src/app/(protected)/mf/dashboard/page.tsx`

Add a 6th KpiCard showing the count of 2-month not-traded clients, with an expandable table below the cards when clicked.

- [ ] **Step 1: Add new state and fetch**

In `src/app/(protected)/mf/dashboard/page.tsx`, update the imports to add `AlertTriangle`:
```typescript
// BEFORE:
import { Users, Activity, UserX, IndianRupee, TrendingUp } from 'lucide-react'

// AFTER:
import { Users, Activity, UserX, IndianRupee, TrendingUp, AlertTriangle } from 'lucide-react'
```

- [ ] **Step 2: Add the new interface and state**

After the `MFDashData` interface definition, add:
```typescript
interface NotTraded2mClient {
  id: string
  clientCode: string
  name: string
  phone: string
  operatorName: string
}
```

Inside the `MFDashboardPage` component, after the existing state declarations, add:
```typescript
const [notTraded2m, setNotTraded2m] = useState<NotTraded2mClient[]>([])
const [notTraded2mLoading, setNotTraded2mLoading] = useState(true)
const [showNotTraded2mTable, setShowNotTraded2mTable] = useState(false)
```

- [ ] **Step 3: Add the fetch useEffect**

After the existing `useEffect` that fetches `/api/dashboard/mf`, add:
```typescript
useEffect(() => {
  setNotTraded2mLoading(true)
  fetch('/api/dashboard/mf/not-traded-2months')
    .then((r) => r.json())
    .then((d) => { if (d.success) setNotTraded2m(d.data.clients) })
    .catch((e) => console.error(e))
    .finally(() => setNotTraded2mLoading(false))
}, [])
```

- [ ] **Step 4: Update the KPI grid to include the new card**

Replace the existing KPI grid section:
```typescript
// BEFORE:
{loading ? (
  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
  </div>
) : data && (
  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
    <KpiCard title="Total Clients" value={data.totalClients} subtitle="Assigned to you" icon={Users} accent="blue" />
    <KpiCard title="Active Clients" value={data.activeClients} subtitle="Investment done / interested" icon={Activity} accent="green" />
    <KpiCard title="Inactive Clients" value={data.inactiveClients} subtitle="Needs follow-up" icon={UserX} accent="red" />
    <KpiCard title="Total Sales" value={formatCurrency(data.totalSales)} subtitle="This month" icon={TrendingUp} accent="emerald" />
    <KpiCard title="Total Commission" value={formatCurrency(data.totalCommission)} subtitle="This month" icon={IndianRupee} accent="indigo" />
  </div>
)}

// AFTER:
{loading ? (
  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
  </div>
) : data && (
  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
    <KpiCard title="Total Clients" value={data.totalClients} subtitle="Assigned to you" icon={Users} accent="blue" />
    <KpiCard title="Active Clients" value={data.activeClients} subtitle="Investment done / interested" icon={Activity} accent="green" />
    <KpiCard title="Inactive Clients" value={data.inactiveClients} subtitle="Needs follow-up" icon={UserX} accent="red" />
    <KpiCard title="Total Sales" value={formatCurrency(data.totalSales)} subtitle="This month" icon={TrendingUp} accent="emerald" />
    <KpiCard title="Total Commission" value={formatCurrency(data.totalCommission)} subtitle="This month" icon={IndianRupee} accent="indigo" />
  </div>
)}

{notTraded2mLoading ? (
  <Skeleton className="h-28 w-full max-w-xs rounded-lg" />
) : (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <KpiCard
      title="Not Traded (2 Months)"
      value={notTraded2m.length}
      subtitle="Equity clients inactive 2 consecutive months"
      icon={AlertTriangle}
      accent="amber"
      actionLabel={showNotTraded2mTable ? 'Hide list' : 'View list'}
      onAction={() => setShowNotTraded2mTable((v) => !v)}
    />
  </div>
)}
```

- [ ] **Step 5: Add the expandable table below**

After the KPI grid section (after the closing `)}` of the `notTraded2mLoading` block), add:
```typescript
{showNotTraded2mTable && notTraded2m.length > 0 && (
  <div className="overflow-x-auto rounded-lg border border-gray-200">
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          {['Code', 'Name', 'Phone', 'Operator'].map((h) => (
            <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {notTraded2m.map((c) => (
          <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{c.clientCode}</td>
            <td className="px-4 py-3 text-gray-800">{c.name}</td>
            <td className="px-4 py-3 text-gray-600 text-xs">{c.phone}</td>
            <td className="px-4 py-3 text-gray-600 text-xs">{c.operatorName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}

{showNotTraded2mTable && notTraded2m.length === 0 && (
  <p className="text-sm text-gray-400 text-center py-4">No clients inactive for 2 consecutive months.</p>
)}
```

- [ ] **Step 6: TypeScript check**

```powershell
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 7: Manual test**

1. Log in as MF_DEALER — verify the "Not Traded (2 Months)" card appears
2. Click "View list" — verify the table appears or "No clients" message shows
3. Click "Hide list" — verify table collapses
4. Log in as EQUITY_DEALER — verify the card does NOT appear on `/equity/dashboard`

- [ ] **Step 8: Commit**

```powershell
git add src/app/(protected)/mf/dashboard/page.tsx
git commit -m "feat: show 2-month consecutive not-traded equity clients on MF dashboard"
```

---

## Self-Review

**Spec coverage:**
- Fix 1 (auto-trade all operators): Task 1 ✓
- Fix 2 (client list reflects auto-trade): Tasks 2 + 3 + 4 ✓ (polling catches brokerage upload timestamp)
- Fix 3 (client list auto-refresh on monthly reset): Tasks 2 + 3 + 4 ✓ (polling catches archive timestamp)
- Fix 4 (2-month not-traded on MF dashboard, not equity): Tasks 5 + 6 ✓

**Placeholder scan:** No TBDs. All code blocks are complete.

**Type consistency:**
- `NotTraded2mClient` is defined in Task 6 Step 2 and used in Step 4/5 — consistent
- `fetchClients` is referenced in Tasks 3 and 4 — matches the `useCallback` name in both files
- `data.clients` returned from `/api/dashboard/mf/not-traded-2months` matches the `NotTraded2mClient` shape

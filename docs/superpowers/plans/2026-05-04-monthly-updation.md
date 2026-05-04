# Monthly Updation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add month/year filtering to all CRM dashboards and task pages, fix dashboard stale-data bugs, and introduce a monthly client-status reset cron endpoint.

**Architecture:** Per-page month/year selectors (URL params or local state) drive API fetches with `?month=M&year=Y`. APIs determine date ranges server-side. Admin/equity dashboards switch between `Client.status` (current month) and `BrokerageDetail` records (past months) for traded counts. A cron endpoint resets all clients to `NOT_TRADED` on the 1st of each month.

**Tech Stack:** Next.js 14 App Router, Prisma ORM, TypeScript, Tailwind CSS, Shadcn UI (Select component).

---

## What Already Works — Do Not Modify

- MF Business Log page (`/mf/business/log`) — already has month/year selectors
- MF Service Log page (`/mf/service/log`) — already has month/year selectors
- Brokerage page (`/brokerage`) — already has month/year selectors
- `/api/brokerage/log` — already filters by month/year
- `/api/mf-business` — already filters by month/year
- `/api/mf-service` — already filters by month/year

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `src/lib/utils.ts` | Modify | Add `getMonthRange(month, year)` |
| `src/app/api/dashboard/admin/route.ts` | Modify | month/year params, current vs past month traded logic, task filter, cache key fix |
| `src/app/(protected)/dashboard/page.tsx` | Modify | Add month/year selector for KPI cards |
| `src/app/api/dashboard/equity/route.ts` | Modify | month/year params, current vs past month traded logic |
| `src/app/(protected)/equity/dashboard/page.tsx` | Modify | Add month/year selector |
| `src/app/api/dashboard/mf/route.ts` | Modify | month/year params |
| `src/app/(protected)/mf/dashboard/page.tsx` | Modify | Add month/year selector |
| `src/app/api/tasks/route.ts` | Modify | Add month/year filter by `createdAt` |
| `src/app/(protected)/tasks/page.tsx` | Modify | Add month/year selector |
| `src/app/(protected)/equity/tasks/page.tsx` | Modify | Add month/year selector, remove client-side date filter |
| `src/app/(protected)/mf/tasks/page.tsx` | Modify | Add month/year selector |
| `src/app/(protected)/backoffice/tasks/page.tsx` | Modify | Add month/year selector |
| `src/app/api/cron/monthly-reset/route.ts` | Create | Reset all `Client.status` to `NOT_TRADED` |

---

## Task 1: Add `getMonthRange` utility

**Files:**
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: Add `getMonthRange` function**

Open `src/lib/utils.ts` and add after the `getLastMonthRange` function (after line 62):

```typescript
export function getMonthRange(month: number, year: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return { start, end }
}

export function isCurrentMonth(month: number, year: number): boolean {
  const now = new Date()
  return month === now.getMonth() + 1 && year === now.getFullYear()
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat: add getMonthRange and isCurrentMonth utilities"
```

---

## Task 2: Admin dashboard API — month/year params + traded logic + cache fix

**Files:**
- Modify: `src/app/api/dashboard/admin/route.ts`

**Context:** This API currently uses `getCurrentMonthRange()` and caches with key `'dashboard:admin'` (60s TTL). We need:
1. Accept `?month=M&year=Y` params (default to current month)
2. For **current month**: derive `tradedClients` from `Client.status = 'TRADED'` (live, reflects manual updates)
3. For **past months**: existing `BrokerageDetail` logic (unchanged)
4. Cache key: `dashboard:admin:${month}:${year}`; TTL 10s for current month, 300s for past months
5. Task counts filter by `createdAt` in the selected month

- [ ] **Step 1: Replace the GET handler**

Replace the entire content of `src/app/api/dashboard/admin/route.ts` with:

```typescript
import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMonthRange, isCurrentMonth } from '@/lib/utils'
import { getCached, setCache } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = getEffectiveRole(session.user)
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    const year = parseInt(searchParams.get('year') ?? String(now.getFullYear()))
    const currentMonth = isCurrentMonth(month, year)

    const cacheKey = `dashboard:admin:${month}:${year}`
    const cached = getCached<Record<string, unknown>>(cacheKey)
    if (cached) return NextResponse.json({ success: true, data: cached })

    const { start, end } = getMonthRange(month, year)

    // Previous month for brokerage trend comparison
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const { start: lastStart, end: lastEnd } = getMonthRange(prevMonth, prevYear)

    // Build 12-month range for selected year (for brokerage chart)
    const months: Array<{ label: string; start: Date; end: Date }> = []
    for (let m = 0; m < 12; m++) {
      const s = new Date(year, m, 1)
      const e = new Date(year, m + 1, 0, 23, 59, 59)
      months.push({ label: s.toLocaleString('default', { month: 'short', year: '2-digit' }), start: s, end: e })
    }
    const yearStart = new Date(year, 0, 1)
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59)
    const brokerageMonths = months.map((m) => m.label)

    const [
      totalEmployees, equityCount, mfCount,
      pendingTasks, overdueTasks, completedTasks, expiredTasks,
      brokerageSum, lastMonthBrokerageSum, operators, mfBusinessAgg, closedClientsCount,
    ] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.client.count({ where: { department: 'EQUITY' } }),
      prisma.client.count({ where: { department: 'MUTUAL_FUND' } }),
      prisma.task.count({ where: { status: 'PENDING', createdAt: { gte: start, lte: end } } }),
      prisma.task.count({ where: { status: 'PENDING', deadline: { lt: now }, createdAt: { gte: start, lte: end } } }),
      prisma.task.count({ where: { status: 'COMPLETED', createdAt: { gte: start, lte: end } } }),
      prisma.task.count({ where: { status: 'EXPIRED', createdAt: { gte: start, lte: end } } }),
      prisma.brokerageDetail.aggregate({ _sum: { amount: true }, where: { brokerage: { uploadDate: { gte: start, lte: end } } } }),
      prisma.brokerageDetail.aggregate({ _sum: { amount: true }, where: { brokerage: { uploadDate: { gte: lastStart, lte: lastEnd } } } }),
      prisma.employee.findMany({ where: { role: 'EQUITY_DEALER', isActive: true }, select: { id: true, name: true } }),
      prisma.mFBusiness.aggregate({
        _sum: { yearlyContribution: true, commissionAmount: true },
        where: { businessDate: { gte: start, lte: end } },
      }),
      prisma.closedClient.count(),
    ])

    const monthlyBrokerage    = brokerageSum._sum.amount ?? 0
    const lastMonthBrokerage  = lastMonthBrokerageSum._sum.amount ?? 0
    const operatorIds         = operators.map((o) => o.id)

    const [allClientCounts, dnaCounts] = await Promise.all([
      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds } }, _count: { id: true } }),
      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds }, remark: 'DID_NOT_ANSWER' }, _count: { id: true } }),
    ])

    const totalMap = new Map(allClientCounts.map((r) => [r.operatorId, r._count.id]))
    const dnaMap   = new Map(dnaCounts.map((r) => [r.operatorId, r._count.id]))

    let tradedMap: Map<string, number>
    let tradedClients: number
    let monthlyTotalMap = new Map<string, number>()
    let dailyMap        = new Map<string, Record<number, number>>()

    if (currentMonth) {
      // Current month: use Client.status (reflects manual updates + auto-flip)
      const tradedCounts = await prisma.client.groupBy({
        by: ['operatorId'],
        where: { operatorId: { in: operatorIds }, status: 'TRADED' },
        _count: { id: true },
      })
      tradedMap = new Map(tradedCounts.map((r) => [r.operatorId, r._count.id]))
      tradedClients = tradedCounts.reduce((sum, r) => sum + r._count.id, 0)

      // Still compute brokerage amounts and daily breakdown from BrokerageDetail
      const currentMonthDetails = await prisma.brokerageDetail.findMany({
        where: { operatorId: { in: operatorIds }, clientId: { not: null }, brokerage: { uploadDate: { gte: start, lte: end } } },
        select: { operatorId: true, clientId: true, amount: true, brokerage: { select: { uploadDate: true } } },
      })
      for (const d of currentMonthDetails) {
        monthlyTotalMap.set(d.operatorId, (monthlyTotalMap.get(d.operatorId) ?? 0) + d.amount)
        const daily = dailyMap.get(d.operatorId) ?? {}
        const day   = new Date(d.brokerage.uploadDate).getDate()
        daily[day]  = (daily[day] ?? 0) + d.amount
        dailyMap.set(d.operatorId, daily)
      }
    } else {
      // Past month: derive traded from BrokerageDetail records
      const currentMonthDetails = await prisma.brokerageDetail.findMany({
        where: { operatorId: { in: operatorIds }, clientId: { not: null }, brokerage: { uploadDate: { gte: start, lte: end } } },
        select: { operatorId: true, clientId: true, amount: true, brokerage: { select: { uploadDate: true } } },
      })
      const tradedSets = new Map<string, Set<string>>()
      const allTradedIds = new Set<string>()
      for (const d of currentMonthDetails) {
        if (d.clientId) {
          if (!tradedSets.has(d.operatorId)) tradedSets.set(d.operatorId, new Set())
          tradedSets.get(d.operatorId)!.add(d.clientId)
          allTradedIds.add(d.clientId)
        }
        monthlyTotalMap.set(d.operatorId, (monthlyTotalMap.get(d.operatorId) ?? 0) + d.amount)
        const daily = dailyMap.get(d.operatorId) ?? {}
        const day   = new Date(d.brokerage.uploadDate).getDate()
        daily[day]  = (daily[day] ?? 0) + d.amount
        dailyMap.set(d.operatorId, daily)
      }
      tradedMap = new Map([...tradedSets.entries()].map(([id, set]) => [id, set.size]))
      tradedClients = allTradedIds.size
    }

    const yearDetails = await prisma.brokerageDetail.findMany({
      where: { operatorId: { in: operatorIds }, clientId: { not: null }, brokerage: { uploadDate: { gte: yearStart, lte: yearEnd } } },
      select: { operatorId: true, amount: true, brokerage: { select: { uploadDate: true } } },
    })

    const historyMap = new Map<string, Record<string, number>>()
    for (const d of yearDetails) {
      const label = new Date(d.brokerage.uploadDate).toLocaleString('default', { month: 'short', year: '2-digit' })
      const opHist = historyMap.get(d.operatorId) ?? {}
      opHist[label] = (opHist[label] ?? 0) + d.amount
      historyMap.set(d.operatorId, opHist)
    }

    const operatorPerformance = operators.map((op) => {
      const opTotal        = totalMap.get(op.id)  ?? 0
      const opTraded       = tradedMap.get(op.id) ?? 0
      const opDNA          = dnaMap.get(op.id)    ?? 0
      const monthlyTotal   = monthlyTotalMap.get(op.id) ?? 0
      const dailyBreakdown = dailyMap.get(op.id)  ?? {}
      const opHistory      = historyMap.get(op.id) ?? {}
      const monthlyHistory: Record<string, number> = {}
      for (const m of months) monthlyHistory[m.label] = opHistory[m.label] ?? 0

      return {
        operatorId: op.id,
        operatorName: op.name,
        totalClients: opTotal,
        tradedClients: opTraded,
        notTraded: opTotal - opTraded,
        tradedPercentage: opTotal > 0 ? (opTraded / opTotal) * 100 : 0,
        tradedAmountPercent: monthlyBrokerage > 0 ? (monthlyTotal / monthlyBrokerage) * 100 : 0,
        didNotAnswer: opDNA,
        monthlyTotal,
        dailyBreakdown,
        monthlyHistory,
      }
    })

    const brokerageChartData = operatorPerformance.map((op) => ({ name: op.operatorName, ...op.monthlyHistory }))

    const responseData = {
      totalEmployees,
      totalClients: equityCount + mfCount,
      equityClients: equityCount,
      mfClients: mfCount,
      closedClients: closedClientsCount,
      monthlyBrokerage,
      lastMonthBrokerage,
      tradedClients,
      totalEquityClients: equityCount,
      pendingTasks,
      overdueTasks,
      mfTotalSales: mfBusinessAgg._sum.yearlyContribution ?? 0,
      mfTotalCommission: mfBusinessAgg._sum.commissionAmount ?? 0,
      taskStats: { pending: pendingTasks, completed: completedTasks, expired: expiredTasks },
      operatorPerformance: operatorPerformance.map(({ monthlyHistory: _mh, ...rest }) => rest),
      brokerageChartData,
      brokerageMonths,
    }

    // Short TTL for current month (reflects client changes quickly); longer for past months
    setCache(cacheKey, responseData, currentMonth ? 10 : 300)

    return NextResponse.json({ success: true, data: responseData })
  } catch (error) {
    console.error('[GET /api/dashboard/admin]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dashboard/admin/route.ts
git commit -m "feat: add month/year params to admin dashboard API, fix traded count source and cache"
```

---

## Task 3: Admin dashboard page — month/year selector for KPI cards

**Files:**
- Modify: `src/app/(protected)/dashboard/page.tsx`

**Context:** The page currently fetches `/api/dashboard/admin` once on mount with no params and has no month/year selector for the main KPIs. The client-wise brokerage section already has its own `cwMonth`/`cwYear` state — leave that alone.

- [ ] **Step 1: Add month/year state and selector**

In `src/app/(protected)/dashboard/page.tsx`, find the section starting with:
```typescript
export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const today = new Date()
```

Add two new state variables after `const today = new Date()`:
```typescript
  const [dashMonth, setDashMonth] = useState(String(today.getMonth() + 1))
  const [dashYear, setDashYear]   = useState(String(today.getFullYear()))
```

- [ ] **Step 2: Update the admin data fetch to pass month/year**

Find:
```typescript
  useEffect(() => {
    fetch('/api/dashboard/admin')
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [])
```

Replace with:
```typescript
  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/admin?month=${dashMonth}&year=${dashYear}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [dashMonth, dashYear])
```

- [ ] **Step 3: Add month/year selectors to the page header**

Find the Header section:
```typescript
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatDateLong(today)}</p>
        </div>
      </div>
```

Replace with:
```typescript
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatDateLong(today)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dashMonth} onValueChange={setDashMonth}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={dashYear} onValueChange={setDashYear}>
            <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
```

Note: `MONTHS` and `YEARS` constants already exist in this file (lines 19–20).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify in browser**

Start the dev server (`npm run dev`), navigate to `/dashboard`, change month/year, and confirm the KPI cards update. The operator performance table should also refresh.

- [ ] **Step 6: Commit**

```bash
git add src/app/(protected)/dashboard/page.tsx
git commit -m "feat: add month/year selector to admin dashboard KPI cards"
```

---

## Task 4: Equity dashboard API — month/year params + current/past month logic

**Files:**
- Modify: `src/app/api/dashboard/equity/route.ts`

**Context:** Currently hardcoded to current month. `tradedClients` derived from `BrokerageDetail`. We need: current month → `Client.status = TRADED`; past months → `BrokerageDetail`.

- [ ] **Step 1: Replace the GET handler**

Replace the entire content of `src/app/api/dashboard/equity/route.ts` with:

```typescript
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMonthRange, isCurrentMonth } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRoles = [session.user.role, session.user.secondaryRole].filter(Boolean) as string[]
    if (!userRoles.some(r => r === 'EQUITY_DEALER' || r === 'SUPER_ADMIN' || r === 'ADMIN')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()))
    const currentMonth = isCurrentMonth(month, year)

    const isEquityDealer = userRoles.includes('EQUITY_DEALER')
    const operatorId = isEquityDealer
      ? session.user.id
      : (searchParams.get('operatorId') ?? session.user.id)

    const { start, end } = getMonthRange(month, year)

    const totalClients = await prisma.client.count({ where: { operatorId } })

    let tradedClients: number
    let mtdBrokerage: number

    if (currentMonth) {
      // Current month: use Client.status for traded count (reflects manual updates)
      const [tradedCount, brokerageAgg] = await Promise.all([
        prisma.client.count({ where: { operatorId, status: 'TRADED' } }),
        prisma.brokerageDetail.aggregate({
          _sum: { amount: true },
          where: { operatorId, brokerage: { uploadDate: { gte: start, lte: end } } },
        }),
      ])
      tradedClients = tradedCount
      mtdBrokerage  = brokerageAgg._sum.amount ?? 0
    } else {
      // Past month: derive traded from BrokerageDetail
      const uploads = await prisma.brokerageUpload.findMany({
        where: { uploadDate: { gte: start, lte: end } },
        include: {
          details: {
            where: { operatorId },
            select: { clientId: true, amount: true },
          },
        },
      })
      const tradedIds = new Set<string>()
      mtdBrokerage = 0
      for (const u of uploads) {
        for (const d of u.details) {
          if (d.clientId) tradedIds.add(d.clientId)
          mtdBrokerage += d.amount
        }
      }
      tradedClients = tradedIds.size
    }

    const notTraded = totalClients - tradedClients

    return NextResponse.json({
      success: true,
      data: { totalClients, tradedClients, notTraded, mtdBrokerage },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/equity]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dashboard/equity/route.ts
git commit -m "feat: add month/year params to equity dashboard API, fix current-month traded source"
```

---

## Task 5: Equity dashboard page — month/year selector

**Files:**
- Modify: `src/app/(protected)/equity/dashboard/page.tsx`

- [ ] **Step 1: Add MONTHS/YEARS constants and month/year state**

At the top of `src/app/(protected)/equity/dashboard/page.tsx`, after the imports, add:

```typescript
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(0, i).toLocaleString('default', { month: 'long' }) }))
const YEARS  = ['2024', '2025', '2026', '2027'].map((y) => ({ value: y, label: y }))
```

- [ ] **Step 2: Add month/year state inside the component**

Inside `EquityDashboardPage`, after `const today = new Date()`, replace:
```typescript
  const currentMonth = today.getMonth() + 1
  const currentYear = today.getFullYear()
```
With:
```typescript
  const [month, setMonth] = useState(String(today.getMonth() + 1))
  const [year, setYear]   = useState(String(today.getFullYear()))
```

- [ ] **Step 3: Update fetches to use month/year state**

Replace:
```typescript
  useEffect(() => {
    fetch('/api/dashboard/equity')
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))

    fetch(`/api/mf-business/stats?month=${currentMonth}&year=${currentYear}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setMfStats(d.data) })
      .finally(() => setMfLoading(false))
  }, [currentMonth, currentYear])
```
With:
```typescript
  useEffect(() => {
    setLoading(true)
    fetch(`/api/dashboard/equity?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))

    setMfLoading(true)
    fetch(`/api/mf-business/stats?month=${month}&year=${year}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setMfStats(d.data) })
      .finally(() => setMfLoading(false))
  }, [month, year])
```

- [ ] **Step 4: Add month/year selectors to the page header**

Add these imports at the top (after existing imports):
```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```

Find the welcome banner section:
```typescript
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here's your work overview for today</p>
        </div>
        <p className="text-sm text-gray-500 hidden md:block">{formatDateLong(today)}</p>
      </div>
```

Replace with:
```typescript
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here&apos;s your work overview for today</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Verify in browser**

Navigate to `/equity/dashboard`, change month/year — KPI cards and MF section should update.

- [ ] **Step 7: Commit**

```bash
git add src/app/(protected)/equity/dashboard/page.tsx
git commit -m "feat: add month/year selector to equity dashboard"
```

---

## Task 6: MF dashboard API — month/year params

**Files:**
- Modify: `src/app/api/dashboard/mf/route.ts`

- [ ] **Step 1: Add month/year params and use getMonthRange**

Replace the existing GET handler content with:

```typescript
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMonthRange } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRoles = [session.user.role, session.user.secondaryRole].filter(Boolean) as string[]
    if (!userRoles.some(r => r === 'MF_DEALER' || r === 'SUPER_ADMIN' || r === 'ADMIN')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()))
    const myBusinessOnly = searchParams.get('myBusinessOnly') === 'true'

    const { start, end } = getMonthRange(month, year)

    const businessWhere: Record<string, unknown> = {
      employeeId: session.user.id,
      businessDate: { gte: start, lte: end },
    }
    if (myBusinessOnly) {
      businessWhere.referredById = null
    }

    const [totalClients, activeClients, inactiveClients, businessAgg] = await Promise.all([
      prisma.client.count({ where: { department: 'MUTUAL_FUND' } }),
      prisma.client.count({ where: { department: 'MUTUAL_FUND', mfStatus: 'ACTIVE' } }),
      prisma.client.count({ where: { department: 'MUTUAL_FUND', mfStatus: 'INACTIVE' } }),
      prisma.mFBusiness.aggregate({
        where: businessWhere,
        _sum: { yearlyContribution: true, commissionAmount: true },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        totalClients,
        activeClients,
        inactiveClients,
        totalSales: businessAgg._sum.yearlyContribution ?? 0,
        totalCommission: businessAgg._sum.commissionAmount ?? 0,
      },
    })
  } catch (error) {
    console.error('[GET /api/dashboard/mf]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dashboard/mf/route.ts
git commit -m "feat: add month/year params to MF dashboard API"
```

---

## Task 7: MF dashboard page — month/year selector

**Files:**
- Modify: `src/app/(protected)/mf/dashboard/page.tsx`

- [ ] **Step 1: Add MONTHS/YEARS constants**

After the imports in `src/app/(protected)/mf/dashboard/page.tsx`, add:

```typescript
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(0, i).toLocaleString('default', { month: 'long' }) }))
const YEARS  = ['2024', '2025', '2026', '2027'].map((y) => ({ value: y, label: y }))
```

- [ ] **Step 2: Add month/year state inside the component**

Inside `MFDashboardPage`, after `const today = new Date()`, add:

```typescript
  const [month, setMonth] = useState(String(today.getMonth() + 1))
  const [year, setYear]   = useState(String(today.getFullYear()))
```

- [ ] **Step 3: Update fetch to use month/year**

Replace:
```typescript
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (myBusinessOnly) params.set('myBusinessOnly', 'true')
    fetch(`/api/dashboard/mf?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [myBusinessOnly])
```
With:
```typescript
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ month, year })
    if (myBusinessOnly) params.set('myBusinessOnly', 'true')
    fetch(`/api/dashboard/mf?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [month, year, myBusinessOnly])
```

- [ ] **Step 4: Add selectors to the header**

Add this import if not already present:
```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```

Find:
```typescript
          <p className="text-sm text-gray-500 hidden md:block">{formatDateLong(today)}</p>
```

Replace with:
```typescript
          <div className="flex items-center gap-2">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{YEARS.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Verify in browser**

Navigate to `/mf/dashboard`, change month/year — KPI cards should update.

- [ ] **Step 7: Commit**

```bash
git add src/app/(protected)/mf/dashboard/page.tsx
git commit -m "feat: add month/year selector to MF dashboard"
```

---

## Task 8: Tasks API — month/year filter by `createdAt`

**Files:**
- Modify: `src/app/api/tasks/route.ts`

**Context:** Currently, tasks are filtered by `deadline` range only (via `dateFrom`/`dateTo` params). We add `month`/`year` params that filter by `createdAt`.

- [ ] **Step 1: Add month/year params to GET handler**

In `src/app/api/tasks/route.ts`, find the params section in the GET handler:

```typescript
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
```

After those two lines, add:

```typescript
    const monthParam = searchParams.get('month')
    const yearParam  = searchParams.get('year')
```

- [ ] **Step 2: Add createdAt filter to `where` clause**

Find the section after the role-based `where` filters (around line 68):
```typescript
    if (status) where.status = status
    if (priority) where.priority = priority
```

After those lines, add:

```typescript
    if (monthParam && yearParam) {
      const m = parseInt(monthParam)
      const y = parseInt(yearParam)
      const createdStart = new Date(y, m - 1, 1)
      const createdEnd   = new Date(y, m, 0, 23, 59, 59, 999)
      where.createdAt = { gte: createdStart, lte: createdEnd }
    }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tasks/route.ts
git commit -m "feat: add month/year createdAt filter to tasks API"
```

---

## Task 9: Task pages — month/year selectors (all four pages)

**Files:**
- Modify: `src/app/(protected)/tasks/page.tsx`
- Modify: `src/app/(protected)/equity/tasks/page.tsx`
- Modify: `src/app/(protected)/mf/tasks/page.tsx`
- Modify: `src/app/(protected)/backoffice/tasks/page.tsx`

**Context:** All four task pages fetch `/api/tasks` without month/year params. The equity tasks page additionally has a client-side filter on line 68 (`filter((t) => new Date(t.createdAt) >= monthStart)`) that we replace with server-side filtering.

Apply these changes to **each of the four files**:

### Step-by-step (repeat for each file)

- [ ] **Step 1: Add MONTHS/YEARS constants** (if not already in the file)

After the imports in each task page file, add:

```typescript
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(0, i).toLocaleString('default', { month: 'long' }) }))
const YEARS  = ['2024', '2025', '2026', '2027'].map((y) => ({ value: y, label: y }))
```

- [ ] **Step 2: Add month/year state inside the component function**

Inside the main component function (or the inner `Content` function for pages wrapped in `Suspense`), after existing state declarations, add:

```typescript
  const now2 = new Date()
  const [taskMonth, setTaskMonth] = useState(String(now2.getMonth() + 1))
  const [taskYear, setTaskYear]   = useState(String(now2.getFullYear()))
```

(Use `now2` to avoid name collision with any existing `now` variable in the file.)

- [ ] **Step 3: Pass month/year to the API fetch**

In the `fetchTasks` function (or equivalent), in the `params` URLSearchParams construction, add:

```typescript
    params.set('month', taskMonth)
    params.set('year', taskYear)
```

Also add `taskMonth` and `taskYear` to the `useCallback` dependency array.

- [ ] **Step 4: For equity tasks page only — remove client-side date filter**

In `src/app/(protected)/equity/tasks/page.tsx`, find:
```typescript
          // Equity department: auto-reset monthly — only show current month's tasks
          const now = new Date()
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
          const filtered = (d.data.tasks || []).filter((t: TaskWithRelations) => new Date(t.createdAt) >= monthStart)
          setTasks(filtered)
```

Replace with:
```typescript
          setTasks(d.data.tasks || [])
```

- [ ] **Step 5: Add month/year selectors to the page header UI**

In each page, find the header/filter bar area (where existing status/priority Select components are). Add the month/year selectors alongside them:

```typescript
          <Select value={taskMonth} onValueChange={setTaskMonth}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={taskYear} onValueChange={setTaskYear}>
            <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
          </Select>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Verify in browser**

Open each task page, change month/year — task list should filter to tasks created in that month.

- [ ] **Step 8: Commit**

```bash
git add src/app/(protected)/tasks/page.tsx src/app/(protected)/equity/tasks/page.tsx src/app/(protected)/mf/tasks/page.tsx src/app/(protected)/backoffice/tasks/page.tsx
git commit -m "feat: add month/year selector to all task pages"
```

---

## Task 10: Cron endpoint — monthly client status reset

**Files:**
- Create: `src/app/api/cron/monthly-reset/route.ts`

**Context:** This endpoint resets all `Client.status` to `NOT_TRADED` on the 1st of each month. It is called by an external scheduler (Vercel Cron, cron-job.org, etc.) with a `Authorization: Bearer <secret>` header. The secret is stored in the `CRON_SECRET` environment variable.

- [ ] **Step 1: Create the cron endpoint**

Create `src/app/api/cron/monthly-reset/route.ts` with the following content:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { invalidateCache } from '@/lib/cache'

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await prisma.client.updateMany({
      where: { status: 'TRADED' },
      data: { status: 'NOT_TRADED' },
    })

    // Invalidate all dashboard caches so next load reflects the reset
    invalidateCache('dashboard:admin')
    invalidateCache('dashboard:equity')

    return NextResponse.json({
      success: true,
      data: { resetCount: result.count },
      message: `Reset ${result.count} clients to NOT_TRADED`,
    })
  } catch (error) {
    console.error('[POST /api/cron/monthly-reset]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Add `CRON_SECRET` to `.env.local`**

Open `.env.local` (or create it if it doesn't exist) and add:

```
CRON_SECRET=your-random-secret-here
```

Generate a secure value: run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and use the output.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Test the endpoint manually**

```bash
curl -X POST http://localhost:3000/api/cron/monthly-reset \
  -H "Authorization: Bearer your-random-secret-here"
```

Expected response:
```json
{ "success": true, "data": { "resetCount": 42 }, "message": "Reset 42 clients to NOT_TRADED" }
```

(Count varies based on how many clients are currently TRADED.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/monthly-reset/route.ts .env.local
git commit -m "feat: add monthly cron endpoint to reset all Client.status to NOT_TRADED"
```

- [ ] **Step 6: Set up the scheduler**

Configure your scheduler (Vercel Cron or cron-job.org) to call:
- URL: `https://your-domain.com/api/cron/monthly-reset`
- Method: POST
- Schedule: `0 0 1 * *` (midnight on the 1st of each month)
- Header: `Authorization: Bearer <your-CRON_SECRET>`

Also add `CRON_SECRET` to your production environment variables.

---

## Self-Review Checklist

After all tasks are complete, verify:

- [ ] `/dashboard` — month/year selector changes all KPI cards (traded, brokerage, tasks)
- [ ] `/equity/dashboard` — month/year selector changes all KPI cards; current month uses `Client.status` for traded count
- [ ] `/mf/dashboard` — month/year selector changes KPI cards
- [ ] `/tasks`, `/equity/tasks`, `/mf/tasks`, `/backoffice/tasks` — month/year selector filters tasks by `createdAt`
- [ ] Equity tasks page no longer has client-side date filter (removed in Task 9 Step 4)
- [ ] Admin dashboard cache key includes month/year; current month TTL = 10s
- [ ] Cron endpoint returns 401 for missing/wrong secret
- [ ] `getMonthRange` and `isCurrentMonth` are exported from `src/lib/utils.ts`
- [ ] All TypeScript compiles with no errors (`npx tsc --noEmit`)

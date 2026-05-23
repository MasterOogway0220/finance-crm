# Hybrid Brokerage Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop historical brokerage/client data from changing when admins reshuffle assignments, while keeping mid-month transfers working sensibly. Past-month views attribute by the original `BrokerageDetail.operatorId` snapshot; current-month views attribute by the live `Client.operatorId`. Also fix the dashboard-vs-list divergence ("Vishaka shows 1 on dashboard, 3 on list").

**Architecture:** A single helper (`src/lib/brokerage-attribution.ts`) returns the correct Prisma `where` clause for a given month/year. Every read endpoint that aggregates brokerage calls it. For multi-month queries, the query is split into two Prisma calls — one for closed-month rows (snapshot attribution), one for the current month (current-owner attribution) — and the results are merged in memory. No schema change. No data migration. `BrokerageDetail.operatorId` is left as-is (it is already the correct snapshot for every row uploaded before today).

**Tech Stack:** Next.js 16 (App Router), Prisma 6, TypeScript, MySQL. No automated test framework — verification uses standalone `scripts/verify-*.ts` files run with `npx ts-node`, matching the existing diagnostic pattern in `scripts/verify-akshita-brokerage.ts` and `scripts/verify-current-owner-attribution.ts`.

**Critical pre-condition:** The `BrokerageDetail.operatorId` column must currently hold true historical snapshots, not the post-`d6dd4a2` cascaded values. The cascade was reverted by `scripts/revert-brokerage-operator-backfill.ts` (committed in `b83cd65`), but it is **not confirmed** that script has been executed against production. Task 0 verifies this before any code changes.

---

### Task 0: Confirm snapshot integrity before any changes

**Files:**
- Create: `scripts/verify-snapshot-integrity.ts`

**Why this task exists:** If the `d6dd4a2` cascade is still in the live DB, every "snapshot" filter we add will return wrong-but-believable numbers (whoever was the current owner on May 21, 2026 — the cascade date — instead of the true historical operator). The rest of the plan is unsafe to execute until this is confirmed.

- [ ] **Step 1: Write the snapshot-integrity diagnostic**

Create `scripts/verify-snapshot-integrity.ts`:

```ts
/**
 * verify-snapshot-integrity.ts
 *
 * Read-only. Confirms BrokerageDetail.operatorId snapshots reflect true historical
 * attribution (not the d6dd4a2 cascade).
 *
 * Indicator of a healthy snapshot:
 *   - For each (clientId, brokerageId) row, the recorded operatorId should appear
 *     in the EmployeeLoginLog or BrokerageUpload audit trail around the upload date.
 *   - More usefully: rows whose snapshot operatorId differs from the client's CURRENT
 *     operatorId indicate transfers happened — that divergence is expected and healthy.
 *   - If snapshot == current for 100% of rows, the cascade was NOT reverted and we
 *     must run scripts/revert-brokerage-operator-backfill.ts first.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const totalRows = await prisma.brokerageDetail.count({ where: { clientId: { not: null } } });

  // Count rows where snapshot operatorId != current client.operatorId.
  // Use a raw query because Prisma can't compare two columns from joined tables directly.
  const divergent = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM BrokerageDetail bd
    JOIN Client c ON bd.clientId = c.id
    WHERE bd.operatorId <> c.operatorId
  `;
  const divergentCount = Number(divergent[0]?.count ?? 0);

  console.log('═'.repeat(70));
  console.log('Snapshot integrity check');
  console.log('═'.repeat(70));
  console.log(`Total BrokerageDetail rows with linked client:  ${totalRows}`);
  console.log(`Rows where snapshot != current owner (transferred clients): ${divergentCount}`);
  console.log(`Divergence rate: ${((divergentCount / totalRows) * 100).toFixed(2)}%`);
  console.log();

  if (divergentCount === 0) {
    console.log('⚠  ZERO divergence detected. Two possible interpretations:');
    console.log('   (a) No client has ever been transferred (unlikely in production)');
    console.log('   (b) The d6dd4a2 backfill cascade is still in effect (UNSAFE TO PROCEED)');
    console.log();
    console.log('   Run `npx ts-node scripts/revert-brokerage-operator-backfill.ts` to restore');
    console.log('   true snapshots, then re-run this script. Expected post-revert divergence');
    console.log('   for this DB: 196 rows (per b83cd65 commit message).');
    process.exit(1);
  } else {
    console.log('✓ Snapshot has divergence from current owners — historical attribution is intact.');
    console.log('  Safe to proceed with hybrid attribution plan.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the diagnostic**

Run: `npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/verify-snapshot-integrity.ts`

Expected (healthy): exits 0, prints "✓ Snapshot has divergence from current owners".
Expected (unhealthy): exits 1, prints instructions to run the revert script.

**If unhealthy:** STOP. Run `npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/revert-brokerage-operator-backfill.ts` first, then re-run Step 2. Do NOT proceed to Task 1 until Step 2 passes.

- [ ] **Step 3: Commit the diagnostic script**

```bash
git add scripts/verify-snapshot-integrity.ts
git commit -m "chore: add snapshot integrity diagnostic as pre-flight for hybrid attribution"
```

---

### Task 1: Create the brokerage-attribution helper

**Files:**
- Create: `src/lib/brokerage-attribution.ts`

**Responsibility:** One function. Given an operator scope (single id, array of ids, or null=all) and a month/year, return the Prisma `where` fragment to apply to `BrokerageDetail` queries. Encapsulates the hybrid rule so callers don't repeat it.

- [ ] **Step 1: Write the helper**

Create `src/lib/brokerage-attribution.ts`:

```ts
import type { Prisma } from '@prisma/client'
import { isCurrentMonth } from '@/lib/utils'

/**
 * Returns the Prisma `where` fragment that restricts BrokerageDetail rows to a
 * given operator scope, applying hybrid attribution:
 *
 *   - For the current calendar month: filter by Client.operatorId (current owner).
 *     Mid-month transfers move credit to the new owner.
 *   - For any past month: filter by BrokerageDetail.operatorId (snapshot at upload).
 *     Closed months are immutable — transfers don't shift past attribution.
 *
 * Caller composes the result into the full where clause, e.g.
 *   const where = { ...brokerageOperatorFilter(opId, month, year), brokerage: { isActive: true, ... } }
 *
 * Scope semantics:
 *   - string         → single operator
 *   - string[]       → multiple operators (admin view across dealers)
 *   - null/undefined → no operator restriction (admin "all")
 */
export function brokerageOperatorFilter(
  scope: string | string[] | null | undefined,
  month: number,
  year: number,
): Prisma.BrokerageDetailWhereInput {
  if (scope == null) return {}
  const isCurrent = isCurrentMonth(month, year)
  if (Array.isArray(scope)) {
    return isCurrent
      ? { client: { operatorId: { in: scope } } }
      : { operatorId: { in: scope } }
  }
  return isCurrent
    ? { client: { operatorId: scope } }
    : { operatorId: scope }
}

/**
 * Like brokerageOperatorFilter but for a SINGLE day of brokerage rows.
 * Day → month/year is derived from the date itself, so this function decides
 * current vs snapshot based on the date being viewed, not "today".
 *
 * Returns both the operator filter AND a flag indicating which attribution was used,
 * so callers building merged results know which clientId they should read
 * (`client.operatorId` for current, `operatorId` for snapshot).
 */
export function brokerageOperatorFilterForDate(
  scope: string | string[] | null | undefined,
  date: Date,
): { where: Prisma.BrokerageDetailWhereInput; attribution: 'current' | 'snapshot' } {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  const isCurrent = isCurrentMonth(month, year)
  return {
    where: brokerageOperatorFilter(scope, month, year),
    attribution: isCurrent ? 'current' : 'snapshot',
  }
}
```

- [ ] **Step 2: Write a unit-style verification of the helper**

Create `scripts/verify-attribution-helper.ts`:

```ts
/**
 * verify-attribution-helper.ts
 *
 * Stand-alone unit assertions for src/lib/brokerage-attribution.ts.
 * No DB access — pure logic check.
 */
import { brokerageOperatorFilter } from '../src/lib/brokerage-attribution'

const now = new Date()
const curMonth = now.getMonth() + 1
const curYear = now.getFullYear()
const pastMonth = curMonth === 1 ? 12 : curMonth - 1
const pastYear = curMonth === 1 ? curYear - 1 : curYear

function eq(label: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) { console.error(`✗ ${label}\n   got:  ${a}\n   want: ${b}`); process.exit(1) }
  console.log(`✓ ${label}`)
}

// Single id, current month → current-owner join
eq('single id, current month',
  brokerageOperatorFilter('op1', curMonth, curYear),
  { client: { operatorId: 'op1' } })

// Single id, past month → snapshot column
eq('single id, past month',
  brokerageOperatorFilter('op1', pastMonth, pastYear),
  { operatorId: 'op1' })

// Array, current month → current-owner IN
eq('array, current month',
  brokerageOperatorFilter(['a', 'b'], curMonth, curYear),
  { client: { operatorId: { in: ['a', 'b'] } } })

// Array, past month → snapshot IN
eq('array, past month',
  brokerageOperatorFilter(['a', 'b'], pastMonth, pastYear),
  { operatorId: { in: ['a', 'b'] } })

// null scope → empty (no operator restriction)
eq('null scope', brokerageOperatorFilter(null, curMonth, curYear), {})
eq('undefined scope', brokerageOperatorFilter(undefined, pastMonth, pastYear), {})

console.log('\nAll helper assertions pass.')
```

- [ ] **Step 3: Run the helper verification**

Run: `npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/verify-attribution-helper.ts`

Expected: 6 `✓` lines, ends with "All helper assertions pass." Exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/brokerage-attribution.ts scripts/verify-attribution-helper.ts
git commit -m "feat: add brokerageOperatorFilter helper for hybrid attribution"
```

---

### Task 2: Update equity dashboard endpoint

**Files:**
- Modify: `src/app/api/dashboard/equity/route.ts`

**Why:** This is the simplest consumer — a single month, a single operator. Good first integration.

- [ ] **Step 1: Replace the brokerage query with the helper**

In `src/app/api/dashboard/equity/route.ts`, change the import block and the `prisma.brokerageDetail.findMany` call.

Add this import at the top with the other imports:

```ts
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'
```

Replace the block at lines 36-47:

```ts
    // Derive traded count + MTD brokerage from BrokerageDetail.
    // Attribution by CURRENT client owner: brokerage for transferred-in clients
    // (including pre-transfer history) shows up under the current operator.
    // The BrokerageDetail.operatorId snapshot is preserved untouched but not used here.
    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        client: { operatorId },
        brokerage: { isActive: true, uploadDate: { gte: start, lte: end } },
      },
      select: { clientId: true, amount: true },
    })
```

…with:

```ts
    // Hybrid attribution: current month → live ownership; past months → snapshot.
    // See src/lib/brokerage-attribution.ts.
    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        ...brokerageOperatorFilter(operatorId, month, year),
        brokerage: { isActive: true, uploadDate: { gte: start, lte: end } },
      },
      select: { clientId: true, amount: true },
    })
```

- [ ] **Step 2: Verify the change typechecks**

Run: `npx tsc --noEmit`

Expected: no errors related to `dashboard/equity/route.ts` or `brokerage-attribution.ts`.

- [ ] **Step 3: Diagnostic on real data**

Create `scripts/verify-equity-dashboard-hybrid.ts`:

```ts
/**
 * verify-equity-dashboard-hybrid.ts
 *
 * Picks an equity dealer who currently has at least one transferred-in client
 * (BrokerageDetail.operatorId != Client.operatorId), and prints the traded-clients
 * count under each of:
 *   - current month, current-owner attribution (what dashboard now returns)
 *   - same month, snapshot attribution (what dashboard would have returned pre-fix)
 *   - a past month under both attributions (current-owner should NOT be used for past)
 *
 * Run this before AND after the dashboard change. Numbers should agree with the
 * dashboard UI after the change.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const now = new Date()
  const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const curMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  const pastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const pastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

  // Pick the equity dealer with the most transferred-in clients (best signal)
  const candidates = await prisma.$queryRaw<{ operatorId: string; transferred: bigint }[]>`
    SELECT c.operatorId, COUNT(DISTINCT bd.clientId) as transferred
    FROM BrokerageDetail bd
    JOIN Client c ON bd.clientId = c.id
    WHERE bd.operatorId <> c.operatorId
    GROUP BY c.operatorId
    ORDER BY transferred DESC
    LIMIT 1
  `
  if (candidates.length === 0) { console.log('No transferred clients in DB — no signal to test.'); return }
  const opId = candidates[0].operatorId
  const op = await prisma.employee.findUnique({ where: { id: opId }, select: { name: true } })
  console.log(`Subject operator: ${op?.name} (${opId})`)
  console.log('—'.repeat(60))

  // Current month under both attributions
  const curByOwner = await prisma.brokerageDetail.findMany({
    where: { clientId: { not: null }, client: { operatorId: opId }, brokerage: { isActive: true, uploadDate: { gte: curMonthStart, lte: curMonthEnd } } },
    select: { clientId: true, amount: true },
  })
  const curBySnapshot = await prisma.brokerageDetail.findMany({
    where: { clientId: { not: null }, operatorId: opId, brokerage: { isActive: true, uploadDate: { gte: curMonthStart, lte: curMonthEnd } } },
    select: { clientId: true, amount: true },
  })
  console.log(`Current month  by-owner    : ${new Set(curByOwner.map(d => d.clientId)).size} traded, ₹${curByOwner.reduce((s,d)=>s+d.amount,0).toFixed(0)}`)
  console.log(`Current month  by-snapshot : ${new Set(curBySnapshot.map(d => d.clientId)).size} traded, ₹${curBySnapshot.reduce((s,d)=>s+d.amount,0).toFixed(0)}`)
  console.log('(Current month dashboard should now match BY-OWNER row above.)')

  // Past month under both
  const pastByOwner = await prisma.brokerageDetail.findMany({
    where: { clientId: { not: null }, client: { operatorId: opId }, brokerage: { isActive: true, uploadDate: { gte: pastMonthStart, lte: pastMonthEnd } } },
    select: { clientId: true, amount: true },
  })
  const pastBySnapshot = await prisma.brokerageDetail.findMany({
    where: { clientId: { not: null }, operatorId: opId, brokerage: { isActive: true, uploadDate: { gte: pastMonthStart, lte: pastMonthEnd } } },
    select: { clientId: true, amount: true },
  })
  console.log(`Past month     by-owner    : ${new Set(pastByOwner.map(d => d.clientId)).size} traded, ₹${pastByOwner.reduce((s,d)=>s+d.amount,0).toFixed(0)}`)
  console.log(`Past month     by-snapshot : ${new Set(pastBySnapshot.map(d => d.clientId)).size} traded, ₹${pastBySnapshot.reduce((s,d)=>s+d.amount,0).toFixed(0)}`)
  console.log('(Past month dashboard should now match BY-SNAPSHOT row above — the frozen historical credit.)')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
```

Run: `npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/verify-equity-dashboard-hybrid.ts`

Expected: prints two pairs of numbers. The numbers in each pair MAY differ (and should differ for an operator with transferred clients) — that's the whole point of hybrid. Note the by-owner numbers for the current month — when you load the equity dashboard in the browser, the "Traded Clients" KPI must equal that number.

- [ ] **Step 4: Manual browser check**

Start the dev server in the background. Log in as an equity dealer (test credentials in `prisma/seed-test-users.ts`). Open `/equity/dashboard`. The "Traded Clients" KPI should match the BY-OWNER number from Step 3 for the current month. Switch the month/year selector to last month — the KPI should now match the BY-SNAPSHOT number for that month.

Run: `npm run dev` (in background)

Expected: dev server starts on port 3000. KPI values match the verify-script output. If they don't, debug before continuing — do NOT proceed to Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/dashboard/equity/route.ts scripts/verify-equity-dashboard-hybrid.ts
git commit -m "fix(dashboard/equity): hybrid attribution — snapshot for closed months, current owner for live month"
```

---

### Task 3: Fix the clients list (resolves the Vishaka dashboard-vs-list bug)

**Files:**
- Modify: `src/app/api/clients/route.ts`

**Why:** The `tradedThisMonth` per-row flag and the TRADED status filter on the clients list both reference *this month only* — so under hybrid they always use current-owner attribution. This realigns them with the equity dashboard.

- [ ] **Step 1: Add the helper import**

In `src/app/api/clients/route.ts`, add:

```ts
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'
```

- [ ] **Step 2: Update the TRADED/NOT_TRADED status filter**

Replace lines 101-117:

```ts
    if (status) {
      const isEquityScope = !department || department === 'EQUITY'
      if (isEquityScope) {
        const now = new Date()
        const { start, end } = getMonthRange(now.getMonth() + 1, now.getFullYear())
        where.department = 'EQUITY'
        const detailFilter: Record<string, unknown> = { brokerage: { isActive: true, uploadDate: { gte: start, lte: end } } }
        if (brokerageOperatorScope) detailFilter.operatorId = brokerageOperatorScope
        if (status === 'TRADED') {
          where.brokerageDetails = { some: detailFilter }
        } else {
          where.brokerageDetails = { none: detailFilter }
        }
      } else {
        where.status = status
      }
    }
```

…with:

```ts
    if (status) {
      const isEquityScope = !department || department === 'EQUITY'
      if (isEquityScope) {
        const now = new Date()
        const curMonth = now.getMonth() + 1
        const curYear = now.getFullYear()
        const { start, end } = getMonthRange(curMonth, curYear)
        where.department = 'EQUITY'
        // tradedThisMonth always refers to the current month → hybrid resolves to current-owner attribution.
        // But Client is already the parent record, so attribution by Client.operatorId is already implicit
        // through where.operatorId. The detailFilter only needs the date window.
        const detailFilter: Prisma.BrokerageDetailWhereInput = {
          brokerage: { isActive: true, uploadDate: { gte: start, lte: end } },
        }
        if (status === 'TRADED') {
          where.brokerageDetails = { some: detailFilter }
        } else {
          where.brokerageDetails = { none: detailFilter }
        }
      } else {
        where.status = status
      }
    }
```

**Why the simplification:** This query starts from `Client` and traverses to `brokerageDetails`. The clients returned are already scoped to `where.operatorId` (the current owner). So checking "does this client have any brokerage row this month" is exactly the current-owner-attribution semantic we want for the current month. We can drop the `brokerageOperatorScope` filter on the brokerage row entirely — it was enforcing snapshot semantics for the *same* set of clients that current-owner had already produced, which is what made the count differ from the dashboard.

- [ ] **Step 3: Update the tradedThisMonth per-row flag**

Replace lines 169-185:

```ts
    // Compute tradedThisMonth for EQUITY clients from BrokerageDetail.
    // Scope to brokerageOperatorScope (operator's own ID) when set so the count matches
    // the brokerage page, which attributes trades by BrokerageDetail.operatorId.
    const now = new Date()
    const { start: mStart, end: mEnd } = getMonthRange(now.getMonth() + 1, now.getFullYear())
    const equityIds = clients.filter(c => c.department === 'EQUITY').map(c => c.id)
    const tradedSet = new Set<string>()
    if (equityIds.length > 0) {
      const tradedDetailWhere: Prisma.BrokerageDetailWhereInput = {
        clientId: { in: equityIds },
        brokerage: { isActive: true, uploadDate: { gte: mStart, lte: mEnd } },
      }
      if (brokerageOperatorScope) tradedDetailWhere.operatorId = brokerageOperatorScope
      const tradedRows = await prisma.brokerageDetail.findMany({
        where: tradedDetailWhere,
        select: { clientId: true },
        distinct: ['clientId'],
      })
      tradedRows.forEach(r => { if (r.clientId) tradedSet.add(r.clientId) })
    }
```

…with:

```ts
    // tradedThisMonth: a client is "traded this month" iff there is at least one brokerage
    // row in the current month for that client. Attribution by current owner is implicit
    // since `equityIds` only includes clients already in the page set (scoped by current owner).
    const now = new Date()
    const { start: mStart, end: mEnd } = getMonthRange(now.getMonth() + 1, now.getFullYear())
    const equityIds = clients.filter(c => c.department === 'EQUITY').map(c => c.id)
    const tradedSet = new Set<string>()
    if (equityIds.length > 0) {
      const tradedRows = await prisma.brokerageDetail.findMany({
        where: {
          clientId: { in: equityIds },
          brokerage: { isActive: true, uploadDate: { gte: mStart, lte: mEnd } },
        },
        select: { clientId: true },
        distinct: ['clientId'],
      })
      tradedRows.forEach(r => { if (r.clientId) tradedSet.add(r.clientId) })
    }
```

- [ ] **Step 4: Remove the now-unused `brokerageOperatorScope` plumbing**

Lines 92-99 currently track `brokerageOperatorScope` solely for the two queries we just simplified. Verify it has no other users in the file (`grep brokerageOperatorScope src/app/api/clients/route.ts` should now return only the declaration/assignment). If clean, remove:

Delete lines 92-99 (the `let brokerageOperatorScope: string | null = null` block) and replace with a simpler operator scoping block:

```ts
    // EQUITY_DEALER can only see their own clients.
    if (userRole === 'EQUITY_DEALER') {
      where.operatorId = session.user.id
    } else if (operatorIdParam) {
      where.operatorId = operatorIdParam
    }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Browser verification — the Vishaka bug**

With dev server running, log in as the dealer with transferred-in clients (use the one Task 2's diagnostic identified). Open `/equity/dashboard` and `/equity/clients` in two tabs.

The number on the dashboard's "Traded Clients" KPI must equal the count of TRADED-badged clients on the list page **for the current month**. Switch the month selector (if present on the list page) and confirm they continue to match.

Expected: numbers identical. If not, stop and investigate.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/clients/route.ts
git commit -m "fix(clients): align traded-this-month with dashboard via hybrid attribution"
```

---

### Task 4: Update brokerage/daily endpoint

**Files:**
- Modify: `src/app/api/brokerage/daily/route.ts`

- [ ] **Step 1: Add helper import**

```ts
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'
```

- [ ] **Step 2: Replace the query**

Replace lines 40-52:

```ts
    // Attribution by CURRENT client owner — transferred clients' history follows
    // the client through transfers. BrokerageDetail.operatorId snapshot is preserved.
    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        client: { operatorId },
        brokerage: { isActive: true, uploadDate: { gte: monthStart, lte: monthEnd } },
      },
      select: {
        amount: true,
        brokerage: { select: { uploadDate: true } },
      },
    })
```

…with:

```ts
    // Hybrid attribution — see src/lib/brokerage-attribution.ts.
    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        ...brokerageOperatorFilter(operatorId, month, year),
        brokerage: { isActive: true, uploadDate: { gte: monthStart, lte: monthEnd } },
      },
      select: {
        amount: true,
        brokerage: { select: { uploadDate: true } },
      },
    })
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/brokerage/daily/route.ts
git commit -m "fix(brokerage/daily): hybrid attribution"
```

---

### Task 5: Update brokerage/client-wise endpoint

**Files:**
- Modify: `src/app/api/brokerage/client-wise/route.ts`

- [ ] **Step 1: Add helper import**

```ts
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'
```

- [ ] **Step 2: Replace the baseWhere construction**

Replace lines 45-50:

```ts
    // Attribution by CURRENT client owner — brokerage history follows the client
    // through transfers. BrokerageDetail.operatorId snapshot is preserved but not used here.
    const dateFilter = { isActive: true, uploadDate: { gte: dateStart, lte: dateEnd } }
    const baseWhere = operatorId
      ? { clientId: { not: null }, client: { operatorId }, brokerage: dateFilter }
      : { clientId: { not: null }, brokerage: dateFilter }
```

…with:

```ts
    // Hybrid attribution — see src/lib/brokerage-attribution.ts. The `day` param
    // narrows further but stays within the same month, so the month/year-level
    // attribution decision applies uniformly to the whole result set.
    const dateFilter = { isActive: true, uploadDate: { gte: dateStart, lte: dateEnd } }
    const baseWhere = {
      clientId: { not: null },
      ...brokerageOperatorFilter(operatorId, month, year),
      brokerage: dateFilter,
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/brokerage/client-wise/route.ts
git commit -m "fix(brokerage/client-wise): hybrid attribution"
```

---

### Task 6: Update the brokerage dealer-panel endpoint (multi-month, requires split)

**Files:**
- Modify: `src/app/api/brokerage/route.ts`

**Why this task is bigger:** This endpoint serves the dealer panel and includes a 7-month history chart. Some of the 7 months are past, one is current. We need to issue two queries — one for past months with snapshot attribution, one for the current month with current-owner attribution — and merge the results.

- [ ] **Step 1: Add helper imports**

```ts
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'
import { isCurrentMonth } from '@/lib/utils'
```

(Note: `isCurrentMonth` is already exported from `@/lib/utils` at line 70.)

- [ ] **Step 2: Split the current-month and history queries**

Replace the entire `Promise.all` block at lines 53-89 with:

```ts
    // Hybrid attribution requires two queries:
    //   - history (covers all 7 months including current): snapshot for past, current-owner
    //     for the current month. Split into two queries and union.
    //   - current month details: same logic.
    // We fetch current-month rows once and reuse them for both the month summary and the
    // current-month bucket of the history chart, to avoid a third round-trip.
    const isCurrentRequested = isCurrentMonth(month, year)

    // Past-month range = historyStart..(monthStart - 1ms) when current month is in the window,
    // or historyStart..historyEnd if no overlap. Computed via `lt: monthStart` to keep ranges disjoint.
    const pastHistoryEnd = isCurrentRequested ? new Date(monthStart.getTime() - 1) : historyEnd

    const [
      curMonthDetails,           // current-month rows under current-owner attribution
      pastHistoryDetails,        // past-month rows under snapshot attribution (within the 7-month window)
      allClientCounts, dnaCounts,
    ] = await Promise.all([
      // Current-month details (only fetched if the requested month is the current calendar month;
      // otherwise this returns []) — used for both this-month KPIs and the current-month bar in history chart.
      isCurrentRequested
        ? prisma.brokerageDetail.findMany({
            where: {
              clientId: { not: null },
              client: { operatorId: { in: operatorIds } },
              brokerage: { isActive: true, uploadDate: { gte: monthStart, lte: monthEnd } },
            },
            select: {
              amount: true,
              clientId: true,
              client: { select: { operatorId: true } },
              brokerage: { select: { uploadDate: true } },
            },
          })
        : prisma.brokerageDetail.findMany({
            // Requested month is a closed month → snapshot attribution.
            where: {
              clientId: { not: null },
              operatorId: { in: operatorIds },
              brokerage: { isActive: true, uploadDate: { gte: monthStart, lte: monthEnd } },
            },
            select: {
              amount: true,
              clientId: true,
              operatorId: true,
              brokerage: { select: { uploadDate: true } },
            },
          }),

      // Past-month history within the 7-month window, snapshot attribution.
      pastHistoryEnd >= historyStart
        ? prisma.brokerageDetail.findMany({
            where: {
              clientId: { not: null },
              operatorId: { in: operatorIds },
              brokerage: { isActive: true, uploadDate: { gte: historyStart, lte: pastHistoryEnd } },
            },
            select: {
              amount: true,
              operatorId: true,
              brokerage: { select: { uploadDate: true } },
            },
          })
        : Promise.resolve([] as Array<{ amount: number; operatorId: string; brokerage: { uploadDate: Date } }>),

      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds } }, _count: { id: true } }),
      prisma.client.groupBy({ by: ['operatorId'], where: { operatorId: { in: operatorIds }, remark: 'DID_NOT_ANSWER' }, _count: { id: true } }),
    ])
```

- [ ] **Step 3: Update the aggregation loops to read operator from the right field**

Replace the `allDetails` flattening block at lines 95-101 with:

```ts
    // Flatten current-month details, taking operator from the right field based on which
    // attribution applies to the requested month.
    type DetailEntry = { operatorId: string; clientId: string | null; amount: number; day: number }
    const allDetails: DetailEntry[] = []
    for (const d of curMonthDetails) {
      const day = new Date(d.brokerage.uploadDate).getDate()
      const ownerId = isCurrentRequested
        ? (d as { client: { operatorId: string } }).client.operatorId
        : (d as { operatorId: string }).operatorId
      allDetails.push({ operatorId: ownerId, clientId: d.clientId, amount: d.amount, day })
    }
```

- [ ] **Step 4: Update the history aggregation to merge past (snapshot) + current (current-owner) buckets**

Replace lines 125-133 with:

```ts
    // Group 7-month history per operator + month label. Past months come from
    // pastHistoryDetails (snapshot attribution); the current month bucket comes from
    // curMonthDetails (current-owner attribution if the requested month is current,
    // otherwise the request is for a past month and curMonthDetails uses snapshot).
    const historyMap = new Map<string, Record<string, number>>()
    for (const d of pastHistoryDetails) {
      const label = new Date(d.brokerage.uploadDate).toLocaleString('default', { month: 'short', year: '2-digit' })
      const opHist = historyMap.get(d.operatorId) ?? {}
      opHist[label] = (opHist[label] ?? 0) + d.amount
      historyMap.set(d.operatorId, opHist)
    }
    for (const d of allDetails) {
      // allDetails already has the correct attributed operatorId (from Step 3).
      const label = new Date(year, month - 1, d.day).toLocaleString('default', { month: 'short', year: '2-digit' })
      const opHist = historyMap.get(d.operatorId) ?? {}
      opHist[label] = (opHist[label] ?? 0) + d.amount
      historyMap.set(d.operatorId, opHist)
    }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Browser verification of the 7-month chart**

Restart dev server if needed. Log in as admin (or as the equity dealer chosen in Task 2). Open `/brokerage`.

For the test operator (the one with transferred-in clients): the **past-month bars** should now show the snapshot-attributed totals (i.e., past brokerage credited to the operator who actually earned it at upload time). The **current-month bar** should show current-owner totals (transferred-in clients counted here).

To confirm: run Task 2's `verify-equity-dashboard-hybrid.ts` again. The "past month by-snapshot" totals printed there should match the corresponding bar in the chart.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/brokerage/route.ts
git commit -m "fix(brokerage): hybrid attribution — split current-owner (live) vs snapshot (history) queries"
```

---

### Task 7: Update admin dashboard endpoint (multi-month, requires split)

**Files:**
- Modify: `src/app/api/dashboard/admin/route.ts`

**Why:** Same pattern as Task 6 — the endpoint produces a single-month KPI block plus a 12-month chart for the selected year. Split the chart query, leave the single-month KPI query going through the helper.

- [ ] **Step 1: Add helper imports**

```ts
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'
```

(`isCurrentMonth` is already imported.)

- [ ] **Step 2: Update the single-month `monthDetails` query**

Replace lines 89-99:

```ts
    // Attribution by CURRENT client owner — transferred-in clients (including
    // pre-transfer history) count toward the new operator. BrokerageDetail.operatorId
    // snapshot is preserved but not used for these counted totals.
    const monthDetails = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        client: { operatorId: { in: operatorIds } },
        brokerage: { isActive: true, uploadDate: { gte: start, lte: end } },
      },
      select: { clientId: true, amount: true, client: { select: { operatorId: true } }, brokerage: { select: { uploadDate: true } } },
    })
```

…with:

```ts
    // Hybrid attribution for the selected single month — see src/lib/brokerage-attribution.ts.
    const monthDetails = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        ...brokerageOperatorFilter(operatorIds, month, year),
        brokerage: { isActive: true, uploadDate: { gte: start, lte: end } },
      },
      select: {
        clientId: true,
        amount: true,
        operatorId: true,
        client: { select: { operatorId: true } },
        brokerage: { select: { uploadDate: true } },
      },
    })
```

- [ ] **Step 3: Update the loop that reads `ownerId` to use the right field**

Replace lines 100-114:

```ts
    const tradedSets = new Map<string, Set<string>>()
    const allTradedIds = new Set<string>()
    for (const d of monthDetails) {
      const ownerId = d.client!.operatorId
      if (d.clientId) {
        if (!tradedSets.has(ownerId)) tradedSets.set(ownerId, new Set())
        tradedSets.get(ownerId)!.add(d.clientId)
        allTradedIds.add(d.clientId)
      }
      monthlyTotalMap.set(ownerId, (monthlyTotalMap.get(ownerId) ?? 0) + d.amount)
      const daily = dailyMap.get(ownerId) ?? {}
      const day   = new Date(d.brokerage.uploadDate).getDate()
      daily[day]  = (daily[day] ?? 0) + d.amount
      dailyMap.set(ownerId, daily)
    }
```

…with:

```ts
    // Pick operator from the right field depending on attribution mode for the selected month.
    const ownerOf = (d: typeof monthDetails[number]): string =>
      currentMonth ? d.client!.operatorId : d.operatorId

    const tradedSets = new Map<string, Set<string>>()
    const allTradedIds = new Set<string>()
    for (const d of monthDetails) {
      const ownerId = ownerOf(d)
      if (d.clientId) {
        if (!tradedSets.has(ownerId)) tradedSets.set(ownerId, new Set())
        tradedSets.get(ownerId)!.add(d.clientId)
        allTradedIds.add(d.clientId)
      }
      monthlyTotalMap.set(ownerId, (monthlyTotalMap.get(ownerId) ?? 0) + d.amount)
      const daily = dailyMap.get(ownerId) ?? {}
      const day   = new Date(d.brokerage.uploadDate).getDate()
      daily[day]  = (daily[day] ?? 0) + d.amount
      dailyMap.set(ownerId, daily)
    }
```

- [ ] **Step 4: Split the 12-month yearDetails query**

Replace lines 118-134 with:

```ts
    // For the 12-month chart: split into closed-months (snapshot) and current-month (current-owner).
    // If `year` is a past year, all 12 months are closed → single snapshot query.
    // If `year` is the current year, months before `now.getMonth()+1` are closed; the current month uses current-owner.
    const nowYear = now.getFullYear()
    const nowMonth = now.getMonth() + 1
    const isThisYear = year === nowYear

    let pastYearEnd: Date
    if (isThisYear) {
      // Closed months in this year: Jan 1 .. last day of (nowMonth - 1). If nowMonth === 1, no closed months.
      pastYearEnd = nowMonth > 1 ? new Date(year, nowMonth - 1, 0, 23, 59, 59, 999) : new Date(year, 0, 0, 23, 59, 59, 999) // before Jan 1 → empty
    } else {
      pastYearEnd = yearEnd
    }

    const [pastYearDetails, curMonthYearDetails] = await Promise.all([
      pastYearEnd >= yearStart
        ? prisma.brokerageDetail.findMany({
            where: {
              clientId: { not: null },
              operatorId: { in: operatorIds },
              brokerage: { isActive: true, uploadDate: { gte: yearStart, lte: pastYearEnd } },
            },
            select: { amount: true, operatorId: true, brokerage: { select: { uploadDate: true } } },
          })
        : Promise.resolve([] as Array<{ amount: number; operatorId: string; brokerage: { uploadDate: Date } }>),
      isThisYear
        ? prisma.brokerageDetail.findMany({
            where: {
              clientId: { not: null },
              client: { operatorId: { in: operatorIds } },
              brokerage: { isActive: true, uploadDate: { gte: new Date(year, nowMonth - 1, 1), lte: yearEnd } },
            },
            select: { amount: true, client: { select: { operatorId: true } }, brokerage: { select: { uploadDate: true } } },
          })
        : Promise.resolve([] as Array<{ amount: number; client: { operatorId: string }; brokerage: { uploadDate: Date } }>),
    ])

    const historyMap = new Map<string, Record<string, number>>()
    const labelOf = (d: Date) => d.toLocaleString('default', { month: 'short', year: '2-digit' })
    for (const d of pastYearDetails) {
      const label = labelOf(new Date(d.brokerage.uploadDate))
      const opHist = historyMap.get(d.operatorId) ?? {}
      opHist[label] = (opHist[label] ?? 0) + d.amount
      historyMap.set(d.operatorId, opHist)
    }
    for (const d of curMonthYearDetails) {
      const ownerId = d.client.operatorId
      const label = labelOf(new Date(d.brokerage.uploadDate))
      const opHist = historyMap.get(ownerId) ?? {}
      opHist[label] = (opHist[label] ?? 0) + d.amount
      historyMap.set(ownerId, opHist)
    }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Manual verification**

In the admin dashboard, the 12-month chart for the test operator should now show:
- Past months: snapshot-attributed bars (original credit, frozen)
- Current month: current-owner-attributed bar (transferred-in clients counted)

Cross-check current-month bar against the equity dashboard "Total Brokerage" KPI for the same operator (Task 2 made that hybrid-aware). They must agree.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/dashboard/admin/route.ts
git commit -m "fix(dashboard/admin): hybrid attribution — split closed-month chart query from live-month"
```

---

### Task 8: Update engagement report

**Files:**
- Modify: `src/app/api/reports/engagement/route.ts`

**Why:** Always reports the current month (line 33 hardcodes `now.getMonth() + 1`). So under hybrid it always uses current-owner attribution — which is what the existing code does already, BUT we want it to go through the helper for consistency and so a future change to the month-selection logic doesn't quietly break it.

- [ ] **Step 1: Add helper import**

```ts
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'
```

- [ ] **Step 2: Replace the brokerage query**

Replace lines 35-45:

```ts
    // Pre-fetch current month's traded clients per operator.
    // Attribution by CURRENT client owner — transferred clients count toward their new owner.
    const operatorIds = equityDealers.map((op) => op.id)
    const monthDetails = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        client: { operatorId: { in: operatorIds } },
        brokerage: { isActive: true, uploadDate: { gte: start, lte: end } },
      },
      select: { clientId: true, client: { select: { operatorId: true } } },
    })
```

…with:

```ts
    // Engagement always reports current-month traded engagement → hybrid resolves to
    // current-owner attribution. Going through the helper for consistency.
    const operatorIds = equityDealers.map((op) => op.id)
    const curMonth = now.getMonth() + 1
    const curYear = now.getFullYear()
    const monthDetails = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        ...brokerageOperatorFilter(operatorIds, curMonth, curYear),
        brokerage: { isActive: true, uploadDate: { gte: start, lte: end } },
      },
      select: { clientId: true, client: { select: { operatorId: true } } },
    })
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/reports/engagement/route.ts
git commit -m "fix(reports/engagement): route through brokerageOperatorFilter helper"
```

---

### Task 9: Update yearly brokerage matrix report (multi-month)

**Files:**
- Modify: `src/app/api/reports/brokerage/route.ts`

**Why:** Returns a per-operator × per-month matrix for a chosen year. Some months in the chosen year are past, one is current (if the year is this year). Split.

- [ ] **Step 1: Add helper imports**

```ts
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'
import { isCurrentMonth } from '@/lib/utils'
```

- [ ] **Step 2: Split the brokerage details query**

Replace lines 77-110:

```ts
    // Query brokerage details for the year
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

    // Attribution by CURRENT client owner — transferred clients' history follows
    // the client to its new owner. BrokerageDetail.operatorId snapshot is preserved
    // but not used for these counted totals.
    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        client: { operatorId: { in: equityDealers.map((e) => e.id) } },
        brokerage: { uploadDate: { gte: yearStart, lte: yearEnd } },
      },
      select: {
        amount: true,
        client: { select: { operatorId: true } },
        brokerage: { select: { uploadDate: true } },
      },
    })

    // Fill matrix
    const opIdToName = new Map(equityDealers.map((e) => [e.id, e.name]))
    const activeMonthSet = new Set(activeMonthIndices)
    for (const detail of details) {
      const opName = opIdToName.get(detail.client!.operatorId)
      if (!opName) continue
      const uploadDate = new Date(detail.brokerage.uploadDate)
      const monthIdx = uploadDate.getMonth()
      if (!activeMonthSet.has(monthIdx)) continue
      const monthLabel = months.find((m) => m.idx === monthIdx)?.label
      if (monthLabel && matrix[opName]) {
        matrix[opName][monthLabel] = (matrix[opName][monthLabel] ?? 0) + detail.amount
      }
    }
```

…with:

```ts
    // Hybrid attribution: split the year into past months (snapshot) and the current month
    // (current-owner). Issue two queries and merge into the matrix.
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)
    const operatorIds = equityDealers.map((e) => e.id)
    const opIdToName = new Map(equityDealers.map((e) => [e.id, e.name]))
    const activeMonthSet = new Set(activeMonthIndices)

    const now = new Date()
    const isThisYear = year === now.getFullYear()
    const curMonthIdx = now.getMonth() // 0-based, only meaningful if isThisYear
    const curMonthInRange = isThisYear && activeMonthSet.has(curMonthIdx)

    // Past-month window inside the requested year.
    // If this year: yearStart .. (end of previous month). If past year: full year.
    const pastEndDate = isThisYear
      ? new Date(year, curMonthIdx, 0, 23, 59, 59, 999) // last day of (curMonthIdx - 1)
      : yearEnd
    const pastInRange = pastEndDate >= yearStart

    const [pastDetails, curDetails] = await Promise.all([
      pastInRange
        ? prisma.brokerageDetail.findMany({
            where: {
              clientId: { not: null },
              operatorId: { in: operatorIds },
              brokerage: { uploadDate: { gte: yearStart, lte: pastEndDate } },
            },
            select: { amount: true, operatorId: true, brokerage: { select: { uploadDate: true } } },
          })
        : Promise.resolve([] as Array<{ amount: number; operatorId: string; brokerage: { uploadDate: Date } }>),
      curMonthInRange
        ? prisma.brokerageDetail.findMany({
            where: {
              clientId: { not: null },
              client: { operatorId: { in: operatorIds } },
              brokerage: {
                uploadDate: {
                  gte: new Date(year, curMonthIdx, 1),
                  lte: new Date(year, curMonthIdx + 1, 0, 23, 59, 59, 999),
                },
              },
            },
            select: { amount: true, client: { select: { operatorId: true } }, brokerage: { select: { uploadDate: true } } },
          })
        : Promise.resolve([] as Array<{ amount: number; client: { operatorId: string }; brokerage: { uploadDate: Date } }>),
    ])

    // Fill matrix from both buckets.
    for (const d of pastDetails) {
      const opName = opIdToName.get(d.operatorId)
      if (!opName) continue
      const monthIdx = new Date(d.brokerage.uploadDate).getMonth()
      if (!activeMonthSet.has(monthIdx)) continue
      const monthLabel = months.find((m) => m.idx === monthIdx)?.label
      if (monthLabel && matrix[opName]) {
        matrix[opName][monthLabel] = (matrix[opName][monthLabel] ?? 0) + d.amount
      }
    }
    for (const d of curDetails) {
      const opName = opIdToName.get(d.client.operatorId)
      if (!opName) continue
      const monthIdx = new Date(d.brokerage.uploadDate).getMonth()
      if (!activeMonthSet.has(monthIdx)) continue
      const monthLabel = months.find((m) => m.idx === monthIdx)?.label
      if (monthLabel && matrix[opName]) {
        matrix[opName][monthLabel] = (matrix[opName][monthLabel] ?? 0) + d.amount
      }
    }
```

Note: I deliberately did not use `brokerageOperatorFilter` here because the past/current split is on the *upload date* of each row, not on a single month/year parameter — the function abstracts the wrong dimension. The two raw queries make the split obvious.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/reports/brokerage/route.ts
git commit -m "fix(reports/brokerage): hybrid attribution across yearly matrix (snapshot past, current-owner live)"
```

---

### Task 10: Update FY comparison report (multi-year)

**Files:**
- Modify: `src/app/api/reports/brokerage-fy-comparison/route.ts`

**Why:** The FY comparison spans multiple fiscal years. ALL past fiscal years are closed → snapshot. The current fiscal year contains the current month (current-owner) and earlier months (snapshot). Same split logic as Task 9 but on a Indian-FY axis.

- [ ] **Step 1: Add helper import**

```ts
import { isCurrentMonth } from '@/lib/utils'
```

(No need for `brokerageOperatorFilter` — we do the split inline because the per-month dimension is the operative one.)

- [ ] **Step 2: Replace the details query**

Replace lines 91-106:

```ts
    // Fetch all BrokerageDetail rows for these clients within the FY window
    // (only isActive uploads)
    const details = clientIds.length === 0 ? [] : await prisma.brokerageDetail.findMany({
      where: {
        clientId: { in: clientIds },
        brokerage: {
          isActive: true,
          uploadDate: { gte: earliestStart, lt: latestEnd },
        },
      },
      select: {
        clientId: true,
        amount: true,
        brokerage: { select: { uploadDate: true } },
      },
    })
```

…with:

```ts
    // Hybrid attribution: this report is about a client's trading activity per FY.
    // For past months we want the snapshot operator to determine whether the brokerage
    // counts toward this client's *current* operator's column — but the per-CLIENT
    // breakdown in this report is keyed by client, not operator. So the operator
    // attribution doesn't actually change what's displayed for past months: the row is
    // already keyed by client.id, and we just need rows where clientId is in the
    // selected client set (the snapshot operator on the row is irrelevant to the
    // bucket the amount lands in).
    //
    // BUT — the client set itself was selected by `clientWhere.operatorId = X` (line
    // 74). That filter is "clients CURRENTLY assigned to X". Under the user's golden
    // rule, past-FY views should show whichever client was X's client AT THE TIME
    // earning brokerage — which we can detect by checking if any BrokerageDetail row
    // for that client in that FY had operatorId = X (the snapshot).
    //
    // So the correct hybrid behavior here is:
    //   - Past FYs: include a client in operator X's view only if the snapshot
    //     operatorId on that FY's brokerage rows was X. The amount shown is the sum
    //     of those snapshot-matching rows.
    //   - Current FY: same as today — clients currently assigned to X, brokerage
    //     summed regardless of snapshot.
    //
    // Implementation: fetch ALL details for the current operatorIdFilter via snapshot
    // for past FYs, then OVERLAY current-FY rows fetched by current-owner.
    const now = new Date()
    const isThisFyForCurrentMonth = (d: Date) => isCurrentMonth(d.getMonth() + 1, d.getFullYear())

    let details: Array<{
      clientId: string | null
      amount: number
      brokerage: { uploadDate: Date }
    }> = []

    if (clientIds.length > 0 || operatorIdFilter) {
      // Past-FY scope: rows in the window whose snapshot operatorId matches the filter
      // (or all rows in the window if no operator filter — admin "all" view).
      const pastWhere: import('@prisma/client').Prisma.BrokerageDetailWhereInput = {
        brokerage: { isActive: true, uploadDate: { gte: earliestStart, lt: latestEnd } },
      }
      if (operatorIdFilter) pastWhere.operatorId = operatorIdFilter
      else if (clientIds.length > 0) pastWhere.clientId = { in: clientIds }

      const pastRows = await prisma.brokerageDetail.findMany({
        where: pastWhere,
        select: { clientId: true, amount: true, brokerage: { select: { uploadDate: true } } },
      })

      // Keep only rows whose upload month is NOT the current calendar month — those go through
      // the current-owner overlay below to avoid double counting.
      details = pastRows.filter((d) => !isThisFyForCurrentMonth(new Date(d.brokerage.uploadDate)))

      // Current-month overlay using current-owner attribution: client must currently be in the set.
      if (clientIds.length > 0) {
        const curStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        const curRows = await prisma.brokerageDetail.findMany({
          where: {
            clientId: { in: clientIds },
            brokerage: { isActive: true, uploadDate: { gte: curStart, lte: curEnd } },
          },
          select: { clientId: true, amount: true, brokerage: { select: { uploadDate: true } } },
        })
        details.push(...curRows)
      }
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Manual check**

Open the FY comparison report (`/reports/brokerage` → FY comparison view, exact path depends on UI). For an operator with transferred-in clients: a client that *currently* belongs to operator X but historically belonged to operator Y should now appear in operator Y's row for past FYs and in operator X's row for the current FY. Previously (pre-fix) they'd appear in operator X's row for all FYs.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reports/brokerage-fy-comparison/route.ts
git commit -m "fix(reports/brokerage-fy-comparison): hybrid attribution — snapshot past FYs, current owner for live month"
```

---

### Task 11: Update brokerage export

**Files:**
- Modify: `src/app/api/reports/export/route.ts`

**Why:** Exports brokerage rows for a chosen month. Hybrid applies the same way as Task 4 (`/api/brokerage/daily`).

- [ ] **Step 1: Add helper import**

```ts
import { brokerageOperatorFilter } from '@/lib/brokerage-attribution'
```

- [ ] **Step 2: Replace the brokerage detailsWhere block**

Replace lines 44-48 (inside the `if (type === 'brokerage')` branch):

```ts
      // Attribution by CURRENT client owner (transferred-in clients show up here too)
      const detailsWhere: Record<string, unknown> = {
        brokerage: { uploadDate: { gte: monthStart, lte: monthEnd } },
      }
      if (operatorId) detailsWhere.client = { operatorId }
```

…with:

```ts
      // Hybrid attribution — see src/lib/brokerage-attribution.ts.
      const detailsWhere: import('@prisma/client').Prisma.BrokerageDetailWhereInput = {
        ...(operatorId ? brokerageOperatorFilter(operatorId, reportMonth, reportYear) : {}),
        brokerage: { uploadDate: { gte: monthStart, lte: monthEnd } },
      }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/reports/export/route.ts
git commit -m "fix(reports/export): hybrid attribution for brokerage export"
```

---

### Task 12: Fix the monthly-reset archive writer

**Files:**
- Modify: `src/lib/monthly-reset.ts`

**Why:** This is the cron that freezes a just-ended month into `MonthlyArchive`. Today it writes the archive using current-owner attribution (line 31-38). Once we adopt hybrid, the archive should be written using SNAPSHOT attribution — because by the time the cron runs, the month it's archiving is already closed, and hybrid says closed months use snapshot.

- [ ] **Step 1: Update the brokerage archive section**

In `src/lib/monthly-reset.ts`, replace lines 28-47:

```ts
  await Promise.all(operators.map(async (op) => {
    // Attribution by CURRENT client owner — transferred-in clients count toward
    // their new owner in the monthly archive.
    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        client: { operatorId: op.id },
        brokerage: { isActive: true, uploadDate: { gte: prevMonthStart, lte: prevMonthEnd } },
      },
      select: { clientId: true, amount: true },
    })
    const brokerageAmount = details.reduce((s, d) => s + d.amount, 0)
    const tradedClients   = new Set(details.map((d) => d.clientId!)).size
    const totalClients    = await prisma.client.count({ where: { operatorId: op.id } })
    await prisma.monthlyArchive.upsert({
      where: { month_year_entityType_entityId: { month: prevMonth, year: prevYear, entityType: 'BROKERAGE', entityId: op.id } },
      create: { month: prevMonth, year: prevYear, entityType: 'BROKERAGE', entityId: op.id, data: { operatorId: op.id, operatorName: op.name, amount: brokerageAmount, totalClients, tradedClients } },
      update: { data: { operatorId: op.id, operatorName: op.name, amount: brokerageAmount, totalClients, tradedClients } },
    })
  }))
```

…with:

```ts
  await Promise.all(operators.map(async (op) => {
    // Archive uses SNAPSHOT attribution: the just-ended month is now a closed month,
    // and per the hybrid rule (src/lib/brokerage-attribution.ts) closed-month brokerage
    // is attributed by BrokerageDetail.operatorId. This locks in the original credit
    // regardless of subsequent client transfers.
    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        operatorId: op.id,
        brokerage: { isActive: true, uploadDate: { gte: prevMonthStart, lte: prevMonthEnd } },
      },
      select: { clientId: true, amount: true },
    })
    const brokerageAmount = details.reduce((s, d) => s + d.amount, 0)
    const tradedClients   = new Set(details.map((d) => d.clientId!)).size
    const totalClients    = await prisma.client.count({ where: { operatorId: op.id } })
    await prisma.monthlyArchive.upsert({
      where: { month_year_entityType_entityId: { month: prevMonth, year: prevYear, entityType: 'BROKERAGE', entityId: op.id } },
      create: { month: prevMonth, year: prevYear, entityType: 'BROKERAGE', entityId: op.id, data: { operatorId: op.id, operatorName: op.name, amount: brokerageAmount, totalClients, tradedClients } },
      update: { data: { operatorId: op.id, operatorName: op.name, amount: brokerageAmount, totalClients, tradedClients } },
    })
  }))
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Note about existing archive rows**

Existing `MonthlyArchive.BROKERAGE` rows were written using the old (current-owner) logic. They will be wrong for any past month if clients were transferred after that month's archive. The brokerage-archive admin page (`/api/admin/brokerage-archive`) will show those stale numbers.

This is a known one-time data-quality issue, not something to fix in this plan. Two options for later (NOT in this plan):
- Re-run the archive write logic for each historical month (idempotent via upsert) using the new snapshot rule.
- Live without it and let future month-end runs accumulate correct snapshots over time.

Add a project memory entry noting the trade-off:

Add a one-line note here in the commit message so it's discoverable in `git log`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/monthly-reset.ts
git commit -m "fix(monthly-reset): archive past months using snapshot attribution

Existing MonthlyArchive.BROKERAGE rows written before this commit used current-owner
attribution and may be stale for any month where clients were subsequently transferred.
Not backfilled — out of scope for this fix."
```

---

### Task 13: End-to-end verification on real data

**Files:**
- Create: `scripts/verify-hybrid-attribution-e2e.ts`

**Why:** All endpoints are aligned. Final sanity check that the full set of queries agrees with each other for a known operator across multiple time windows.

- [ ] **Step 1: Write the e2e diagnostic**

Create `scripts/verify-hybrid-attribution-e2e.ts`:

```ts
/**
 * verify-hybrid-attribution-e2e.ts
 *
 * For the equity dealer with the most transferred-in clients, prints the brokerage totals
 * computed via the hybrid rules across all key time windows. Used to manually cross-check
 * against the UI after deployment.
 */
import { PrismaClient } from '@prisma/client'
import { brokerageOperatorFilter } from '../src/lib/brokerage-attribution'

const prisma = new PrismaClient()

async function main() {
  const candidates = await prisma.$queryRaw<{ operatorId: string; transferred: bigint }[]>`
    SELECT c.operatorId, COUNT(DISTINCT bd.clientId) as transferred
    FROM BrokerageDetail bd
    JOIN Client c ON bd.clientId = c.id
    WHERE bd.operatorId <> c.operatorId
    GROUP BY c.operatorId
    ORDER BY transferred DESC
    LIMIT 1
  `
  if (candidates.length === 0) { console.log('No transfers in DB.'); return }
  const opId = candidates[0].operatorId
  const op = await prisma.employee.findUnique({ where: { id: opId } })
  console.log(`Subject: ${op?.name} (${opId})\n`)

  const now = new Date()
  const tests: Array<{ label: string; month: number; year: number }> = [
    { label: 'Current month',       month: now.getMonth() + 1, year: now.getFullYear() },
    { label: 'Last month',          month: now.getMonth() === 0 ? 12 : now.getMonth(), year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear() },
    { label: 'Six months ago',      month: ((now.getMonth() - 6 + 12) % 12) + 1, year: now.getFullYear() - (now.getMonth() < 6 ? 1 : 0) },
  ]

  for (const t of tests) {
    const start = new Date(t.year, t.month - 1, 1)
    const end = new Date(t.year, t.month, 0, 23, 59, 59, 999)
    const details = await prisma.brokerageDetail.findMany({
      where: {
        clientId: { not: null },
        ...brokerageOperatorFilter(opId, t.month, t.year),
        brokerage: { isActive: true, uploadDate: { gte: start, lte: end } },
      },
      select: { clientId: true, amount: true },
    })
    const tradedClients = new Set(details.map(d => d.clientId)).size
    const amount = details.reduce((s, d) => s + d.amount, 0)
    console.log(`${t.label.padEnd(20)} ${t.month}/${t.year}  traded=${String(tradedClients).padStart(3)}  ₹${amount.toFixed(0)}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Run it**

Run: `npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/verify-hybrid-attribution-e2e.ts`

Expected: three rows of output. Cross-check each row against:
- Current month → equity dashboard for that operator
- Last month + six months ago → the brokerage page's 7-month chart bars for that operator

All numbers must match.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-hybrid-attribution-e2e.ts
git commit -m "chore: add e2e verification script for hybrid attribution"
```

---

### Task 14: Update the operator-facing communication

**Files:**
- Modify: `prisma/schema.prisma` (NO — schema unchanged. This is here to confirm the deliberate non-action.)

Nothing to do schema-side. This task only exists to remind the engineer:

- [ ] **Step 1: Notify dealers via the in-app notification system**

The 7-month chart and yearly matrix will visibly redistribute past-month brokerage among dealers (back to who actually earned it). Operators who were "gaining" history from transferred-in clients will see their past-month numbers drop. This is correct and is the whole point — but it should be communicated.

Send a one-time admin notification (via the existing `/api/notifications` mechanism if available, or just an out-of-band email/Slack):

> "Heads up: starting today, past-month brokerage figures are attributed to the operator who originally earned them, not the current owner. Your past-month bars on the dashboard may shift. The current month still attributes to whoever the client is assigned to now. This makes historical credit immutable to client reshuffles. Reach out to admin with questions."

- [ ] **Step 2: No commit needed** (no file change)

---

## Self-review checklist

After executing all tasks, verify:

1. **Vishaka-style consistency bug is fixed.** For every dealer in the system, the "Traded Clients" KPI on the equity dashboard equals the count of TRADED-badged rows on `/equity/clients` in the current month. Confirm via the verify scripts and via the browser for at least one dealer with transferred-in clients.

2. **Past months are frozen.** Transfer a test client (any non-production DB) between dealers, then reload the brokerage page and admin dashboard. Past-month chart bars do NOT change. Only the current-month bar shifts.

3. **Current month behaves as expected.** A mid-month transfer should move that client's current-month brokerage to the new owner immediately on all live views (equity dashboard, brokerage page current-month bar, clients list TRADED badge, engagement report).

4. **Files touched (count must be exactly this set):**
   - New: `src/lib/brokerage-attribution.ts`
   - New: `scripts/verify-snapshot-integrity.ts`
   - New: `scripts/verify-attribution-helper.ts`
   - New: `scripts/verify-equity-dashboard-hybrid.ts`
   - New: `scripts/verify-hybrid-attribution-e2e.ts`
   - Modified: `src/app/api/dashboard/equity/route.ts`
   - Modified: `src/app/api/clients/route.ts`
   - Modified: `src/app/api/brokerage/daily/route.ts`
   - Modified: `src/app/api/brokerage/client-wise/route.ts`
   - Modified: `src/app/api/brokerage/route.ts`
   - Modified: `src/app/api/dashboard/admin/route.ts`
   - Modified: `src/app/api/reports/engagement/route.ts`
   - Modified: `src/app/api/reports/brokerage/route.ts`
   - Modified: `src/app/api/reports/brokerage-fy-comparison/route.ts`
   - Modified: `src/app/api/reports/export/route.ts`
   - Modified: `src/lib/monthly-reset.ts`

5. **No schema migration required.** Confirm `prisma/schema.prisma` is untouched.

6. **No existing test breakage.** This project has no automated test suite — verification is via the verify-*.ts scripts and manual browser checks.

7. **Existing `MonthlyArchive` rows are known-stale.** Not fixed in this plan. Documented in the Task 12 commit message and acceptable as out-of-scope.

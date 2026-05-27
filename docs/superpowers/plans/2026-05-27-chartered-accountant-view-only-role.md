# Chartered Accountant (View-Only) Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `CHARTERED_ACCOUNTANT` role that sees everything an ADMIN sees but cannot create, update, or delete anything, and create one CA login.

**Architecture:** A single middleware mutation-block in `src/proxy.ts` is the authoritative write boundary (it 403s any state-changing HTTP method for the CA, except `/api/auth/*`). Read access is granted by switching admin-only read checks to a new `canViewAdmin()` helper, while write gates keep `isManager()` (CA excluded). Three pages that conflate "view" and "edit" behind one `isAdmin` flag get split.

**Tech Stack:** Next.js 16 (App Router), NextAuth v5 (beta), Prisma 6 + MySQL (`db push`, no migrations), bcryptjs, Zod, Zustand, vitest (added here for the pure-logic tests).

**Spec:** `docs/superpowers/specs/2026-05-27-chartered-accountant-view-only-role-design.md`

---

## File Structure

**New files:**
- `src/lib/roles.ts` — *modify*: add `isManager`, `canViewAdmin`, `isReadOnly`, `shouldBlockMutation` (all pure, `string`-typed so they're safe to import into edge middleware).
- `src/lib/roles.test.ts` — *create*: vitest unit tests for the helpers.
- `vitest.config.ts` — *create*: minimal config.
- `prisma/create-ca-user.ts` — *create*: idempotent script that upserts the CA employee.

**Modified — enforcement:**
- `prisma/schema.prisma` — add enum value.
- `src/proxy.ts` — mutation block + read route-guard grant.

**Modified — read grants (admin check → `canViewAdmin`):** the GET API routes, page guards, sidebar nav, and dashboard redirect listed in Tasks 6–8.

**Modified — ambiguous splits:** `clients/page.tsx`, `brokerage/page.tsx`, `calendar/page.tsx`.

**Modified — metadata:** role label/priority/icon/description/color maps, zod enums, employee-master role dropdown, role badge maps (Task 5).

---

## Conventions used throughout

- **Read grant rule:** replace `X === 'SUPER_ADMIN' || X === 'ADMIN'` with `canViewAdmin(X)`, and `X !== 'SUPER_ADMIN' && X !== 'ADMIN'` with `!canViewAdmin(X)`. Each edited file gets `import { canViewAdmin } from '@/lib/roles'` if not already importing from there.
- **Write gates are left unchanged** — the CA is not `SUPER_ADMIN`/`ADMIN`, so existing 2-role write checks already exclude it, and the middleware blocks the method regardless.
- Commit after each task.

---

## Task 1: Add vitest test runner

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add `test` script + devDependency)

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest@^2`
Expected: adds `vitest` to devDependencies, no peer-dep errors.

- [ ] **Step 2: Create minimal config**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
```

- [ ] **Step 3: Add the test script**

In `package.json` `scripts`, add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Sanity-check the runner**

Run: `npm test`
Expected: vitest runs and reports "No test files found" (exit 0 or the "no tests" notice). This confirms the runner is wired before we write tests.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for pure-logic unit tests"
```

---

## Task 2: Role helpers (TDD)

**Files:**
- Test: `src/lib/roles.test.ts`
- Modify: `src/lib/roles.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isManager, canViewAdmin, isReadOnly, shouldBlockMutation } from './roles'

describe('isManager (write capability)', () => {
  it('is true for admins', () => {
    expect(isManager('SUPER_ADMIN')).toBe(true)
    expect(isManager('ADMIN')).toBe(true)
  })
  it('is false for the CA and dealers', () => {
    expect(isManager('CHARTERED_ACCOUNTANT')).toBe(false)
    expect(isManager('EQUITY_DEALER')).toBe(false)
    expect(isManager(null)).toBe(false)
    expect(isManager(undefined)).toBe(false)
  })
})

describe('canViewAdmin (read capability)', () => {
  it('includes admins and the CA', () => {
    expect(canViewAdmin('SUPER_ADMIN')).toBe(true)
    expect(canViewAdmin('ADMIN')).toBe(true)
    expect(canViewAdmin('CHARTERED_ACCOUNTANT')).toBe(true)
  })
  it('excludes dealers and back office', () => {
    expect(canViewAdmin('EQUITY_DEALER')).toBe(false)
    expect(canViewAdmin('BACK_OFFICE')).toBe(false)
    expect(canViewAdmin(undefined)).toBe(false)
  })
})

describe('isReadOnly', () => {
  it('is true only for the CA', () => {
    expect(isReadOnly('CHARTERED_ACCOUNTANT')).toBe(true)
    expect(isReadOnly('ADMIN')).toBe(false)
  })
})

describe('shouldBlockMutation', () => {
  it('blocks state-changing methods for the CA', () => {
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'POST', '/api/clients')).toBe(true)
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'DELETE', '/api/clients/1')).toBe(true)
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'PATCH', '/api/leaves/1')).toBe(true)
  })
  it('allows safe methods for the CA', () => {
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'GET', '/api/dashboard/admin')).toBe(false)
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'HEAD', '/dashboard')).toBe(false)
  })
  it('always allows NextAuth endpoints so the CA can log out', () => {
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'POST', '/api/auth/signout')).toBe(false)
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'POST', '/api/auth/session')).toBe(false)
  })
  it('never blocks non-CA roles', () => {
    expect(shouldBlockMutation('ADMIN', 'POST', '/api/clients')).toBe(false)
    expect(shouldBlockMutation('EQUITY_DEALER', 'DELETE', '/api/clients/1')).toBe(false)
    expect(shouldBlockMutation(undefined, 'POST', '/api/clients')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `isManager`, `canViewAdmin`, `isReadOnly`, `shouldBlockMutation` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/roles.ts` (keep the existing `Role` import and `getEffectiveRole` untouched):

```ts
/** WRITE capability: only real admins can mutate. The CA is excluded. */
export function isManager(role?: string | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

/** READ capability: admins plus the read-only Chartered Accountant. */
export function canViewAdmin(role?: string | null): boolean {
  return isManager(role) || role === 'CHARTERED_ACCOUNTANT'
}

/** True for the read-only Chartered Accountant role. */
export function isReadOnly(role?: string | null): boolean {
  return role === 'CHARTERED_ACCOUNTANT'
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Authoritative write boundary for the read-only role. Returns true when a
 * request must be rejected: a read-only user using a state-changing HTTP
 * method against anything other than the NextAuth endpoints (which are needed
 * for logout).
 */
export function shouldBlockMutation(
  role: string | null | undefined,
  method: string,
  pathname: string,
): boolean {
  if (!isReadOnly(role)) return false
  if (SAFE_METHODS.has(method.toUpperCase())) return false
  if (pathname.startsWith('/api/auth')) return false
  return true
}
```

Also add `CHARTERED_ACCOUNTANT: 4` to `ROLE_PRIORITY` (lines 3-9):

```ts
const ROLE_PRIORITY: Record<string, number> = {
  SUPER_ADMIN: 5,
  ADMIN: 4,
  CHARTERED_ACCOUNTANT: 4,
  EQUITY_DEALER: 3,
  MF_DEALER: 3,
  BACK_OFFICE: 2,
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roles.ts src/lib/roles.test.ts
git commit -m "feat(roles): add view/write capability helpers + mutation guard"
```

---

## Task 3: Add the Prisma enum value

**Files:**
- Modify: `prisma/schema.prisma:10-16`

- [ ] **Step 1: Add the enum member**

Change the `Role` enum to:

```prisma
enum Role {
  SUPER_ADMIN
  ADMIN
  CHARTERED_ACCOUNTANT
  EQUITY_DEALER
  MF_DEALER
  BACK_OFFICE
}
```

- [ ] **Step 2: Push the schema and regenerate the client**

Run: `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema." and "Generated Prisma Client". (MySQL applies the enum as an `ALTER TABLE ... MODIFY`.)

> If `db push` cannot reach the database, stop and report it — the rest of the plan compiles, but the CA login (Task 10) and a real run need the DB. Do not fake the push.

- [ ] **Step 3: Verify the type exists**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no new errors referencing `CHARTERED_ACCOUNTANT`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add CHARTERED_ACCOUNTANT to Role enum"
```

---

## Task 4: Middleware mutation block + read route-guard grant

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Import the helpers**

At the top of `src/proxy.ts`, add:

```ts
import { canViewAdmin, shouldBlockMutation } from '@/lib/roles'
```

- [ ] **Step 2: Insert the mutation block before the public-route short-circuit**

The current body starts:

```ts
export default auth((req) => {
  const { nextUrl, auth: session } = req
  const isLoggedIn = !!session

  const isAuthRoute = nextUrl.pathname === '/login' || nextUrl.pathname.startsWith('/login/')
  const isApiRoute = nextUrl.pathname.startsWith('/api')
  const isPublicRoute = isAuthRoute || isApiRoute
```

Immediately after `const isPublicRoute = ...`, insert:

```ts
  // Read-only (Chartered Accountant) write boundary — runs for API *and* page
  // routes, before the API short-circuit below. Any state-changing method is
  // rejected; /api/auth/* is exempt so the CA can still log out.
  if (isLoggedIn && shouldBlockMutation(session?.user?.role, req.method, nextUrl.pathname)) {
    return NextResponse.json({ success: false, error: 'Read-only access' }, { status: 403 })
  }
```

- [ ] **Step 3: Grant the CA the admin page routes**

Change the admin route guard (currently lines ~40-43):

```ts
  if ((path.startsWith('/dashboard') || path.startsWith('/brokerage') || path.startsWith('/masters')) &&
    role !== 'SUPER_ADMIN' && role !== 'ADMIN' && secondaryRole !== 'SUPER_ADMIN' && secondaryRole !== 'ADMIN') {
    return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl))
  }
```

to:

```ts
  if ((path.startsWith('/dashboard') || path.startsWith('/brokerage') || path.startsWith('/masters')) &&
    !canViewAdmin(role) && !canViewAdmin(secondaryRole)) {
    return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl))
  }
```

- [ ] **Step 4: Send the CA to the admin dashboard by default**

In `getDashboardPath` (lines ~48-62), add a case so the CA lands on `/dashboard`:

```ts
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'CHARTERED_ACCOUNTANT':
      return '/dashboard'
```

- [ ] **Step 5: Build to confirm middleware still bundles (edge runtime)**

Run: `npm run build 2>&1 | tail -30`
Expected: build succeeds. If it fails with a Prisma/edge bundling error originating from `@/lib/roles`, add `export const runtime = 'nodejs'` to `src/proxy.ts` and rebuild (the helpers are pure, so this is only a bundling guard).

- [ ] **Step 6: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(auth): block mutations for CA + grant admin page routes"
```

---

## Task 5: Metadata — labels, login maps, zod enums, dropdown, badges

**Files:**
- Modify: `src/stores/active-role-store.ts`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/lib/validations.ts`
- Modify: `src/app/(protected)/masters/employees/page.tsx`
- Modify: `src/app/api/employees/[id]/route.ts`
- Modify: role badge maps (list in Step 6)

- [ ] **Step 1: Role label + default dashboard (`src/stores/active-role-store.ts`)**

In `ROLE_LABELS` add:

```ts
  CHARTERED_ACCOUNTANT: 'Chartered Accountant (View Only)',
```

In `getDashboardForRole()` add the CA to the admin case:

```ts
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'CHARTERED_ACCOUNTANT':
      return '/dashboard'
```

- [ ] **Step 2: Login page maps (`src/app/(auth)/login/page.tsx`)**

Add CA entries to each map:

```ts
// ROLE_ICONS — reuse the admin shield icon
  CHARTERED_ACCOUNTANT: ShieldCheck,
// ROLE_DESCRIPTIONS
  CHARTERED_ACCOUNTANT: 'Read-only access to all admin views',
// ROLE_COLORS — distinct indigo treatment
  CHARTERED_ACCOUNTANT: { bg: 'bg-indigo-50', border: 'border-indigo-200', icon: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
```

- [ ] **Step 3: Validation enum (`src/lib/validations.ts`)**

In the `role` enum (line ~43) add `'CHARTERED_ACCOUNTANT'`:

```ts
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'CHARTERED_ACCOUNTANT', 'EQUITY_DEALER', 'MF_DEALER', 'BACK_OFFICE']),
```

Leave any `secondaryRole` enum here **without** the CA (standalone-role constraint).

- [ ] **Step 4: Employee-master role dropdown (`src/app/(protected)/masters/employees/page.tsx`)**

- In `ROLE_OPTIONS` (line ~28) add `'CHARTERED_ACCOUNTANT'`:

```ts
const ROLE_OPTIONS = ['SUPER_ADMIN', 'ADMIN', 'CHARTERED_ACCOUNTANT', 'EQUITY_DEALER', 'MF_DEALER', 'BACK_OFFICE'] as const
```

- In the form `schema` (line ~35) add the CA to the **primary** `role` enum only; leave `secondaryRole`'s enum unchanged:

```ts
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'CHARTERED_ACCOUNTANT', 'EQUITY_DEALER', 'MF_DEALER', 'BACK_OFFICE']),
```

- In the **primary** role `<Select>` add a `SelectItem` (next to the existing `ADMIN` one):

```tsx
<SelectItem value="CHARTERED_ACCOUNTANT">Chartered Accountant (View Only)</SelectItem>
```

Do **not** add this `SelectItem` to the secondary-role select.

- [ ] **Step 5: Employee API zod (`src/app/api/employees/[id]/route.ts`)**

Add the CA to the primary `role` enum (line ~14) only:

```ts
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'CHARTERED_ACCOUNTANT', 'EQUITY_DEALER', 'MF_DEALER', 'BACK_OFFICE']).optional(),
```

Leave `secondaryRole` enum unchanged.

- [ ] **Step 6: Role badge/label maps**

Each of these files has a `Record<string,...>` mapping roles to a badge color or label. Add a `CHARTERED_ACCOUNTANT` entry (color `'bg-indigo-100 text-indigo-700'`, label `'Chartered Accountant'`) to the role map in each:

- `src/app/(protected)/tasks/page.tsx:33`
- `src/components/dashboard/employee-status-table.tsx:30`
- `src/app/(protected)/reports/leave/page.tsx:79`
- `src/app/(protected)/login-history/page.tsx:36`
- `src/components/tasks/task-assignment-form.tsx:40`

Example (color map):

```ts
  CHARTERED_ACCOUNTANT: 'bg-indigo-100 text-indigo-700',
```

Example (label map):

```ts
  CHARTERED_ACCOUNTANT: 'Chartered Accountant',
```

> These prevent `undefined` styling/labels when the CA appears in tables. If a given map is keyed differently than expected, match its existing entry shape for `ADMIN`.

- [ ] **Step 7: Build**

Run: `npm run build 2>&1 | tail -30`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(roles): register CHARTERED_ACCOUNTANT metadata, labels, dropdown"
```

---

## Task 6: Read grants — GET API routes

**Files (apply the read-grant rule from "Conventions"):**

For routes shaped `if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') return 403`, change the condition to `if (!canViewAdmin(userRole))`:

- `src/app/api/dashboard/admin/route.ts:15-18`
- `src/app/api/reports/leave/route.ts:13-14`
- `src/app/api/reports/no-business/route.ts:13-14`
- `src/app/api/reports/mf-business/route.ts:14-15`
- `src/app/api/reports/mf-service-business-split/route.ts:14-15`
- `src/app/api/reports/export/route.ts:17-18`
- `src/app/api/clients/closed/route.ts:13-14`
- `src/app/api/brokerage/log/route.ts:13-14`
- `src/app/api/leaves/today/route.ts:14-15`

For routes that build `const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'`, change the right-hand side to `canViewAdmin(userRole)` (keep the variable name so downstream logic is untouched):

- `src/app/api/reports/brokerage/route.ts:23`
- `src/app/api/reports/engagement/route.ts:15`
- `src/app/api/reports/brokerage-fy-comparison/route.ts:47`
- `src/app/api/brokerage/client-wise/route.ts:20`
- `src/app/api/leaves/route.ts:17` (the **GET** branch only — the POST branch is a write gate, leave it)
- `src/app/api/leaves/balance/route.ts:15`

For the `.some(...)` shaped admin-or-dealer reads, add the CA via `canViewAdmin(r)`:

- `src/app/api/dashboard/equity/route.ts:15` → `if (!userRoles.some(r => r === 'EQUITY_DEALER' || canViewAdmin(r)))`
- `src/app/api/dashboard/mf/route.ts:14` → `... r === 'MF_DEALER' || canViewAdmin(r) ...`
- `src/app/api/dashboard/mf/not-traded-2months/route.ts:13` → `... r === 'MF_DEALER' || canViewAdmin(r) ...`
- `src/app/api/dashboard/backoffice/route.ts:17` → `... r === 'BACK_OFFICE' || canViewAdmin(r) ...`

For the two admin endpoints with a hard-coded email exception, add the CA to the `allowed` expression:

- `src/app/api/admin/login-history/route.ts:15` → `const allowed = canViewAdmin(role) || session.user.email === 'pradipmahadik1982@gmail.com'`
- `src/app/api/admin/attendance/route.ts:17` → same shape.

For the global search read:

- `src/app/api/search/route.ts:77` → use `canViewAdmin(userRole)` in place of the `=== 'SUPER_ADMIN' || === 'ADMIN'` test.

**Leave unchanged (NOT reads):** `src/app/api/settings/activity-log/route.ts` (SUPER_ADMIN-only by design).

- [ ] **Step 1: Add the import to each edited file**

Each file above needs (add if absent):

```ts
import { canViewAdmin } from '@/lib/roles'
```

- [ ] **Step 2: Apply the edits above.**

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): grant CHARTERED_ACCOUNTANT read access to admin GET routes"
```

---

## Task 7: Read grants — pages, sidebar nav, dashboard redirect

**Files:**
- `src/components/layout/sidebar.tsx`
- `src/app/(protected)/reports/page.tsx:33`
- `src/app/(protected)/reports/no-business/page.tsx:44-46,116`
- `src/app/(protected)/reports/brokerage/page.tsx:52`
- `src/app/(protected)/masters/clients/page.tsx:59`
- `src/app/(protected)/masters/clients/mf/page.tsx:53`

- [ ] **Step 1: Sidebar nav (`src/components/layout/sidebar.tsx`)**

In `getNavItems(role)` add the CA to the admin case so it returns `ADMIN_NAV`:

```ts
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'CHARTERED_ACCOUNTANT':
      return ADMIN_NAV
```

- [ ] **Step 2: Reports list (`reports/page.tsx:33`)**

```ts
const reports = canViewAdmin(role) ? ADMIN_REPORTS : /* existing else branch unchanged */
```

Add `import { canViewAdmin } from '@/lib/roles'`.

- [ ] **Step 3: No-business report guard (`reports/no-business/page.tsx`)**

Replace both guards (lines ~44-46 and ~116):

```ts
if (!canViewAdmin(role)) {
  router.replace('/reports')
}
// ...
if (session && !canViewAdmin(role)) return null
```

Add the import.

- [ ] **Step 4: Brokerage report (`reports/brokerage/page.tsx:52`)**

```ts
const isAdmin = canViewAdmin(role)
```

Add the import. (This flag only controls the operator selector — a read affordance — so CA is correctly included.)

- [ ] **Step 5: Clients master guard (`masters/clients/page.tsx:59`)**

```ts
const allowed = ['ADMIN', 'SUPER_ADMIN', 'CHARTERED_ACCOUNTANT']
if (!allowed.includes(role)) { /* redirect, unchanged */ }
```

- [ ] **Step 6: MF clients master guard (`masters/clients/mf/page.tsx:53`)**

Allow the CA through the same way ADMIN secondary is allowed:

```ts
if (role === 'MF_DEALER' && secondaryRole !== 'ADMIN' && secondaryRole !== 'SUPER_ADMIN') {
  // redirect — unchanged; CA is never MF_DEALER so it is not redirected here
}
```

If this page has a positive `allowed`-style guard for the master, add `'CHARTERED_ACCOUNTANT'` to it; otherwise the existing MF_DEALER redirect does not affect the CA and no change is needed. Verify by reading the file's actual guard before editing.

- [ ] **Step 7: Typecheck + build**

Run: `npm run build 2>&1 | tail -30`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): grant CHARTERED_ACCOUNTANT nav + page read access"
```

---

## Task 8: Split the three ambiguous flags

Each page uses one `isAdmin` for both viewing and writing. Split into a read flag (CA included) and a write flag (CA excluded), then point each usage at the correct one.

**Files:**
- `src/app/(protected)/clients/page.tsx`
- `src/app/(protected)/brokerage/page.tsx`
- `src/app/(protected)/calendar/page.tsx`

- [ ] **Step 1: Clients page (`clients/page.tsx`)**

Replace the single flag (line ~38):

```ts
const canViewClients = canViewAdmin(session?.user?.role)
const canManageClients = isManager(session?.user?.role)
```

Add `import { canViewAdmin, isManager } from '@/lib/roles'`. Then update usages:

- Column-count / data visibility (e.g. `colSpan={isAdmin ? 10 : 9}` at ~line 174) → use `canViewClients`.
- Add-client button (~147), bulk-update UI (~190-193), per-row delete buttons (~202) → use `canManageClients`.

- [ ] **Step 2: Brokerage page (`brokerage/page.tsx`)**

Replace the single flag (line ~57):

```ts
const canViewArchive = canViewAdmin(session?.user?.role)
const canUploadBrokerage = isManager(session?.user?.role)
```

Add the import. Then:

- Archive tab visibility + `fetchArchive()` effect (~111, ~241) → `canViewArchive`.
- Upload button (~229) → `canUploadBrokerage`.

- [ ] **Step 3: Calendar page (`calendar/page.tsx`)**

Replace the single flag (line ~493):

```ts
const canViewAllLeaves = canViewAdmin(effectiveRole)
const canApproveLeaves = isManager(effectiveRole)
```

Add the import. Then:

- Data fetching branch (`if (!isAdmin) fetch personal / else fetch all`, ~566-579) → `canViewAllLeaves`.
- "Manage applications" approve/reject section, the mark-absence button `disabled={!isAdmin}`, and the descriptive text (~618, 667, 673, 707, 751, 935, 1030, 1153) → `canApproveLeaves`.
- The `LeaveManagementProps.isAdmin` prop (~120-130): rename to two props `canViewAll` and `canApprove`, or pass `canApproveLeaves` for management gating and `canViewAllLeaves` for fetch gating. Keep the prop interface consistent with the values you pass in.

> Read each usage in context and decide read vs write by what it controls: showing/fetching data → the `canView…` flag; a button or a write request → the `canManage…`/`canApprove…`/`canUpload…` flag.

- [ ] **Step 4: Build**

Run: `npm run build 2>&1 | tail -30`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ui): split view vs manage flags so CA sees data without write buttons"
```

---

## Task 9: Full verification of the role behaviour

- [ ] **Step 1: Lint + typecheck + unit tests + build**

Run:
```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```
Expected: all pass.

- [ ] **Step 2: Grep for missed admin read checks**

Run: `grep -rn "=== 'ADMIN'" src/app/api | grep -i "get\|forbidden" | head`
Expected: review output; any GET handler still gating on the 2-role literal that the CA should read is a miss — fix it with `canViewAdmin` and re-commit. (Write handlers correctly remain.)

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix: cover remaining CA read grants"
```

---

## Task 10: Create the CA login

**Files:**
- Create: `prisma/create-ca-user.ts`

- [ ] **Step 1: Write the script**

`prisma/create-ca-user.ts`:

```ts
import { PrismaClient, Role, Department } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const name = process.env.CA_NAME
  const email = process.env.CA_EMAIL
  const phone = process.env.CA_PHONE
  const password = process.env.CA_PASSWORD

  if (!name || !email || !phone || !password) {
    throw new Error('Set CA_NAME, CA_EMAIL, CA_PHONE and CA_PASSWORD env vars')
  }

  const hashedPassword = await bcrypt.hash(password, 12)

  const employee = await prisma.employee.upsert({
    where: { email },
    update: {
      name,
      phone,
      password: hashedPassword,
      role: Role.CHARTERED_ACCOUNTANT,
      secondaryRole: null,
      department: Department.ADMIN,
      designation: 'Chartered Accountant',
      isActive: true,
    },
    create: {
      name,
      email,
      phone,
      password: hashedPassword,
      role: Role.CHARTERED_ACCOUNTANT,
      secondaryRole: null,
      department: Department.ADMIN,
      designation: 'Chartered Accountant',
      isActive: true,
    },
  })

  console.log(`CA account ready: ${employee.email} (id ${employee.id})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Run it with the real CA details** (collected from the user — never commit them)

Run:
```bash
CA_NAME='<name>' CA_EMAIL='<email>' CA_PHONE='<phone>' CA_PASSWORD='<password>' \
  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/create-ca-user.ts
```
Expected: `CA account ready: <email> (id …)`.

- [ ] **Step 3: Verify the row**

Run: `npx prisma studio` (or a quick query) and confirm one Employee with `role = CHARTERED_ACCOUNTANT`, `secondaryRole` empty, `department = ADMIN`.

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`, log in as the CA, and confirm:
- Sidebar shows the admin items; landing page is `/dashboard`.
- Dashboard, Reports, Brokerage, Masters (Clients + Employees), Login History load with data.
- No add/edit/delete buttons appear on clients/employees/brokerage.
- A direct mutation is rejected, e.g.:
  ```bash
  curl -i -X DELETE http://localhost:3000/api/clients/some-id --cookie '<authenticated CA cookie>'
  ```
  Expected: `HTTP/… 403` with `{"success":false,"error":"Read-only access"}`.

- [ ] **Step 5: Commit the script only**

```bash
git add prisma/create-ca-user.ts
git commit -m "chore: add idempotent Chartered Accountant account creation script"
```

---

## Self-Review notes

- **Spec coverage:** middleware block (Task 4), `canViewAdmin`/`isManager`/`isReadOnly` helper (Task 2), enum (Task 3), read grants APIs (Task 6) + pages/nav (Task 7), ambiguous splits (Task 8), metadata (Task 5), standalone-role constraint (Tasks 5 secondary-enum exclusions), account script (Task 10), tests + verification (Tasks 1, 2, 9). SUPER_ADMIN-only activity-log explicitly left out (Task 6). All spec sections map to a task.
- **Type consistency:** helper names (`isManager`, `canViewAdmin`, `isReadOnly`, `shouldBlockMutation`) are used identically across Tasks 2/4/6/7/8. Enum literal `CHARTERED_ACCOUNTANT` and label `'Chartered Accountant (View Only)'` are consistent throughout.
- **Known follow-up:** if a benign non-GET background call (e.g. notification-read) surfaces during Task 10 smoke testing, whitelist that exact path next to `/api/auth` in `shouldBlockMutation`.

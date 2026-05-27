# Chartered Accountant (View-Only) Role — Design

**Date:** 2026-05-27
**Status:** Approved (design)

## Goal

Give the business's Chartered Accountant (CA) a login that can **view everything an
admin sees** but **cannot create, update, or delete anything**. The account should
behave like an admin for reading (dashboard, brokerage, reports, client/employee
masters, login history, calendar, documents) and be fully read-only for every
mutation.

## Non-goals

- No new screens or reports. The CA reuses the existing admin views.
- No SUPER_ADMIN-only surfaces (e.g. the settings activity log). "Everything an
  admin sees" means **admin-level**, not super-admin-level — a normal ADMIN cannot
  see those either.
- No dual-role support for this role (see Constraints).

## Background

The app (Next.js App Router, NextAuth, Prisma/MySQL) has 5 roles in a Prisma enum:
`SUPER_ADMIN, ADMIN, EQUITY_DEALER, MF_DEALER, BACK_OFFICE`. Access control today:

- **Middleware** (`src/proxy.ts`) gates *page* routes by role. It currently treats
  every `/api/*` path as "public" and lets each API route do its own role check.
- **API routes** are the only mutation mechanism (POST/PUT/PATCH/DELETE). There are
  **no server actions**. Each route checks `getActiveRole(session.user)` and returns
  403 when unauthorized.
- **UI** hides add/edit/delete buttons behind a per-page `isAdmin` flag.
- Roles flow into the session via NextAuth jwt/session callbacks, so a new enum value
  is available on `session.user.role` automatically.

## Key decision: enforce writes at one middleware choke point

The real security boundary is a **single check in `src/proxy.ts`**, not per-endpoint
edits.

For a logged-in user whose role is `CHARTERED_ACCOUNTANT`, the middleware rejects any
**state-changing HTTP method** (anything other than `GET`/`HEAD`/`OPTIONS`) with a 403,
**except** requests to `/api/auth/*` (required for NextAuth logout; login happens
before the session exists, so it is unaffected).

Why central instead of editing every endpoint:

- Existing write endpoints are **not** uniformly deny-by-default. Example: the
  task-create endpoint (`src/app/api/tasks/route.ts`) allows *everyone except
  `BACK_OFFICE`*. A brand-new role would therefore be silently **allowed** to create
  tasks. Several other endpoints allow dealer roles too.
- Denylisting 25 endpoints means one missed endpoint = a write hole, and any
  endpoint added later reopens the risk.
- A method-level block at the door cannot be forgotten per-endpoint and covers future
  endpoints automatically.

UI button-hiding becomes pure UX: even if a hidden button were clicked, the request
still 403s at the middleware.

The middleware matcher already covers `/api`
(`'/((?!_next/static|_next/image|favicon.ico).*)'`), so the block also catches any
future server actions (which POST to page routes).

## Read side: a helper to untangle "can view" from "can write"

Many pages use one `isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'` flag for
*both* "may view this data" and "show the edit button." We cannot simply add the CA to
that flag, or buttons reappear. Introduce explicit helpers in `src/lib/roles.ts`:

```ts
export function isManager(role: Role): boolean        // SUPER_ADMIN | ADMIN  — WRITE capability (CA excluded)
export function canViewAdmin(role: Role): boolean      // SUPER_ADMIN | ADMIN | CHARTERED_ACCOUNTANT — READ capability
export function isReadOnly(role: Role): boolean        // role === CHARTERED_ACCOUNTANT — used by middleware
```

(`isManager` may also be expressed via the existing literal comparisons; the point is
that write gates keep the 2-role set and read gates move to the 3-role set.)

### READ grants (CA included → use `canViewAdmin`)

Switch the admin-role check to `canViewAdmin` in every read surface, including:

- Navigation: `getNavItems()` in `src/components/layout/sidebar.tsx` (return `ADMIN_NAV`
  for the CA), default dashboard redirect `getDashboardForRole()` in
  `src/stores/active-role-store.ts` (→ `/dashboard`).
- Route guard in `src/proxy.ts` for `/dashboard`, `/brokerage`, `/masters`.
- GET API routes: `api/dashboard/admin`, all `api/reports/*` (brokerage, engagement,
  brokerage-fy-comparison, leave, no-business, mf-business, mf-service-business-split,
  export), `api/admin/login-history`, `api/admin/attendance`,
  `api/brokerage/client-wise`, `api/brokerage/log`, `api/clients/closed`,
  `api/leaves` (GET), `api/leaves/balance`, `api/leaves/today`, `api/search`.
- Page guards: `reports/page.tsx`, `reports/no-business/page.tsx`,
  `reports/brokerage/page.tsx`, `masters/clients/page.tsx`,
  `masters/clients/mf/page.tsx`.

The CA is **not** an EQUITY/MF/BACK_OFFICE dealer, so dealer-only dashboards remain
inaccessible — identical to a normal admin.

### WRITE gates (CA excluded → keep `isManager`/existing literals)

All POST/PUT/PATCH/DELETE handlers keep their current 2-role check; the CA falls out
naturally and is additionally blocked by the middleware. No write endpoint should be
broadened to include the CA.

### Ambiguous flags to split (3 pages)

Each currently uses a single `isAdmin` for both viewing and writing:

- `src/app/(protected)/clients/page.tsx` → `canViewClients` (READ: table columns) +
  `canManageClients` (WRITE: add/delete/bulk buttons).
- `src/app/(protected)/brokerage/page.tsx` → `canViewArchive` (READ: archive tab +
  fetch) + `canUploadBrokerage` (WRITE: upload button).
- `src/app/(protected)/calendar/page.tsx` → `canViewAllLeaves` (READ: fetch all
  employees' leaves) + `canApproveLeaves` (WRITE: mark/approve/reject UI).

## Metadata additions (~20 spots)

Add `CHARTERED_ACCOUNTANT` to:

- Prisma `Role` enum (`prisma/schema.prisma`).
- `ROLE_PRIORITY` in `src/lib/roles.ts` → `4` (same as ADMIN).
- `ROLE_LABELS` in `src/stores/active-role-store.ts` → `'Chartered Accountant (View Only)'`.
- Login page maps in `src/app/(auth)/login/page.tsx`: `ROLE_ICONS`, `ROLE_DESCRIPTIONS`,
  `ROLE_COLORS` (a distinct color, e.g. indigo).
- Zod role enums: `src/lib/validations.ts`, `src/app/(protected)/masters/employees/page.tsx`
  (`ROLE_OPTIONS` + schema), `src/app/api/employees/[id]/route.ts`.
- Employee-master **primary** role dropdown (add a `SelectItem`).
- Task/status badge color + label maps so the role renders cleanly wherever roles are
  displayed (tasks pages, `employee-status-table.tsx`, etc.).

`Department` is unchanged — the CA uses the existing `ADMIN` department value;
`designation` is free text ("Chartered Accountant").

## Constraints

- **Standalone role only.** `CHARTERED_ACCOUNTANT` is added to the **primary** role
  dropdown but **not** the secondary-role dropdown. A dealer/admin with a CA secondary
  role could side-step the primary-role middleware check, so the combination is
  disallowed by construction. The created account has `secondaryRole = null`.
- The middleware decides read-only from the primary `role` (consistent with how it
  already gates pages). Because the role is standalone, primary role is authoritative.

## Account creation

A small idempotent script `prisma/create-ca-user.ts`:

- bcrypt-hash the password with **12** salt rounds (matching the app).
- `prisma.employee.upsert` keyed on `email`, setting
  `role = CHARTERED_ACCOUNTANT`, `secondaryRole = null`, `department = ADMIN`,
  `designation = 'Chartered Accountant'`, `isActive = true`.

The CA's **name, email, phone, and initial password** are collected from the user
immediately before running the script (not hard-coded in the repo).

## Migration

- `npx prisma migrate dev --name add_chartered_accountant_role` to add the enum value
  (MySQL `ALTER TABLE ... MODIFY` handled by Prisma), then `npx prisma generate`.
- Regenerating the client makes `CHARTERED_ACCOUNTANT` a valid `Role` member, which the
  TypeScript switch/zod changes depend on.

## Testing & verification

- Unit-test the new pure helpers (`isManager`, `canViewAdmin`, `isReadOnly`) and the
  middleware read-only decision (state-changing method → blocked; GET → allowed;
  `/api/auth/*` → allowed) using the project's test runner, or a minimal harness if
  none exists.
- Manual: log in as the CA and confirm (a) reads work across dashboard, reports,
  masters, brokerage, login history; (b) a direct `POST`/`DELETE` to a mutation
  endpoint returns 403; (c) add/edit/delete buttons are absent in the UI.

## Known limitation

The method block also stops *benign* non-GET background calls if any exist (e.g.
mark-notification-read, a presence heartbeat). The CA is an observer with no tasks or
notifications, so this should be harmless. If manual testing surfaces a broken benign
call, whitelist that specific safe path in the middleware alongside `/api/auth/*`.

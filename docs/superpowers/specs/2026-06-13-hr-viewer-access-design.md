# HR Viewer Access — Login/Logoff + Leave (view-only) with Excel export

**Date:** 2026-06-13
**Target user:** `pradipmahadik1982@gmail.com` (Pradip Vinayak Mahadik, role `BACK_OFFICE`) — handles other employees' salary/HR.
**Goal:** Give him **view-only** access to the *Login/Logoff History* and *Employee Leave Report* modules, each with a **Download Excel** button. No create/edit/delete. Scoped to exactly these two modules — no other admin module exposed.

## Background (current state)

- RBAC is role-based via `Employee.role` (Prisma enum). No per-module permission model.
- The **login/logoff** module is *already* accessible to Pradip via three scattered hard-coded `email === 'pradipmahadik1982@gmail.com'` checks: `src/components/layout/sidebar.tsx` (nav injection), `src/app/api/admin/attendance/route.ts`, `src/app/api/admin/login-history/route.ts`. The page (`/login-history`) already has a client-side **CSV** export.
- The **leave** module is *not* accessible to him: `src/app/api/reports/leave/route.ts` gates on `canViewAdmin` only (he gets 403), there is no nav link for him, and no export exists.
- Middleware (`src/proxy.ts`) gates `/dashboard`, `/brokerage`, `/masters` on `canViewAdmin` but **not** `/reports`; the protected layout has no role gate — so the `/reports/leave` page route is reachable once nav + API access exist.
- `shouldBlockMutation` only blocks the read-only CA role, not `BACK_OFFICE` — so Pradip's `POST /api/reports/export` is not middleware-blocked.
- Existing Excel pattern: `POST /api/reports/export` builds an `.xlsx` with SheetJS (`xlsx` dep) and returns a buffer; client fetches the blob and triggers a download.

## Decisions

- **Scope:** Just Pradip, but centralized & extensible — one `HR_VIEWER_EMAILS` set + `isHrViewer(email)` helper in `src/lib/roles.ts`, replacing the 3 scattered email checks. Adding another HR person later = one line.
- **Leave export:** Two sheets — *Leave Summary* (on-screen table) + *Leave Details* (individual approved leave records: dates, days, reason, reviewer).
- **Login/logoff export:** Client-side `.xlsx` (page already holds all data; honors the Summary/Detailed toggle), added alongside the existing CSV button.

## Changes

1. **`src/lib/roles.ts`** — add `HR_VIEWER_EMAILS` set and `isHrViewer(email?)`. Add unit test in `src/lib/roles.test.ts`.
2. **`src/app/api/admin/attendance/route.ts`**, **`.../admin/login-history/route.ts`** — replace inline email check with `isHrViewer(session.user.email)` (behavior unchanged).
3. **`src/app/api/reports/leave/route.ts`** — gate becomes `canViewAdmin(role) || isHrViewer(email)`. Extract the per-employee aggregation into a shared helper `getLeaveReport()` (new `src/lib/leave-report.ts`) so the page and the export return identical numbers.
4. **`src/app/api/reports/export/route.ts`** — add `'leave'` type building the 2-sheet workbook via `getLeaveReport()` + an approved-applications query. Per-type auth: admins/CA may export anything; an HR viewer may export **only** `'leave'`.
5. **`src/components/layout/sidebar.tsx`** — `isPradip` → `isHrViewer(email)`; inject both `Login/Logoff History` and `Employee Leave Report` (`/reports/leave`) nav items for HR viewers.
6. **`src/app/(protected)/reports/leave/page.tsx`** — add a "Download Excel" button → `POST /api/reports/export { type:'leave', year, department, employeeId }` → blob download.
7. **`src/app/(protected)/login-history/page.tsx`** — add a "Download Excel" button next to CSV → client-side `xlsx` (lazy import) from loaded data, honoring the `detailed` toggle.

## Verification

- `npm run test` (roles helper), `npx tsc --noEmit` / `npm run build`, `npm run lint`.
- Manual: Pradip can open both pages, see data, download both Excel files; cannot export brokerage/tasks/mf; cannot mutate.

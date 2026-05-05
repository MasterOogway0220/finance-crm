# CRM Status Fixes — Design Spec

**Date:** 2026-05-05  
**Status:** Approved

---

## Overview

Four fixes to the Finance CRM related to client status tracking, cache invalidation, and MF dashboard visibility.

---

## Fix 1 — Auto-trade for All Operators

### Problem
Auto-trade (status NOT_TRADED → TRADED on brokerage upload) is restricted to 5 hardcoded operator emails in `src/lib/auto-trade-config.ts`. All other operators' clients must be manually updated.

### Solution
- Delete `src/lib/auto-trade-config.ts`
- Remove the whitelist guard in `src/app/api/brokerage/upload/route.ts`
- Every client whose code appears in a brokerage file with amount > 0 gets status → TRADED automatically, for all operators

### Constraints
- No schema changes
- Existing transaction-based update logic is unchanged — only the conditional guard is removed

---

## Fix 2 — Client List Reflects Auto-Trade Status Change

### Problem
After brokerage upload auto-trades clients, the `/clients` and `/mf/clients` pages still show NOT_TRADED until the user manually reloads. The upload API invalidates dashboard caches but not client list caches.

### Solution
In `src/app/api/brokerage/upload/route.ts`, after the auto-trade transaction, add `revalidatePath` calls for:
- `/clients`
- `/mf/clients`

No frontend changes needed — Next.js cache invalidation handles it.

### Constraints
- No schema changes
- Reuses existing `revalidatePath` pattern already present in the file

---

## Fix 3 — Client List Auto-Refreshes on Monthly Reset

### Problem
When the monthly cron reset fires, all client statuses flip to NOT_TRADED in the DB but:
1. Client list page caches are not invalidated
2. Open browser tabs do not update automatically

### Solution — Two Parts

**Server:**
- In `src/lib/monthly-reset.ts`, after reset completes, add `revalidatePath` for `/clients` and `/mf/clients`
- Add a lightweight GET endpoint `/api/reset-status` that returns the `createdAt` timestamp of the most recent `MonthlyArchive` entry (no new DB field — reuses existing table)

**Client:**
- Both `/clients/page.tsx` and `/mf/clients/page.tsx` get a `useEffect` that:
  - On mount, fetches `/api/reset-status` and stores the timestamp
  - Polls every 30 seconds
  - If the returned timestamp is newer than stored, calls `router.refresh()`
  - Cleans up the interval on unmount

### Constraints
- No schema changes — reuses `MonthlyArchive.createdAt`
- Polling interval: 30 seconds (negligible server load for a CRM)
- Effect must clean up on unmount to avoid memory leaks

---

## Fix 4 — 2-Month Consecutive NOT_TRADED Data on MF Dashboard

### Problem
There is no visibility into clients who have gone 2 consecutive months without trading. This data should be accessible to MF employees only (not equity).

### Solution — Three Parts

**New API endpoint** `GET /api/dashboard/mf/not-traded-2months`:
- Queries `MonthlyArchive` for client snapshots archived as NOT_TRADED in both:
  - The previous month (month - 1)
  - The month before that (month - 2)
- Returns: client list with `{ clientCode, firstName, lastName, phone, operatorName }`
- Access: MF_DEALER, ADMIN, SUPER_ADMIN only

**MF Dashboard UI** (`/mf/dashboard/page.tsx`):
- New counter card: **"Clients Not Traded (2 Months)"** showing the count
- Card is clickable — expands or navigates to a table listing those clients (name, code, phone, operator)

**Equity Dashboard** (`/equity/dashboard/page.tsx`):
- No changes — this data is not referenced here

### Constraints
- No schema changes — `MonthlyArchive` already stores per-client status snapshots with month/year
- Only shown on MF dashboard; equity dashboard is untouched

---

## Files Affected

| File | Change |
|------|--------|
| `src/lib/auto-trade-config.ts` | **Delete** |
| `src/app/api/brokerage/upload/route.ts` | Remove whitelist guard; add `revalidatePath` for client lists |
| `src/lib/monthly-reset.ts` | Add `revalidatePath` for client lists |
| `src/app/api/reset-status/route.ts` | **New** — returns latest `MonthlyArchive.createdAt` |
| `src/app/api/dashboard/mf/not-traded-2months/route.ts` | **New** — 2-month not-traded query |
| `src/app/(protected)/clients/page.tsx` | Add 30s polling `useEffect` |
| `src/app/(protected)/mf/clients/page.tsx` | Add 30s polling `useEffect` |
| `src/app/(protected)/mf/dashboard/page.tsx` | Add counter card + client table |

---

## Out of Scope
- Equity dashboard changes
- Schema migrations
- Real-time SSE/WebSocket updates
- Changes to the monthly reset trigger mechanism

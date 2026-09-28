# Attendance & Leave Summary Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-employee monthly summary table to the Login/Logoff report and a month-wise leaves-taken table to the Leave report.

**Architecture:** Pure calculation helpers in `src/lib` (unit-tested with vitest); pages render them. Login summary is computed client-side from data the page already fetches. Leave report gains a `monthly: number[]` field computed from the approved applications it already reads.

**Tech Stack:** Next.js (app router), Prisma, vitest.

## Global Constraints

- Working days = Mon–Fri; for the current month count only up to today; future month = 0. No holiday data.
- Weekend logins excluded from day count and all averages.
- Avg working time / avg logoff use only days that have a logout; avg login uses all weekday logged-in days.
- Times are IST (UTC+5:30).
- A leave is counted in the month of its `fromDate` (matches existing yearly total).
- Summary login table shows only when View By = Month.
- No Excel export changes. No commits unless the user asks.

---

### Task 1: `attendance-summary` helper

**Files:**
- Create: `src/lib/attendance-summary.ts`
- Test: `src/lib/attendance-summary.test.ts`

**Interfaces — Produces:**
- `countWorkingDays(year: number, month: number /*1-12*/, today: Date): number`
- `summarizeAttendance(entries: AttendanceDay[], workingDays: number): AttendanceSummaryRow[]`
- `formatMinutes(min: number | null): string` → `"09:05 AM"` / `"—"`
- `AttendanceSummaryRow = { employeeId, employeeName, workingDays, loggedInDays, avgWorkMs: number|null, avgLoginMin: number|null, avgLogoutMin: number|null }`

- [ ] Step 1: write failing tests (working days past/current/future month; weekend exclusion; IST averages; open-day exclusion; formatMinutes)
- [ ] Step 2: `npx vitest run src/lib/attendance-summary.test.ts` → FAIL (module missing)
- [ ] Step 3: implement
- [ ] Step 4: rerun → PASS

### Task 2: Login/Logoff page summary table

**Files:** Modify `src/app/(protected)/login-history/page.tsx`

- [ ] Step 1: `useMemo` → `summarizeAttendance(data, countWorkingDays(+filterYear, +filterMonth, new Date()))`
- [ ] Step 2: render "Monthly Summary" table above daily table when `filterType === 'month' && data.length > 0`
- [ ] Step 3: `npx tsc --noEmit` clean for touched files; check in browser

### Task 3: Leave month-wise

**Files:**
- Modify: `src/lib/leave-report.ts` (add `monthlyLeaveDays`, `monthly` field; aggregate → findMany)
- Test: `src/lib/leave-report.test.ts`
- Modify: `src/app/(protected)/reports/leave/page.tsx` (month-wise table)

- [ ] Step 1: failing test for `monthlyLeaveDays([{fromDate, days}]) → number[12]`
- [ ] Step 2: run → FAIL
- [ ] Step 3: implement + wire into `getLeaveReport`
- [ ] Step 4: run → PASS
- [ ] Step 5: render table: Employee | Jan…Dec | Total Taken | Total Leaves
- [ ] Step 6: full `npm test`, `npx tsc --noEmit`, browser check

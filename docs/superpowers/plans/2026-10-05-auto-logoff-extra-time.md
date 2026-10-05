# Auto Log-off at 6 PM + Extra-Time Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user is logged out at 6:00 PM IST, and their login log closes at 6:00 PM and is marked "System". Logins after 6 PM work but aren't recorded. Extra time worked after 6 PM is added only through a request that the Super Admin approves. Login history shows Self, System or Idle for each logout, and includes approved extra time.

**Architecture:** Enforcement is lazy and needs no cron.
- The JWT carries `sessionEndsAt`. The NextAuth `jwt` callback returns `null` once that time has passed, which clears the session.
- A client timer signs the user out at that instant.
- Open logs are closed with one rule, `logoutAt = min(now, sessionEndsAt(loginAt))`, applied on sign-in, sign-out, idle logout and report reads.
- Extra time is a new `ExtraTimeRequest` table, approved by SUPER_ADMIN. Approved minutes are merged into the attendance day totals.

**Tech Stack:** Next.js 16 App Router, NextAuth v5 beta.30 (JWT), Prisma 6 / MySQL, Vitest.

## Global Constraints

- Timezone: IST (UTC+5:30, no DST). Cut-off 18:00 IST, applied to all users, every day.
- A login before 18:00 IST is recorded and its session ends at 18:00 that day. A login from 18:00 to 24:00 is allowed, not recorded, and its session ends at the next IST midnight.
- Logins before 08:00 are recorded normally (user decision).
- Existing login-log rows are kept unchanged and get `logoutType = null`, shown as "—".
- Extra-time windows must lie within 18:00–24:00 IST on one date, not in the future. They are approved or rejected by an active-role SUPER_ADMIN only.
- Schema changes go to the production DB via `npm run db:push`. **Ask the user before running it.**
- No new dependencies.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/work-hours.ts` (new) | Pure IST rules: `istDateKey`, `istTime`, `isRecordedLogin`, `sessionEndsAt`, `closeLogout`, `parseExtraTime` |
| `src/lib/work-hours.test.ts` (new) | Unit tests for the above |
| `src/lib/login-log.ts` (new) | DB helpers: `closeOpenLoginLogs(employeeId, type)`, `closeExpiredLoginLogs()` |
| `src/lib/attendance-summary.ts` | Add `groupAttendance(logs, extras)`; `firstLogin` becomes nullable |
| `src/lib/attendance-summary.test.ts` | Tests for `groupAttendance` |
| `prisma/schema.prisma` | `LogoutType` enum, `EmployeeLoginLog.logoutType`, `ExtraTimeRequest` model |
| `src/lib/auth.ts`, `src/types/next-auth.d.ts` | `sessionEndsAt` / `recorded` on token+session; expiry check; signIn/signOut use helpers |
| `src/components/auth/work-hours-guard.tsx` (new) | Client 6 PM / midnight sign-out timer + "not recorded" toast |
| `src/components/auth/inactivity-guard.tsx` | Mark idle timeouts via `POST /api/login-log/idle` |
| `src/app/api/login-log/idle/route.ts` (new) | Close caller's open logs as IDLE |
| `src/app/api/admin/employee-status/route.ts` | Call `closeExpiredLoginLogs()` |
| `src/app/api/admin/attendance/route.ts` | Sweep, fetch approved extras, use `groupAttendance` |
| `src/app/api/extra-time/route.ts`, `src/app/api/extra-time/[id]/route.ts` (new) | List/create; approve/reject/cancel |
| `src/app/(protected)/extra-time/page.tsx` (new) | Request form + list + Super Admin approve/reject |
| `src/components/layout/sidebar.tsx` | "Extra Time" nav item for everyone |
| `src/app/(protected)/login-history/page.tsx` | Logout-type + extra-time columns, IST time display, IST default date, export columns |
| `src/app/api/employees/[id]/route.ts` | Clean up ExtraTimeRequest rows on employee delete |

---

### Task 1: Pure work-hours rules

**Files:** Create `src/lib/work-hours.ts` and `src/lib/work-hours.test.ts`.

**Produces:**
- `istDateKey(d: Date): string`
- `istTime(dateKey: string, hour: number, minute?: number): Date`
- `isRecordedLogin(at: Date): boolean`
- `sessionEndsAt(loginAt: Date): Date`
- `closeLogout(loginAt: Date, now: Date, type: 'SELF' | 'IDLE'): { logoutAt: Date; logoutType: 'SELF' | 'IDLE' | 'AUTO' }`
- `parseExtraTime(input: { date: string; from: string; to: string }, now: Date): { startAt: Date; endAt: Date } | { error: string }`

- [ ] Step 1: Write the tests.
  - `sessionEndsAt(10:00 IST)` is 18:00 IST the same day, i.e. `12:30Z`.
  - `sessionEndsAt(19:00 IST)` is the next IST midnight.
  - `sessionEndsAt(07:00 IST)` is 18:00 the same IST day. This covers an early-morning UTC date edge: 07:00 IST is 01:30Z, the same calendar date.
  - `sessionEndsAt(00:30 IST)` is 18:00 of that IST day. This covers a date edge where 00:30 IST is the previous UTC day.
  - `closeLogout` before the cut-off returns `now` with the given type; after the cut-off it returns the cut-off with `'AUTO'`.
  - `parseExtraTime` accepts 18:00–19:30. It rejects a start before 18:00, an end ≤ start, an end in the future and bad formats. A `to` of `'00:00'` means 24:00.
- [ ] Step 2: Run `npx vitest run src/lib/work-hours.test.ts`. It should FAIL because the module is missing.
- [ ] Step 3: Implement it. Pure Date arithmetic using `IST_OFFSET_MS = 330*60*1000`; `istTime` is `Date.UTC(y, m-1, d, hour, minute) - offset`.
- [ ] Step 4: Run it again. It should PASS.

### Task 2: `groupAttendance` with logout type and extra time

**Files:** Modify `src/lib/attendance-summary.ts` and `src/lib/attendance-summary.test.ts`.

**Produces:**
```ts
export interface AttendanceSession { id: string; loginAt: string; logoutAt: string | null; logoutType: string | null }
export interface AttendanceEntry extends AttendanceDay {
  department: string; designation: string; lastLogoutType: string | null; extraMs: number; sessions: AttendanceSession[]
}
export function groupAttendance(logs: LoginLogInput[], extras: ExtraTimeInput[]): AttendanceEntry[]
// LoginLogInput  = { id, employeeId, loginAt: Date, logoutAt: Date|null, logoutType: string|null, employee: {id,name,department,designation} }
// ExtraTimeInput = { employeeId, startAt: Date, endAt: Date, employee: {id,name,department,designation} }
```
`AttendanceDay.firstLogin` becomes `string | null`, which is the case for a day that has only extra time. `totalDurationMs` is closed-session time plus `extraMs`. `lastLogout` is null if any session is open, otherwise the latest logout. `lastLogoutType` is the type of the latest-logout session. Results are sorted date desc, then name asc, which keeps the route's existing order. `summarizeAttendance` averages login time only over days that have a `firstLogin`.

- [ ] Step 1: Write the tests:
  - two sessions on one day are summed;
  - an open session leaves `lastLogout` null and adds 0;
  - approved extra time is added to `totalDurationMs` and shown in `extraMs`;
  - a day with only extra time gets `firstLogin: null`;
  - IST date grouping: a login at 20:00Z goes on the next IST date;
  - `lastLogoutType` comes from the latest logout.
- [ ] Step 2: Run them. They should FAIL.
- [ ] Step 3: Implement `groupAttendance` by moving the loop out of `src/app/api/admin/attendance/route.ts:71-133` and adding the extras.
- [ ] Step 4: Run `npx vitest run src/lib`. Everything should PASS.

### Task 3: Schema

**Files:** Modify `prisma/schema.prisma`.

```prisma
enum LogoutType {
  SELF
  AUTO
  IDLE
}
// EmployeeLoginLog: add
  logoutType LogoutType?
// Employee: add
  extraTimeRequests  ExtraTimeRequest[] @relation("ExtraTimeApplicant")
  reviewedExtraTime  ExtraTimeRequest[] @relation("ExtraTimeReviewer")

model ExtraTimeRequest {
  id           String      @id @default(cuid())
  employeeId   String
  employee     Employee    @relation("ExtraTimeApplicant", fields: [employeeId], references: [id])
  startAt      DateTime
  endAt        DateTime
  reason       String      @db.Text
  status       LeaveStatus @default(PENDING)
  reviewedById String?
  reviewedBy   Employee?   @relation("ExtraTimeReviewer", fields: [reviewedById], references: [id])
  reviewNote   String?     @db.Text
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@index([employeeId, startAt])
  @@index([status])
  @@index([startAt])
}
```
- [ ] Step 1: Edit the schema, then run `npx prisma validate` and `npx prisma generate` (local only).
- [ ] Step 2: In the employee DELETE transaction in `src/app/api/employees/[id]/route.ts`, add `extraTimeRequest.updateMany({where:{reviewedById:id},data:{reviewedById:null}})` and `extraTimeRequest.deleteMany({where:{employeeId:id}})` before `employee.delete`.
- [ ] Step 3: **Ask the user**, then run `npm run db:push`.

### Task 4: Server-side enforcement and log closing

**Files:** Create `src/lib/login-log.ts` and `src/app/api/login-log/idle/route.ts`. Modify `src/lib/auth.ts`, `src/types/next-auth.d.ts` and `src/app/api/admin/employee-status/route.ts`.

```ts
// src/lib/login-log.ts
export async function closeOpenLoginLogs(employeeId: string, type: 'SELF' | 'IDLE', now = new Date())
  // findMany open logs for employee → updateMany({where:{id, logoutAt:null}, data: closeLogout(loginAt, now, type)})
export async function closeExpiredLoginLogs(now = new Date())
  // findMany all open logs → those with sessionEndsAt(loginAt) <= now → updateMany({where:{id, logoutAt:null}, data:{logoutAt: sessionEndsAt(loginAt), logoutType:'AUTO'}})
```
In `auth.ts`:
- On `user` in the jwt callback, set `token.sessionEndsAt = sessionEndsAt(now).toISOString()` and `token.recorded = isRecordedLogin(now)`.
- A token without `sessionEndsAt` (issued before deploy) gets `sessionEndsAt(now)`.
- If `Date.now() >= Date.parse(token.sessionEndsAt)`, return `null`.
- `session.user.sessionEndsAt` is the token value; `session.user.recorded` is `token.recorded !== false`.
- `events.signIn`: `closeOpenLoginLogs(id,'SELF')`, create a log only if `isRecordedLogin(now)`, then update `lastSeenAt`.
- `events.signOut`: `closeOpenLoginLogs(id,'SELF')`.

The idle route is `POST`: it authenticates, then calls `closeOpenLoginLogs(session.user.id,'IDLE')`. The employee-status route calls `await closeExpiredLoginLogs()`.

- [ ] Step 1: Implement, then run `npx tsc --noEmit`, which should be clean.
- [ ] Step 2: Run `npx vitest run`. All tests should pass.

### Task 5: Client guards

**Files:** Create `src/components/auth/work-hours-guard.tsx`. Modify `src/app/(protected)/layout.tsx` (mount it next to `InactivityGuard`) and `src/components/auth/inactivity-guard.tsx`.
- The guard sets a `setTimeout(Date.parse(sessionEndsAt) - Date.now())` that calls `clearActiveRole()` and then `signOut({ callbackUrl: '/login' })`.
- If `session.user.recorded === false`, it shows `toast.info('Logged in after 6:00 PM — this time is not recorded. Submit it under Extra Time for approval.', { id: 'off-hours' })`.
- In the inactivity guard, only the automatic timeout paths (the main timer and the countdown reaching 0) first call `fetch('/api/login-log/idle', { method: 'POST' })` and then `signOut`. The "Log out" button stays a Self logout.
- [ ] Step 1: Implement, then run `npx tsc --noEmit`.

### Task 6: Extra-time API

**Files:** Create `src/app/api/extra-time/route.ts` and `src/app/api/extra-time/[id]/route.ts`.
- `GET`: an active-role SUPER_ADMIN gets every request (optional `?status=`); everyone else gets only their own. Results include employee and reviewer names, ordered by `createdAt` desc, take 200.
- `POST {date, from, to, reason}`:
  - `parseExtraTime` must succeed (400 on error) and the reason must not be empty.
  - It is rejected with 409 if it overlaps the user's own PENDING or APPROVED request.
  - It creates the request for `session.user.id` and notifies active SUPER_ADMINs (type `EXTRA_TIME_REQUESTED`, link `/extra-time`).
- `PATCH {action, reviewNote}`:
  - `APPROVED` / `REJECTED` require an active-role SUPER_ADMIN and a PENDING status; they set the reviewer and note and notify the employee.
  - `CANCELLED` is allowed for the applicant while the request is PENDING.
- [ ] Step 1: Implement, then run `npx tsc --noEmit`.

### Task 7: Pages

**Files:** Create `src/app/(protected)/extra-time/page.tsx`. Modify `src/components/layout/sidebar.tsx`, `src/app/api/admin/attendance/route.ts` and `src/app/(protected)/login-history/page.tsx`.
- **Extra Time page:**
  - A form with date (max today), from (default 18:00), to and reason.
  - A table: (Employee for super admin), Date, From–To, Duration, Reason, Status, Review note, and Actions (Approve/Reject for super admin on pending rows, with an optional note via Dialog; Cancel for the applicant's own pending rows).
- **Sidebar:** append `{ label: 'Extra Time', href: '/extra-time', icon: Clock }` to every role's nav.
- **Attendance route:**
  - `await closeExpiredLoginLogs()` first.
  - Select `logoutType` on the logs.
  - Fetch `extraTimeRequest` with `status: 'APPROVED'` and `startAt` in the range (plus `employeeId`), including employee.
  - Return `groupAttendance(logs, extras)`.
- **Login-history page:**
  - `formatTime` uses `timeZone: 'Asia/Kolkata'`.
  - The default date is the IST date (`istDateKey(new Date())`).
  - The daily table gets "Logout Type" and "Extra Time" columns, and each session line in the detail view shows its type.
  - The Excel export gets "Logout Type" and "Extra Time" columns.
  - `firstLogin` can be null, so show "—".
- [ ] Step 1: Implement, then run `npx tsc --noEmit`, `npx vitest run` and `npm run lint` on the changed files.

### Task 8: Verify end to end

- [ ] Run `npm test`, `npx tsc --noEmit` and `npm run build`.
- [ ] Run the dev server. Log in, check the session has `sessionEndsAt`, and check the attendance page renders the new columns.
- [ ] Test the cut-off without waiting for 6 PM: a scratch script calls `closeLogout` / `sessionEndsAt` with a fake `now`. This is already covered by the unit tests.
- [ ] Run the quality-guardian review.

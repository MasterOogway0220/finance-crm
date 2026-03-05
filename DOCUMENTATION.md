# Finance CRM — Complete Project Documentation

> **Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS v4, shadcn/ui, Prisma 6 + MySQL, NextAuth v5 (JWT), Zustand, Sonner, Lucide icons, react-day-picker v9, date-fns v4, Recharts

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Authentication Flow](#2-authentication-flow)
3. [Role System](#3-role-system)
4. [Protected Layout & Session Services](#4-protected-layout--session-services)
5. [Zustand Stores](#5-zustand-stores)
6. [UI Pages](#6-ui-pages)
7. [API Routes](#7-api-routes)
8. [Notification Types](#8-notification-types)
9. [Key Business Logic](#9-key-business-logic)
10. [Feature Flow Diagrams](#10-feature-flow-diagrams)

---

## 1. Database Schema

**Connection:** `mysql://u150393620_kesar:***@145.79.212.111:3306/u150393620_crm`
**Schema file:** `prisma/schema.prisma`
**Migration approach:** `npx prisma db push` (shadow DB not supported on hosted MySQL)

---

### Enums

| Enum | Values |
|------|--------|
| `Role` | `SUPER_ADMIN`, `ADMIN`, `EQUITY_DEALER`, `MF_DEALER`, `BACK_OFFICE` |
| `Department` | `EQUITY`, `MUTUAL_FUND`, `BACK_OFFICE`, `ADMIN` |
| `TaskStatus` | `PENDING`, `COMPLETED`, `EXPIRED` |
| `TaskPriority` | `HIGH`, `MEDIUM`, `LOW` |
| `LeaveStatus` | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` |
| `ClientStatus` | `TRADED`, `NOT_TRADED` |
| `ClientRemark` | `SUCCESSFULLY_TRADED`, `NOT_TRADED`, `NO_FUNDS_FOR_TRADING`, `DID_NOT_ANSWER`, `SELF_TRADING` |
| `MFClientStatus` | `ACTIVE`, `INACTIVE` |
| `MFClientRemark` | `INVESTMENT_DONE`, `INTERESTED`, `NOT_INTERESTED`, `DID_NOT_ANSWER`, `FOLLOW_UP_REQUIRED` |

---

### Model: `Employee`

The core user/account model.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `name` | `String` | |
| `email` | `String` | unique |
| `phone` | `String` | |
| `password` | `String` | bcrypt hash |
| `department` | `Department` | |
| `designation` | `String` | Job title |
| `role` | `Role` | Primary role |
| `secondaryRole` | `Role?` | Optional second role for dual-role users |
| `isActive` | `Boolean` | default `true`; inactive users cannot log in |
| `lastSeenAt` | `DateTime?` | Updated by heartbeat every 5 min |
| `createdAt` / `updatedAt` | `DateTime` | |

**Relations:** assignedClients, tasksReceived, tasksAssigned, taskComments, notifications, activityLogs, brokerageUploads, createdFolders, uploadedDocuments, leaveBalances, leaveApplications, reviewedLeaves, loginLogs

**Indexes:** `department`, `role`

---

### Model: `Client`

Equity or MF client assigned to an operator.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `clientCode` | `String` | unique — used in brokerage matching |
| `firstName` | `String` | |
| `middleName` | `String?` | |
| `lastName` | `String` | |
| `phone` | `String` | |
| `department` | `Department` | `EQUITY` or `MUTUAL_FUND` |
| `operatorId` | `String` | FK → Employee |
| `status` | `ClientStatus` | Equity trading status, default `NOT_TRADED` |
| `remark` | `ClientRemark` | Equity call remark, default `DID_NOT_ANSWER` |
| `mfStatus` | `MFClientStatus` | MF status, default `INACTIVE` |
| `mfRemark` | `MFClientRemark` | MF call remark, default `DID_NOT_ANSWER` |
| `notes` | `String?` | Free-form notes |
| `followUpDate` | `DateTime?` | Reminder date |

**Indexes:** operatorId, clientCode, department, status, updatedAt, and composite indexes for common query patterns

---

### Model: `Task`

Work item assigned from one employee to another.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `title` | `String` | |
| `description` | `String` (Text) | |
| `assignedToId` | `String` | FK → Employee |
| `assignedById` | `String` | FK → Employee |
| `startDate` | `DateTime` | default `now()` |
| `deadline` | `DateTime` | |
| `status` | `TaskStatus` | default `PENDING` |
| `priority` | `TaskPriority` | default `MEDIUM` |
| `completedAt` | `DateTime?` | Set on completion |
| `completionNote` | `String?` | |

**Relations:** assignedTo, assignedBy, comments (`TaskComment[]`), completionProofs (`TaskCompletionProof[]`)

---

### Model: `TaskCompletionProof`

File attached when marking a task complete.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `taskId` | `String` | FK → Task (cascade delete) |
| `name` | `String` | Original filename |
| `mimeType` | `String` | |
| `size` | `Int` | Bytes |
| `fileData` | `Bytes` | LongBlob — stored in DB |

---

### Model: `TaskComment`

Comment thread on a task.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `taskId` | `String` | FK → Task (cascade delete) |
| `authorId` | `String` | FK → Employee |
| `content` | `String` (Text) | |
| `createdAt` | `DateTime` | |

---

### Model: `BrokerageUpload`

One upload = one trading day's brokerage ledger.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `uploadDate` | `DateTime` | **unique** — one per day |
| `uploadedById` | `String` | FK → Employee |
| `totalAmount` | `Float` | Sum of all details |
| `fileName` | `String` | Original file name |

**Relation:** details (`BrokerageDetail[]`)

---

### Model: `BrokerageDetail`

One row per client per upload.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `brokerageId` | `String` | FK → BrokerageUpload (cascade) |
| `clientCode` | `String` | Extracted from narration |
| `clientId` | `String?` | FK → Client (nullable — unmatched codes) |
| `operatorId` | `String` | FK → Employee |
| `amount` | `Float` | |

**Unique constraint:** `(brokerageId, clientCode)`

---

### Model: `LeaveBalance`

Annual leave allocation per employee.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `employeeId` | `String` | FK → Employee |
| `year` | `Int` | |
| `totalLeaves` | `Int` | Allocated days for year, default `0` |

**Unique constraint:** `(employeeId, year)`

---

### Model: `LeaveApplication`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `employeeId` | `String` | FK → Employee (applicant) |
| `reason` | `String` (Text) | |
| `fromDate` | `DateTime` | |
| `toDate` | `DateTime` | |
| `days` | `Int` | |
| `status` | `LeaveStatus` | default `PENDING` |
| `reviewedById` | `String?` | FK → Employee (admin reviewer) |
| `reviewNote` | `String?` | |

---

### Model: `DocumentFolder`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `name` | `String` | |
| `createdById` | `String` | FK → Employee |

**Relation:** documents (`Document[]`)

---

### Model: `Document`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `name` | `String` | |
| `mimeType` | `String` | |
| `size` | `Int` | Bytes |
| `fileData` | `Bytes` | LongBlob — stored in DB |
| `folderId` | `String?` | FK → DocumentFolder (nullable; loose if null) |
| `uploadedById` | `String` | FK → Employee |

---

### Model: `Notification`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `userId` | `String` | FK → Employee (recipient) |
| `type` | `String` | See [Notification Types](#8-notification-types) |
| `title` | `String` | |
| `message` | `String` (Text) | |
| `isRead` | `Boolean` | default `false` |
| `link` | `String?` | Optional deep-link URL |

---

### Model: `ActivityLog`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `userId` | `String` | FK → Employee |
| `action` | `String` | e.g. `CREATE_EMPLOYEE` |
| `module` | `String` | e.g. `EMPLOYEES`, `CLIENTS` |
| `details` | `String?` (Text) | |
| `ipAddress` | `String?` | |

---

### Model: `EmployeeLoginLog`

Tracks every login/logout session.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `employeeId` | `String` | FK → Employee |
| `loginAt` | `DateTime` | default `now()` |
| `logoutAt` | `DateTime?` | Null = still logged in |

---

### Model: `PasswordResetToken`

OTP-based password reset.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `email` | `String` | |
| `otp` | `String` | 6-digit code |
| `token` | `String?` | unique; set after OTP verified |
| `expiresAt` | `DateTime` | 30-minute expiry |

---

### Model: `MonthlyArchive`

Snapshot of data at month end.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid) | PK |
| `month` | `Int` | 1–12 |
| `year` | `Int` | |
| `entityType` | `String` | e.g. `OPERATOR_PERFORMANCE` |
| `entityId` | `String` | e.g. employee ID |
| `data` | `Json` | Snapshot payload |

**Unique constraint:** `(month, year, entityType, entityId)`

---

## 2. Authentication Flow

**File:** `src/lib/auth.ts`
**Library:** NextAuth v5 (`next-auth@5.0.0-beta.30`)
**Strategy:** JWT — session stored in `authjs.session-token` cookie, 30-day maxAge

### Login Flow

```
User submits /login form
    │
    ▼
signIn('credentials', { email, password, redirect: false })
    │
    ▼
NextAuth CredentialsProvider.authorize()
    ├── prisma.employee.findUnique({ where: { email } })
    ├── if !employee OR !employee.isActive → return null (login fails)
    ├── bcrypt.compare(password, employee.password)
    └── if invalid → return null
    │
    ▼ (success)
Returns: { id, email, name, role, secondaryRole, department, designation }
    │
    ▼
JWT callback: copies user fields into token
    │
    ▼
Session callback: copies token fields into session.user
    │
    ▼
signIn EVENT fires (async, non-critical):
    ├── prisma.employeeLoginLog.create({ employeeId: user.id })
    └── prisma.employee.update({ lastSeenAt: now() })
    │
    ▼
Client: fetch('/api/auth/session')
    ├── if session.user.secondaryRole → show RolePicker UI
    └── if single role → setRoleForNewLogin() + window.location.href to dashboard
```

### Logout Flow

```
signOut({ callbackUrl: '/login' })
    │
    ▼
NextAuth signOut EVENT fires:
    ├── reads userId from JWT token
    ├── prisma.employeeLoginLog.findFirst({ where: { employeeId, logoutAt: null } })
    └── prisma.employeeLoginLog.update({ logoutAt: now() })
    │
    ▼
Redirect to /login
```

### Browser/Tab Close Flow (new)

```
User tries to close tab/browser
    │
    ▼
beforeunload event fires → browser shows "Leave site?" dialog
    │
    ▼ (user confirms)
pagehide event fires
    │
    ▼
navigator.sendBeacon('/api/auth/signout-page')
    │
    ▼
Server: reads session → updates EmployeeLoginLog.logoutAt
```

### Password Reset Flow

```
/forgot-password → POST /api/auth/forgot-password
    → creates PasswordResetToken (OTP + 30min expiry)
    → sends OTP via email (Resend)
    → navigates to /verify-otp?email=...

/verify-otp → POST /api/auth/verify-otp
    → validates OTP
    → creates signed token in PasswordResetToken.token
    → navigates to /reset-password?token=...

/reset-password → POST /api/auth/reset-password
    → validates token + expiry
    → bcrypt.hash(newPassword)
    → prisma.employee.update({ password: hash })
    → redirect to /login
```

---

## 3. Role System

**File:** `src/lib/roles.ts`

### Role Priority (for dual-role users)

| Role | Priority |
|------|----------|
| `SUPER_ADMIN` | 5 |
| `ADMIN` | 4 |
| `EQUITY_DEALER` | 3 |
| `MF_DEALER` | 3 |
| `BACK_OFFICE` | 2 |

`getEffectiveRole(user)` — returns whichever of `role` / `secondaryRole` has the higher priority. Used throughout the app instead of reading `session.user.role` directly.

### Role Dashboards

| Role | Dashboard Path |
|------|---------------|
| `SUPER_ADMIN` | `/dashboard` |
| `ADMIN` | `/dashboard` |
| `EQUITY_DEALER` | `/equity/dashboard` |
| `MF_DEALER` | `/mf/dashboard` |
| `BACK_OFFICE` | `/backoffice/dashboard` |

### Dual-Role Feature

An employee can have both `role` and `secondaryRole`. On login, if `secondaryRole` is set, the user sees the **RolePicker** screen and chooses which role to enter with. They can switch roles at any time from the profile menu in the top bar. The chosen role is stored in `activeRole` (Zustand + sessionStorage).

---

## 4. Protected Layout & Session Services

**File:** `src/app/(protected)/layout.tsx`

All protected routes are wrapped in this layout, which provides:

- `<SessionProvider>` — makes NextAuth session available via hooks
- `<Sidebar>` — fixed on desktop (lg+), slide-in on mobile
- `<TopBar>` — hamburger menu (mobile) + notifications bell + user profile menu
- `<Toaster>` — Sonner toasts (top-right, rich colors)
- `<InactivityGuard>` — auto-logout after 30 min inactivity (warns at 25 min)
- `<HeartbeatProvider>` — POSTs to `/api/heartbeat` on mount and every 5 minutes

### InactivityGuard

- Listens to: `mousedown`, `mousemove`, `keydown`, `scroll`, `touchstart`
- If no activity for 25 min → shows "Session expiring" modal with countdown
- If no activity for 30 min → calls `signOut({ callbackUrl: '/login' })`
- "Stay logged in" button resets the timer
- **Browser close** → `beforeunload` shows native confirmation; `pagehide` sends beacon to record logout

### HeartbeatProvider

Every 5 minutes (and on page load) POSTs to `/api/heartbeat` which:
1. Updates `Employee.lastSeenAt = now()`
2. Auto-expires PENDING tasks past their deadline → status = EXPIRED
3. On the 1st of each month: runs monthly data reset
4. On Jan 1: allocates annual leave balance to all active employees

---

## 5. Zustand Stores

### `useActiveRoleStore` — `src/stores/active-role-store.ts`

Persisted to **sessionStorage** (clears on tab/browser close).

| State | Type | Description |
|-------|------|-------------|
| `activeRole` | `string` | Current active role display |
| `userId` | `string` | Logged-in employee ID |

| Method | Description |
|--------|-------------|
| `initForUser(userId, primaryRole)` | Called on session load; resets role only for new user |
| `setActiveRole(role)` | Changes active role (role switch) |
| `setRoleForNewLogin(userId, role)` | Called after login + role selection |

### `useNotificationStore` — `src/stores/notification-store.ts`

| State | Type | Description |
|-------|------|-------------|
| `notifications` | `Notification[]` | Recent notifications |
| `unreadCount` | `number` | Badge count |
| `isLoading` | `boolean` | |

| Method | Description |
|--------|-------------|
| `fetchNotifications()` | GET `/api/notifications?limit=10` |
| `markAsRead(id)` | PATCH `/api/notifications/[id]/read` |
| `markAllRead()` | PATCH `/api/notifications/mark-all-read` |

---

## 6. UI Pages

### Auth Pages (`src/app/(auth)/`)

#### `/login`
**File:** `src/app/(auth)/login/page.tsx`

- Email + password form with Zod validation
- "Forgot password?" link
- Shows password toggle eye icon
- On success: fetches `/api/auth/session`
  - **Dual-role:** Shows `RolePicker` (animated role cards with icons, descriptions, color-coding)
  - **Single role:** Immediately redirects to role dashboard
- Errors shown inline with red alert banner

#### `/forgot-password`
- Email input → `POST /api/auth/forgot-password`
- Always navigates to `/verify-otp?email=...` (does not reveal if email exists)

#### `/verify-otp`
- OTP code entry
- Validates via `POST /api/auth/verify-otp`
- On success → redirects to `/reset-password?token=...`

#### `/reset-password`
- New password + confirm form
- Submits to `POST /api/auth/reset-password`
- Auto-redirects to `/login` after 2.5 seconds

---

### Admin Dashboard (`/dashboard`)
**File:** `src/app/(protected)/dashboard/page.tsx`
**Access:** SUPER_ADMIN, ADMIN

**API calls:**
- `GET /api/dashboard/admin` — main data
- `GET /api/employees?department=EQUITY&isActive=true` — operator dropdown
- `GET /api/brokerage/client-wise?operatorId=..&month=..&year=..&day=..` — client-wise table

**Sections:**
1. **KPI Cards (6):**
   - Total Employees
   - Total Clients (Equity / MF breakdown in subtitle)
   - Monthly Brokerage (with % trend vs last month)
   - Total Clients Traded (% of equity clients)
   - Pending Tasks (all departments)
   - Overdue Tasks (requires attention)

2. **Brokerage Chart** — last 7 months trend per operator (dynamic import, SSR disabled)

3. **Task Pie Chart** — Pending / Completed / Expired breakdown

4. **Operator Performance Table** — per equity operator: total clients, traded, not-traded, DID_NOT_ANSWER count, monthly total, daily breakdown grid

5. **Client-Wise Brokerage Widget:**
   - Employee selector, Month/Year/Day selectors
   - Sort: Default / High-Low / Low-High / Zero Brokerage
   - Toggle: Hide Zero Brokerage
   - Table: client code, name, brokerage, total footer

6. **Employee Status Table** — who's online, last login, last logout

---

### Equity Dashboard (`/equity/dashboard`)
**Access:** EQUITY_DEALER

**API calls:**
- `GET /api/dashboard/equity` — personal metrics
- `GET /api/brokerage/client-wise?operatorId=me&...` — own client brokerage

**Sections:** Personal KPIs (own clients count, own brokerage, tasks), own brokerage chart, own client-wise table

---

### MF Dashboard (`/mf/dashboard`)
**Access:** MF_DEALER

Similar to equity dashboard but for mutual fund metrics.

---

### Back Office Dashboard (`/backoffice/dashboard`)
**Access:** BACK_OFFICE

**Sections:** Pending tasks count, completed today, overdue tasks, task list with quick actions

---

### Clients — Admin View (`/masters/clients`)
**Access:** ADMIN, SUPER_ADMIN

**API calls:**
- `GET /api/clients?page=..&limit=..&search=..&department=..&status=..`
- `POST /api/clients` — create client
- `POST /api/clients/import` — bulk import Excel/CSV
- `PATCH /api/clients/bulk` — bulk status update
- `GET /api/clients/export` — export to Excel

**Features:**
- Search across clientCode, name, phone
- Filter: department, status, remark
- Pagination
- Create single client form
- Bulk import wizard (Excel/CSV upload)
- Bulk select + bulk status update
- Export to Excel

---

### Clients — Equity View (`/equity/clients`)
**Access:** EQUITY_DEALER

**API calls:**
- `GET /api/clients?operatorId=<me>&department=EQUITY&page=..`
- `PATCH /api/clients/[id]` — update status/remark inline

**Features:**
- Shows only own equity clients
- Inline status and remark dropdowns per row (no page reload)
- Notes field + follow-up date picker
- Search + filters
- Export button

---

### Clients — MF View (`/mf/clients`)
**Access:** MF_DEALER

Same as equity view but for MF clients (mfStatus, mfRemark fields).

---

### Tasks — My Tasks (`/tasks`)
**Access:** All roles (each sees own tasks)

**API calls:**
- `GET /api/tasks?assignedToMe=true&status=..&priority=..&search=..&page=..`
- `PATCH /api/tasks/[id]` — mark complete / update
- `GET /api/tasks/[id]` — task detail with comments + proofs

**Features:**
- Filter: status (PENDING / COMPLETED / EXPIRED), priority
- Search by title
- Click to open **TaskDetailModal:**
  - Full description, deadline, priority badge, assigned-by info
  - Complete with note + file proof uploads
  - Comment thread
  - Overdue highlighted in red

---

### Tasks — Assign (`/tasks/assign`)
**Access:** ADMIN, EQUITY_DEALER, MF_DEALER (not BACK_OFFICE)

**API calls:**
- `GET /api/employees?role=BACK_OFFICE&isActive=true` — back office list
- `POST /api/tasks` — create + assign task

**Form fields:** Title, Description, Assign To (dropdown), Deadline (date picker), Priority

---

### Back Office Tasks (`/backoffice/tasks`)
**Access:** BACK_OFFICE

**API calls:**
- `GET /api/tasks?assignedToMe=true`
- `PATCH /api/tasks/[id]` — complete task
- `POST /api/tasks/[id]/proof` — upload proof file

**Features:** Task list with status, deadline countdown, completion workflow with mandatory note + optional file proof

---

### Brokerage — Admin View (`/brokerage`)
**Access:** ADMIN, SUPER_ADMIN

**API calls:**
- `GET /api/brokerage?month=..&year=..`
- `DELETE /api/brokerage/[id]` — delete upload

**Features:** Monthly totals, operator breakdown, list of uploads with dates, delete upload

---

### Brokerage — Upload (`/brokerage/upload`)
**Access:** ADMIN, SUPER_ADMIN

**API calls:**
- `POST /api/brokerage/upload` — multipart (file + date)

**Features:**
- Date picker (single date)
- XLSX file drop/select
- Upload progress
- Validates: no duplicate date, valid NSE ledger format
- On success: shows summary (total amount, records, operators)

---

### Brokerage — Equity View (`/equity/brokerage`)
**Access:** EQUITY_DEALER

**API calls:**
- `GET /api/brokerage?month=..&year=..` (filtered to own data)
- `GET /api/brokerage/client-wise?operatorId=<me>&...`

**Features:** Own monthly total, daily breakdown calendar, client-wise table

---

### Calendar & Leave (`/calendar`)
**Access:** All roles

**API calls:**
- `GET /api/calendar/holidays` — NSE + bank holidays
- `GET /api/leaves?year=..` (employee) / `GET /api/leaves` (admin: all)
- `POST /api/leaves` — apply
- `PATCH /api/leaves/[id]` — approve/reject/cancel
- `GET /api/leaves/balance?year=..` — balance summary
- `GET /api/leaves/today` (admin) — who's on leave today

**Features:**
- **Month view calendar** with colour-coded leaves and holidays
- **Leave Application form:** date range picker, reason textarea, auto-calculates business days
- **Leave Balance card:** Allocated / Used / Pending / Remaining
- **Admin view:** table of all pending applications with approve/reject/cancel + review note
- **NSE holidays** fetched with 24h server-side cache (no hit for every user)
- Holiday types: `market` (NSE closed) and `bank` (bank holiday)

---

### Documents (`/documents`)
**Access:** All roles

**API calls:**
- `GET /api/documents` — folder list + loose files
- `GET /api/documents/folders/[id]` — folder contents
- `POST /api/documents/folders` — create folder
- `PATCH /api/documents/folders/[id]` — rename
- `DELETE /api/documents/folders/[id]` — delete (cascades files)
- `POST /api/documents/upload` — upload file (multipart, max 20MB)
- `GET /api/documents/files/[id]/download` — download
- `PATCH /api/documents/files/[id]` — rename
- `DELETE /api/documents/files/[id]` — delete

**Layout:**
- Left sidebar: folder tree with create-folder button
- Right panel: file grid/list for selected folder (or loose files)
- Breadcrumb navigation
- Drag-and-drop or click-to-upload
- File type icons based on mimeType

---

### Notifications (`/notifications`)
**Access:** All roles

**API calls:**
- `GET /api/notifications?limit=50`
- `PATCH /api/notifications/[id]/read`
- `PATCH /api/notifications/mark-all-read`

**Features:** Grouped by date, unread highlighted, click to navigate to linked resource

---

### Settings (`/settings`)
**Access:** All roles (own profile)

**API calls:**
- `GET /api/employees/[id]` — own profile
- `PATCH /api/employees/[id]` — update password

**Features:** Display name, email, department, role, designation. Change password form (requires current password verification).

---

### Settings — Activity Log (`/settings/activity-log`)
**Access:** ADMIN, SUPER_ADMIN

**API calls:**
- `GET /api/settings/activity-log?page=..&limit=..&module=..`

**Features:** Paginated list of all admin actions with timestamp, module, and details. Filter by module.

---

### Employee Management (`/masters/employees`)
**Access:** ADMIN, SUPER_ADMIN

**API calls:**
- `GET /api/employees`
- `POST /api/employees` — create
- `PATCH /api/employees/[id]` — edit / deactivate

**Features:** Employee table, create form, edit modal, toggle isActive

---

### Reports (`/reports/*`)
**Access:** ADMIN, SUPER_ADMIN (some views for equity/mf)

| Sub-route | Description |
|-----------|-------------|
| `/reports` | Overview hub |
| `/reports/brokerage` | Brokerage analysis with date ranges |
| `/reports/tasks` | Task completion rates |
| `/reports/leave` | Leave usage per employee per year |
| `/reports/engagement` | Engagement metrics |

---

## 7. API Routes

### Authentication

#### `POST /api/auth/forgot-password`
- **Body:** `{ email: string }`
- **Action:** Creates `PasswordResetToken` (OTP + 30min expiry), sends email via Resend
- **Response:** `{ success: true }` (always, to avoid email enumeration)

#### `POST /api/auth/verify-otp`
- **Body:** `{ email: string, otp: string }`
- **Action:** Validates OTP, creates `token` field in PasswordResetToken
- **Response:** `{ success: true, token: string }`

#### `POST /api/auth/reset-password`
- **Body:** `{ token: string, password: string }`
- **Action:** Validates token + expiry, hashes and updates password
- **Response:** `{ success: true }`

#### `POST /api/auth/signout-page`
- **Auth:** Session cookie (beacon call from browser close)
- **Action:** Records `logoutAt` in EmployeeLoginLog
- **Response:** `{ ok: true }`

---

### Heartbeat

#### `POST /api/heartbeat`
- **Auth:** Required (session)
- **Actions:**
  1. `Employee.lastSeenAt = now()`
  2. Finds PENDING tasks with `deadline < now()` → updates to EXPIRED + notifies assignees
  3. Monthly reset (runs once on 1st of month using MonthlyArchive as idempotency guard)
  4. Yearly leave reset (runs once on Jan 1)
- **Response:** `{ success: true }`

---

### Employees

#### `GET /api/employees`
- **Query:** `department`, `role`, `search` (name/email/phone), `isActive`
- **Response:** `{ success, data: Employee[] }` (select fields only, no password)

#### `POST /api/employees`
- **Auth:** ADMIN / SUPER_ADMIN
- **Body:** `{ name, email, phone, department, designation, role, secondaryRole?, password, isActive }`
- **Action:** Hashes password, creates employee, logs activity
- **Response:** `{ success, data: Employee }` (201)

#### `GET /api/employees/[id]`
- **Response:** Single employee object

#### `PATCH /api/employees/[id]`
- **Body (password change):** `{ currentPassword, password }`
- **Body (admin edit):** `{ name?, phone?, designation?, isActive?, secondaryRole? }`
- **Action:** If `password` field: verifies `currentPassword` first; logs activity

---

### Clients

#### `GET /api/clients`
- **Query:** `page`, `limit`, `operatorId`, `status`, `remark`, `mfStatus`, `mfRemark`, `department`, `search`
- **Auth restriction:** EQUITY_DEALER → forced `operatorId = self`
- **Response:** `{ success, data: { clients: Client[], pagination: { page, limit, total, totalPages } } }`

#### `POST /api/clients`
- **Auth:** ADMIN / SUPER_ADMIN
- **Body:** `{ clientCode, firstName, middleName?, lastName, phone, department, operatorId, status?, remark?, mfStatus?, mfRemark?, notes?, followUpDate? }`
- **Response:** `{ success, data: Client }` (201)

#### `GET /api/clients/[id]`
- **Response:** Client with operator details

#### `PATCH /api/clients/[id]`
- **Body:** any subset of `{ status, remark, mfStatus, mfRemark, notes, followUpDate }`

#### `PATCH /api/clients/bulk`
- **Body:** `{ clientIds: string[], ...fields to update }`
- **Action:** Updates all listed clients with same field values

#### `POST /api/clients/import`
- **Auth:** ADMIN / SUPER_ADMIN
- **Body:** Multipart — Excel/CSV file
- **Action:** Parses rows, upserts clients by clientCode

#### `GET /api/clients/export`
- **Response:** Excel file download (XLSX)

---

### Tasks

#### `GET /api/tasks`
- **Query:** `assignedToId`, `assignedById`, `status`, `priority`, `department`, `dateFrom`, `dateTo`, `assignedByMe`, `assignedToMe`, `page`, `limit`, `search`
- **Auth restriction:** BACK_OFFICE → forced `assignedToId = self`
- **Action:** Before returning, runs auto-expire on overdue PENDING tasks
- **Response:** `{ success, data: { tasks: Task[], pagination } }`

#### `POST /api/tasks`
- **Body:** `{ title, description, assignedToId, deadline, priority }`
- **Action:** Creates task, sends `TASK_ASSIGNED` notification + logs activity
- **Response:** `{ success, data: Task }` (201)

#### `GET /api/tasks/[id]`
- **Response:** Task with full relations (comments, proofs, assignedTo, assignedBy)

#### `PATCH /api/tasks/[id]`
- **Body:** any subset of `{ title, description, deadline, priority, status, completionNote }`
- **Actions:** On `status = COMPLETED`: sets `completedAt`, sends `TASK_COMPLETED` notification; on edit: sends `TASK_EDITED` notification

#### `DELETE /api/tasks/[id]`
- **Auth:** Assigner only (or admin)
- **Action:** Cascade deletes comments + proofs

#### `GET /api/tasks/[id]/proof/[proofId]/download`
- **Response:** File blob with correct Content-Type and Content-Disposition headers

---

### Leaves

#### `GET /api/leaves`
- **Query:** `status`, `employeeId`, `year`
- **Auth restriction:** Non-admin → only own leaves
- **Response:** `{ success, data: LeaveApplication[] }` with employee + reviewer

#### `POST /api/leaves`
- **Body:** `{ employeeId?, reason, fromDate, toDate, days }`
- **Validations:** Date range valid, no overlapping approved/pending leaves, sufficient balance
- **Action:** Creates application, notifies all ADMIN/SUPER_ADMIN employees
- **Response:** `{ success, data: LeaveApplication }` (201)

#### `PATCH /api/leaves/[id]`
- **Auth:** ADMIN / SUPER_ADMIN
- **Body:** `{ status: 'APPROVED'|'REJECTED'|'CANCELLED', reviewNote? }`
- **Action:** Updates status, notifies employee

#### `GET /api/leaves/balance`
- **Query:** `employeeId`, `year`
- **Response:** `{ success, data: { total, used, pending, remaining } }`

#### `GET /api/leaves/today`
- **Auth:** ADMIN / SUPER_ADMIN
- **Response:** List of employees on approved leave today

#### `POST /api/leaves/mark`
- **Auth:** ADMIN / SUPER_ADMIN
- **Body:** `{ employeeId, date, reason }`
- **Action:** Marks direct absence (creates approved leave for 1 day without application flow)

---

### Brokerage

#### `GET /api/brokerage`
- **Query:** `month`, `year`
- **Auth restriction:** EQUITY_DEALER → own data only
- **Action:** Fetches 7 months of data in a single query (avoids N+1)
- **Response:** `{ success, data: { uploads, operatorPerformance, brokerageChartData, brokerageMonths } }`

#### `GET /api/brokerage/daily`
- **Query:** `month`, `year`
- **Response:** Daily totals for the month

#### `GET /api/brokerage/client-wise`
- **Query:** `operatorId`, `month`, `year`, `day?`
- **Response:** `{ success, data: { clients: [{ clientCode, clientName, totalBrokerage }] } }`

#### `POST /api/brokerage/upload`
- **Auth:** ADMIN / SUPER_ADMIN
- **Body:** Multipart — `file` (XLSX), `date` (ISO date string)
- **Parser logic:**
  1. Auto-detect header row (scans first 20 rows for column keywords)
  2. Extract `clientCode` from narration: last space-separated token (uppercase)
  3. Look up `Client` by clientCode → get `operatorId`
  4. Group amounts by client + operator
- **Constraints:** Unique `uploadDate` — duplicate date returns 409
- **Action:** Creates `BrokerageUpload` + `BrokerageDetail` rows; notifies equity dealers
- **Response:** `{ success, data: { id, totalAmount, recordCount } }`

#### `DELETE /api/brokerage/[id]`
- **Auth:** ADMIN / SUPER_ADMIN
- **Action:** Deletes upload; cascade removes all BrokerageDetail rows

---

### Calendar

#### `GET /api/calendar/holidays`
- **Response:** `{ holidays: [{ date: string, name: string, type: 'market'|'bank' }] }`
- **Cache:** 24-hour server-side cache

---

### Documents

#### `GET /api/documents`
- **Response:** `{ folders: [{ id, name, documentCount }], looseFiles: Document[] }`

#### `POST /api/documents/folders`
- **Body:** `{ name: string }`
- **Response:** Created folder (201)

#### `GET /api/documents/folders/[id]`
- **Response:** Folder with full `documents` array (no fileData in list)

#### `PATCH /api/documents/folders/[id]`
- **Body:** `{ name: string }`

#### `DELETE /api/documents/folders/[id]`
- **Action:** Cascade deletes all documents in folder

#### `POST /api/documents/upload`
- **Body:** Multipart — `file`, `folderId?`
- **Limit:** 20MB
- **Action:** Stores file as Bytes (LongBlob) in DB

#### `GET /api/documents/files/[id]/download`
- **Response:** File stream with `Content-Disposition: attachment`

#### `PATCH /api/documents/files/[id]`
- **Body:** `{ name: string }`

#### `DELETE /api/documents/files/[id]`

---

### Notifications

#### `GET /api/notifications`
- **Query:** `limit` (default 10), `unreadOnly`
- **Response:** `{ success, data: { notifications, unreadCount } }`

#### `PATCH /api/notifications/[id]/read`
- **Action:** Sets `isRead = true` for notification (must belong to current user)

#### `PATCH /api/notifications/mark-all-read`
- **Action:** `updateMany` where `userId = self AND isRead = false`

---

### Admin

#### `GET /api/admin/employee-status`
- **Auth:** ADMIN / SUPER_ADMIN
- **Response:** All employees with: name, role, lastSeenAt, isOnline (within last 6 min), last login, last logout

#### `GET /api/admin/login-history`
- **Query:** `page`, `limit`
- **Auth:** ADMIN / SUPER_ADMIN
- **Response:** Paginated `EmployeeLoginLog` entries with employee details

---

### Dashboard

#### `GET /api/dashboard/admin`
- **Auth:** ADMIN / SUPER_ADMIN
- **Response:** `{ totalEmployees, totalClients, equityClients, mfClients, monthlyBrokerage, lastMonthBrokerage, tradedClients, totalEquityClients, pendingTasks, overdueTasks, taskStats, operatorPerformance[], brokerageChartData[], brokerageMonths[] }`

#### `GET /api/dashboard/equity`
- **Auth:** EQUITY_DEALER
- **Response:** Personal metrics — own client counts, own brokerage

#### `GET /api/dashboard/mf`
- **Auth:** MF_DEALER
- **Response:** MF-specific personal metrics

#### `GET /api/dashboard/backoffice`
- **Auth:** BACK_OFFICE
- **Response:** Task stats for current user

---

### Reports

#### `GET /api/reports/brokerage`
- **Query:** `month`, `year`, `operatorId?`

#### `GET /api/reports/tasks`
- **Query:** `status`, `assignedToId?`, `dateFrom`, `dateTo`

#### `GET /api/reports/leave`
- **Query:** `year`, `employeeId?`

#### `GET /api/reports/engagement`

#### `POST /api/reports/export`
- **Body:** `{ type: 'brokerage'|'tasks'|'leave', ...filters }`
- **Response:** Excel file download

---

### Settings

#### `GET /api/settings/activity-log`
- **Auth:** ADMIN / SUPER_ADMIN
- **Query:** `page`, `limit`, `module?`
- **Response:** Paginated ActivityLog entries

---

## 8. Notification Types

| Type | When Created | Recipients |
|------|-------------|------------|
| `TASK_ASSIGNED` | New task created | Assignee |
| `TASK_COMPLETED` | Task marked complete | Assigner |
| `TASK_EDITED` | Task details updated | Assignee (and assigner if different) |
| `TASK_EXPIRED` | Heartbeat detects overdue PENDING task | Assignee |
| `BROKERAGE_UPLOAD` | New brokerage XLSX uploaded | All EQUITY_DEALER employees |
| `LEAVE_APPLIED` | Employee applies for leave | All ADMIN / SUPER_ADMIN employees |
| `LEAVE_APPROVED` | Admin approves leave | Applicant employee |
| `LEAVE_REJECTED` | Admin rejects leave | Applicant employee |

---

## 9. Key Business Logic

### Task Lifecycle

```
Create → PENDING
    │
    ├── deadline passes → EXPIRED (auto by heartbeat or GET /api/tasks)
    │
    └── employee marks complete → COMPLETED (completedAt set)

EXPIRED tasks CANNOT be completed
```

### Leave Workflow

```
Employee applies
    │
    ├── Validate: fromDate < toDate
    ├── Validate: no overlapping PENDING or APPROVED leaves in range
    ├── Validate: remaining balance >= days
    └── Create with status=PENDING → notify admins
    │
Admin reviews
    ├── APPROVE → notify employee
    ├── REJECT → notify employee
    └── CANCEL → notify employee

Annual allocation (Jan 1 via heartbeat):
    → Creates LeaveBalance(year, totalLeaves=30) for every active employee
    → Skips if record already exists (idempotent)

Balance calculation:
    used    = sum(days) WHERE status=APPROVED
    pending = sum(days) WHERE status=PENDING
    remaining = total - used - pending
```

### Brokerage Import

```
Admin uploads XLSX file for a specific date
    │
    ├── Check: uploadDate must be unique (409 if duplicate)
    ├── Auto-detect header row (scans first 20 rows for known column names)
    ├── For each data row:
    │   ├── Extract client code from narration (last space-separated token, uppercase)
    │   ├── Look up Client by clientCode
    │   ├── Get operatorId from Client.operatorId
    │   └── Accumulate amount per (clientCode, operatorId)
    ├── Create BrokerageUpload record
    └── Create BrokerageDetail records (bulk)

On success → notify all EQUITY_DEALER employees
```

### Heartbeat Multi-Action

```
Every 5 minutes (per active browser session):
    │
    ├── UPDATE Employee SET lastSeenAt = NOW()
    │
    ├── Auto-expire tasks:
    │   SELECT * FROM Task WHERE status=PENDING AND deadline < NOW()
    │   → UPDATE status=EXPIRED, notify assignees
    │
    ├── Monthly reset (idempotent, runs once per month):
    │   Check MonthlyArchive for (month-1, year, MONTHLY_RESET)
    │   → If not exists: archive equity client statuses, reset to NOT_TRADED
    │
    └── Yearly leave reset (idempotent, runs once per Jan 1):
        Check MonthlyArchive for (1, year, YEARLY_LEAVE_RESET)
        → If not exists: create LeaveBalance for all active employees
```

### Dual-Role Login

```
Login success
    │
    ├── session.user.secondaryRole is set?
    │   YES → show RolePicker with both role cards
    │         → user picks a role
    │         → setRoleForNewLogin(userId, pickedRole)
    │         → redirect to getDashboardForRole(pickedRole)
    │
    └── NO → setRoleForNewLogin(userId, primaryRole)
             → redirect to getDashboardForRole(primaryRole)

Role switch (from TopBar profile menu):
    → setActiveRole(newRole) in Zustand
    → window.location.href = getDashboardForRole(newRole)
```

---

## 10. Feature Flow Diagrams

### Complete Login → Dashboard Flow

```
Browser: GET https://crm.kesarsecurities.in/
    ↓
Protected Layout checks session
    ↓ (no session)
Redirect → /login
    ↓
User enters email + password
    ↓
signIn('credentials', {..., redirect: false})
    ↓
POST /api/auth/[...nextauth] (NextAuth handler)
    ↓
authorize() → prisma.employee.findUnique + bcrypt.compare
    ↓ (success)
JWT token created with { id, role, secondaryRole, department, designation }
    ↓
signIn EVENT → create EmployeeLoginLog + update lastSeenAt
    ↓
Client: fetch /api/auth/session
    ↓
    ├── secondaryRole? → RolePicker → user selects role
    └── no secondaryRole → use primary role
    ↓
setRoleForNewLogin(userId, role) → saved to sessionStorage
    ↓
window.location.href = /dashboard | /equity/dashboard | /mf/dashboard | /backoffice/dashboard
    ↓
Protected layout renders: Sidebar + TopBar + HeartbeatProvider + InactivityGuard
    ↓
Dashboard page loads → fetch /api/dashboard/[role]
```

### Complete Brokerage Upload Flow

```
Admin opens /brokerage/upload
    ↓
Selects date + uploads XLSX file
    ↓
POST /api/brokerage/upload (multipart)
    ↓
Server:
    1. Parse XLSX using xlsx library
    2. Auto-detect header row (first 20 rows, look for known column names)
    3. For each row:
       - Extract clientCode from narration (last token, uppercase)
       - SELECT Client WHERE clientCode = extracted
       - Get operatorId
    4. Check unique constraint on uploadDate
    5. prisma.brokerageUpload.create({ uploadDate, uploadedById, totalAmount, fileName })
    6. prisma.brokerageDetail.createMany([...details])
    7. createNotificationForMany(allEquityDealers, 'BROKERAGE_UPLOAD', ...)
    ↓
Response: { success, data: { totalAmount, recordCount } }
    ↓
UI: shows success toast + upload summary
    ↓
Next time equity dealer loads /equity/brokerage:
    GET /api/brokerage?month=X&year=Y
    → Returns their brokerage data including new upload
```

### Task Assignment → Completion Flow

```
Admin/Equity/MF opens /tasks/assign
    ↓
Fills form: title, description, assignedTo (back office employee), deadline, priority
    ↓
POST /api/tasks → creates Task (status=PENDING)
    ↓
createNotification(assignedToId, 'TASK_ASSIGNED', ...)
logActivity(assignedById, 'CREATE_TASK', 'TASKS', ...)
    ↓
Back Office employee sees notification bell update (unreadCount++)
    ↓
Back Office opens /backoffice/tasks
    GET /api/tasks?assignedToMe=true
    ↓
Opens TaskDetailModal → reads description, sees deadline
    ↓
Clicks "Mark Complete" → enters completion note + optionally uploads proof file
    ↓
PATCH /api/tasks/[id] { status: 'COMPLETED', completionNote: '...' }
    + POST /api/tasks/[id]/proof (if file attached)
    ↓
Server: sets completedAt = now()
    createNotification(assignedById, 'TASK_COMPLETED', ...)
    ↓
Assigner sees notification, can view completed task with note + download proof
```

### Leave Application → Approval Flow

```
Employee opens /calendar
    ↓
Sees current leave balance (GET /api/leaves/balance)
Sees NSE holidays marked (GET /api/calendar/holidays, 24h cache)
    ↓
Clicks "Apply for Leave" → picks date range → enters reason
    ↓
POST /api/leaves
    Validates: no overlap, sufficient balance
    Creates LeaveApplication (status=PENDING)
    Notifies all ADMIN/SUPER_ADMIN employees
    ↓
Admin opens /calendar → sees pending applications table
    ↓
Admin clicks Approve/Reject → enters optional review note
    ↓
PATCH /api/leaves/[id] { status: 'APPROVED', reviewNote: '...' }
    Updates LeaveApplication.status
    createNotification(employeeId, 'LEAVE_APPROVED', ...)
    ↓
Employee's calendar now shows approved leave (coloured block on calendar)
Balance automatically updated (APPROVED days counted as used)
```

---

*Generated: 2026-03-05 | Finance CRM v0.1.0*

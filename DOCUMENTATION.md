# Finance CRM — Complete Project Documentation

> **Generated:** 2026-02-26 · **Last updated:** 2026-02-26
> **Stack:** Next.js 16.1.6 · React 19 · TypeScript · MySQL · Prisma · NextAuth v5 · Tailwind CSS v4
> **Repository branch:** master

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Environment Variables](#3-environment-variables)
4. [Database Schema](#4-database-schema)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [User Roles & Permissions](#6-user-roles--permissions)
7. [Feature Modules](#7-feature-modules)
   - 7.1 [Employee Management](#71-employee-management)
   - 7.2 [Client Management](#72-client-management)
   - 7.3 [Brokerage System](#73-brokerage-system)
   - 7.4 [Task Management](#74-task-management)
   - 7.5 [Reports](#75-reports)
   - 7.6 [Dashboards](#76-dashboards)
   - 7.7 [Notifications](#77-notifications)
   - 7.8 [Global Search](#78-global-search)
   - 7.9 [Settings & Activity Log](#79-settings--activity-log)
   - 7.10 [Cron Jobs](#710-cron-jobs)
   - 7.11 [Dual-Role / Role Switcher](#711-dual-role--role-switcher)
8. [API Reference](#8-api-reference)
9. [Frontend Structure](#9-frontend-structure)
10. [Navigation & Sidebar](#10-navigation--sidebar)
11. [Shared Components](#11-shared-components)
12. [Known Issues & Bugs](#12-known-issues--bugs)
13. [Incomplete / Pending Features](#13-incomplete--pending-features)
14. [File Structure Map](#14-file-structure-map)

---

## 1. Project Overview

Finance CRM is a multi-role internal CRM system for a financial brokerage firm. It manages:

- **Equity & Mutual Fund clients** assigned to operators/dealers
- **Brokerage uploads** — daily Excel/CSV files matched to clients and operators
- **Task management** with assignment, deadlines, comments, and auto-expiry
- **Reports** — annual brokerage matrices, task completion rates, exports
- **Monthly archival** — statuses and brokerage summaries archived and reset at month end
- **Role-based access** — 5 roles with isolated data views per role

---

## 2. Tech Stack & Dependencies

### Core Framework
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.1.6 | App framework (App Router) |
| `react` | 19.2.3 | UI library |
| `typescript` | ^5 | Type safety |

### Database & Auth
| Package | Version | Purpose |
|---------|---------|---------|
| `@prisma/client` | 6.19.2 | ORM client |
| `prisma` | 6.19.2 | ORM CLI |
| `next-auth` | 5.0.0-beta.30 | Authentication |
| `@auth/prisma-adapter` | ^2.11.1 | Prisma adapter for NextAuth |
| `bcryptjs` | ^3.0.3 | Password hashing (salt=12) |

### UI & Styling
| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | ^4 | Utility CSS |
| `radix-ui` | ^1.4.3 | Headless UI primitives |
| `lucide-react` | ^0.575.0 | Icon library |
| `shadcn` | ^3.8.5 | Component collection |
| `sonner` | ^2.0.7 | Toast notifications |
| `cmdk` | ^1.1.1 | Command palette |

### Forms & Validation
| Package | Version | Purpose |
|---------|---------|---------|
| `react-hook-form` | ^7.71.2 | Form state management |
| `@hookform/resolvers` | ^5.2.2 | Zod integration |
| `zod` | ^4.3.6 | Schema validation |

### Data & Charts
| Package | Version | Purpose |
|---------|---------|---------|
| `recharts` | ^3.7.0 | Charts (bar, pie) |
| `@tanstack/react-table` | ^8.21.3 | Table component |
| `papaparse` | ^5.5.3 | CSV parsing/generation |
| `xlsx` | ^0.18.5 | Excel file parsing/generation |
| `date-fns` | ^4.1.0 | Date utilities |
| `react-day-picker` | ^9.13.2 | Date picker |

### State & Utilities
| Package | Version | Purpose |
|---------|---------|---------|
| `zustand` | ^5.0.11 | Client state management |
| `clsx` | ^2.1.1 | Conditional classnames |
| `tailwind-merge` | ^3.5.0 | Tailwind conflict resolution |

### Scripts
```bash
npm run dev          # Start Next.js dev server (Turbopack)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:push      # Sync Prisma schema to database
npm run db:seed      # Seed database (ts-node)
npm run db:studio    # Open Prisma Studio
```

---

## 3. Environment Variables

**File:** `.env.example`

```env
# MySQL connection string
DATABASE_URL="mysql://username:password@localhost:3306/finance_crm?connection_limit=10"
# Hostinger example:
# DATABASE_URL="mysql://u123456789_user:password@srv123.hostinger.com:3306/u123456789_finance_crm?connection_limit=10"

# NextAuth JWT signing secret — generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-secret-here"

# Application URL (localhost for dev, domain for prod)
NEXTAUTH_URL="http://localhost:3000"

# Cron job authentication header
CRON_SECRET="your-cron-secret"
```

---

## 4. Database Schema

**Database:** MySQL
**ORM:** Prisma 6.19.2
**Schema file:** `prisma/schema.prisma`

---

### Enums

```prisma
enum Role {
  SUPER_ADMIN
  ADMIN
  EQUITY_DEALER
  MF_DEALER
  BACK_OFFICE
}

enum Department {
  EQUITY
  MUTUAL_FUND
  BACK_OFFICE
  ADMIN
}

enum TaskStatus {
  PENDING
  COMPLETED
  EXPIRED
}

enum TaskPriority {
  HIGH
  MEDIUM
  LOW
}

enum ClientStatus {
  TRADED
  NOT_TRADED
}

enum ClientRemark {
  SUCCESSFULLY_TRADED
  NOT_TRADED
  NO_FUNDS_FOR_TRADING
  DID_NOT_ANSWER
  SELF_TRADING
}

enum MFClientStatus {
  ACTIVE
  INACTIVE
}

enum MFClientRemark {
  INVESTMENT_DONE
  INTERESTED
  NOT_INTERESTED
  DID_NOT_ANSWER
  FOLLOW_UP_REQUIRED
}
```

---

### Models

#### Employee
```prisma
model Employee {
  id             String     @id @default(cuid())
  name           String
  email          String     @unique
  phone          String
  password       String                        // bcrypt hashed
  department     Department
  designation    String
  role           Role
  secondaryRole  Role?                         // Optional dual-role; null for single-role employees
  isActive       Boolean    @default(true)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  assignedClients   Client[]          @relation("OperatorClients")
  tasksReceived     Task[]            @relation("TaskAssignee")
  tasksAssigned     Task[]            @relation("TaskAssigner")
  taskComments      TaskComment[]
  notifications     Notification[]
  activityLogs      ActivityLog[]
  brokerageUploads  BrokerageUpload[]

  @@index([department])
  @@index([role])
}
```

#### Client
```prisma
model Client {
  id            String          @id @default(cuid())
  clientCode    String          @unique
  firstName     String
  middleName    String?
  lastName      String
  phone         String
  department    Department                         // EQUITY or MUTUAL_FUND
  operatorId    String
  status        ClientStatus    @default(NOT_TRADED)
  remark        ClientRemark    @default(DID_NOT_ANSWER)
  mfStatus      MFClientStatus  @default(INACTIVE)
  mfRemark      MFClientRemark  @default(DID_NOT_ANSWER)
  notes         String?         @db.Text
  followUpDate  DateTime?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  operator          Employee        @relation("OperatorClients", fields: [operatorId], references: [id])
  brokerageDetails  BrokerageDetail[]

  @@index([operatorId])
  @@index([clientCode])
  @@index([department])
  @@index([status])
}
```

#### Task
```prisma
model Task {
  id            String        @id @default(cuid())
  title         String
  description   String        @db.Text
  assignedToId  String
  assignedById  String
  startDate     DateTime      @default(now())
  deadline      DateTime
  status        TaskStatus    @default(PENDING)
  priority      TaskPriority  @default(MEDIUM)
  completedAt   DateTime?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  assignedTo  Employee      @relation("TaskAssignee", fields: [assignedToId], references: [id])
  assignedBy  Employee      @relation("TaskAssigner", fields: [assignedById], references: [id])
  comments    TaskComment[]

  @@index([assignedToId])
  @@index([assignedById])
  @@index([status])
  @@index([deadline])
}
```

#### TaskComment
```prisma
model TaskComment {
  id        String   @id @default(cuid())
  taskId    String
  authorId  String
  content   String   @db.Text
  createdAt DateTime @default(now())

  task    Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author  Employee @relation(fields: [authorId], references: [id])

  @@index([taskId])
}
```

#### BrokerageUpload
```prisma
model BrokerageUpload {
  id            String   @id @default(cuid())
  uploadDate    DateTime
  uploadedById  String
  totalAmount   Float    @default(0)
  fileName      String
  createdAt     DateTime @default(now())

  uploadedBy  Employee          @relation(fields: [uploadedById], references: [id])
  details     BrokerageDetail[]

  @@unique([uploadDate])    // One upload per calendar date
  @@index([uploadDate])
}
```

#### BrokerageDetail
```prisma
model BrokerageDetail {
  id          String  @id @default(cuid())
  brokerageId String
  clientCode  String
  clientId    String?
  operatorId  String
  amount      Float
  createdAt   DateTime @default(now())

  brokerage  BrokerageUpload @relation(fields: [brokerageId], references: [id], onDelete: Cascade)
  client     Client?         @relation(fields: [clientId], references: [id])

  @@unique([brokerageId, clientCode])
  @@index([operatorId])
  @@index([brokerageId])
}
```

#### MonthlyArchive
```prisma
model MonthlyArchive {
  id          String   @id @default(cuid())
  month       Int
  year        Int
  entityType  String   // CLIENT_STATUS | BROKERAGE | TASK_SUMMARY
  entityId    String   @default("")
  data        Json
  createdAt   DateTime @default(now())

  @@unique([month, year, entityType, entityId])
  @@index([month, year])
}
```

#### Notification
```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String   // TASK_ASSIGNED | TASK_COMPLETED | TASK_EXPIRED | BROKERAGE_UPLOAD | MONTHLY_RESET
  title     String
  message   String   @db.Text
  isRead    Boolean  @default(false)
  link      String?
  createdAt DateTime @default(now())

  user  Employee @relation(fields: [userId], references: [id])

  @@index([userId, isRead])
  @@index([createdAt])
}
```

#### ActivityLog
```prisma
model ActivityLog {
  id        String   @id @default(cuid())
  userId    String
  action    String   // CREATE | UPDATE | DELETE | EXPORT | IMPORT | UPLOAD | MONTHLY_RESET | TASK_EXPIRY
  module    String   // CLIENTS | TASKS | BROKERAGE | EMPLOYEES | AUTH | SYSTEM
  details   String?  @db.Text
  ipAddress String?
  createdAt DateTime @default(now())

  user  Employee @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([module])
  @@index([createdAt])
}
```

---

## 5. Authentication & Authorization

**Library:** NextAuth v5 (beta.30)
**Strategy:** JWT (30-day expiry)
**Provider:** Credentials (email + password)
**Files:** `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`

### Login Flow
1. User submits email + password on `/login`
2. Zod validates the form
3. `signIn('credentials', {...})` called with `redirect: false`
4. NextAuth `authorize()` callback:
   - Finds employee by email
   - `bcryptjs.compare()` validates password
   - Checks `isActive === true`
   - Returns `{ id, email, name, role, department, designation }`
5. JWT token created and stored in httpOnly cookie
6. Session fetched → `session.user.role` read
7. Redirected to role-specific dashboard:
   - SUPER_ADMIN / ADMIN → `/dashboard`
   - EQUITY_DEALER → `/equity/dashboard`
   - MF_DEALER → `/mf/dashboard`
   - BACK_OFFICE → `/backoffice/dashboard`

### Session Structure
```typescript
session.user = {
  id: string
  name: string
  email: string
  role: Role                   // Primary role
  secondaryRole: Role | null   // Optional dual role (null for most employees)
  department: Department
  designation: string
}
```

### API Route Protection Pattern
```typescript
const session = await auth()
if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user.role))
  return Response.json({ error: 'Forbidden' }, { status: 403 })
```

---

## 6. User Roles & Permissions

| Role | Dashboard | Clients | Brokerage | Tasks | Reports | Masters | Bulk Status | Activity Log |
|------|-----------|---------|-----------|-------|---------|---------|-------------|--------------|
| SUPER_ADMIN | Admin | All + CRUD | Upload + View | All + Assign | Brokerage + Tasks | Employees + Clients | ✅ | ✅ |
| ADMIN | Admin | All + CRUD | Upload + View | All + Assign | Brokerage + Tasks | Employees + Clients | ✅ | ❌ |
| EQUITY_DEALER | Equity | Own clients only | My brokerage | — | My brokerage | — | ❌ | ❌ |
| MF_DEALER | MF | Own clients only | — | — | My clients | — | ❌ | ❌ |
| BACK_OFFICE | Backoffice | — | — | Assigned tasks | My tasks | — | ❌ | ❌ |

### Data Isolation Rules
- **EQUITY_DEALER**: API routes filter by `operatorId = session.user.id` — cannot see other operators' clients or brokerage
- **MF_DEALER**: Same isolation pattern for MF clients
- **BACK_OFFICE**: Can only see tasks `assignedToId = session.user.id`
- **ADMIN/SUPER_ADMIN**: Full access, can filter by specific operators

---

## 7. Feature Modules

### 7.1 Employee Management

**Pages:** `/masters/employees`
**API:** `src/app/api/employees/route.ts`, `src/app/api/employees/[id]/route.ts`

#### Fields
| Field | Type | Constraints |
|-------|------|-------------|
| name | String | Required |
| email | String | Required, unique, valid email |
| phone | String | Required, exactly 10 digits |
| department | Department | Required |
| designation | String | Required |
| role | Role | Required — Primary role |
| secondaryRole | Role? | Optional — for dual-role employees; shown as "None" if unset |
| password | String | Min 8 chars (hashed with bcrypt salt=12) |
| isActive | Boolean | Default: true |

#### CRUD Operations
- **GET** `/api/employees` — list with filters: department, role, search (name/email/phone), isActive
- **POST** `/api/employees` — create (ADMIN+ only); returns 409 if email duplicate
- **GET** `/api/employees/[id]` — single employee
- **PATCH** `/api/employees/[id]` — update (ADMIN+ only); password optional
- **DELETE** `/api/employees/[id]` — delete (ADMIN+ only)

#### Deletion Constraints
Cannot delete if employee has any of:
- Assigned clients
- Tasks received
- Tasks assigned
- Brokerage uploads
→ Returns 400 suggesting deactivation instead. Cannot delete own account.

---

### 7.2 Client Management

**Pages:** `/masters/clients`, `/equity/clients`, `/mf/clients`
**API:** `src/app/api/clients/`

#### Fields
| Field | Type | Notes |
|-------|------|-------|
| clientCode | String | Unique, formats: `18K099`, `91383117`, `18KS008` |
| firstName / middleName / lastName | String | middleName optional |
| phone | String | 10 digits |
| department | Department | EQUITY or MUTUAL_FUND |
| operatorId | String | FK to Employee |
| status | ClientStatus | Equity: TRADED / NOT_TRADED |
| remark | ClientRemark | Equity remark enum |
| mfStatus | MFClientStatus | MF: ACTIVE / INACTIVE |
| mfRemark | MFClientRemark | MF remark enum |
| notes | Text | Optional |
| followUpDate | DateTime | Optional |

#### CRUD Operations
- **GET** `/api/clients` — paginated list; query: page, limit, operatorId, status, remark, mfStatus, mfRemark, department, search
- **POST** `/api/clients` — create single client
- **GET** `/api/clients/[id]` — single client (EQUITY_DEALER limited to own)
- **PATCH** `/api/clients/[id]` — update; auto-sets remark to SUCCESSFULLY_TRADED when status → TRADED
- **DELETE** `/api/clients/[id]` — delete (ADMIN+ only); blocked if has brokerage history

#### Bulk Operations
- **POST** `/api/clients/import` — CSV import with two-step preview/confirm flow (ADMIN+ only)
  - Flexible column names (clientCode, client_code, ClientCode)
  - Row-level validation with error messages
  - Deduplicates against existing DB codes
  - Returns `{ validRows, invalidRows }` on preview; batch creates on confirm
- **PATCH** `/api/clients/bulk` — bulk status/remark update (multiple clientIds); ADMIN+ only in UI (equity dealer pages do not expose this)
- **GET** `/api/clients/export` — export as CSV (filters: operatorId, department)

#### Monthly Reset Behavior
On month end (via cron): all client statuses reset to NOT_TRADED / INACTIVE, remarks to DID_NOT_ANSWER, notes and followUpDate cleared.

---

### 7.3 Brokerage System

**Pages:** `/brokerage`, `/brokerage/upload`, `/equity/brokerage`
**API:** `src/app/api/brokerage/`

#### Upload Flow
1. Admin selects date (default: yesterday) and uploads a file
2. File parsed with SheetJS — flexible column detection:
   - Client code: `client code`, `clientcode`, `client_code`, `code`, `client id`, `clientid`
   - Amount: `amount`, `brokerage`, `brokerage amount`, `net amount`, `netamount`
3. Amounts aggregated by client code (duplicates summed)
4. Client codes matched to `Client` table → operator IDs resolved
5. Unmapped codes tracked as warnings
6. Existing upload for same date deleted (replaced)
7. `BrokerageUpload` + `BrokerageDetail` records created in a transaction
8. Notifications sent to all active EQUITY_DEALER employees
9. Activity logged

**Accepted files:** `.csv`, `.xlsx`, `.xls` — max 10 MB
**Access:** SUPER_ADMIN and ADMIN only

#### API Routes
- **POST** `/api/brokerage/upload` — upload file + date
- **GET** `/api/brokerage?month=&year=` — aggregated operator performance for dashboard
- **GET** `/api/brokerage/daily?month=&year=&operatorId=` — daily breakdown for charts

#### Upload Response
```json
{
  "uploadId": "...",
  "uploadDate": "...",
  "totalAmount": 0,
  "mappedCount": 0,
  "unmappedCount": 0,
  "warnings": ["CLIENT_CODE_NOT_FOUND: XYZ123"]
}
```

---

### 7.4 Task Management

**Pages:** `/tasks` (Admin), `/backoffice/tasks` (Back Office)
**API:** `src/app/api/tasks/`

#### Fields
| Field | Type | Notes |
|-------|------|-------|
| title | String | Max 100 chars |
| description | Text | Min 10 chars |
| assignedToId | String | FK to Employee |
| assignedById | String | Set automatically to current user |
| deadline | DateTime | Stored at 17:30:00 on the selected date — tasks expire at 5:30 PM |
| priority | TaskPriority | HIGH / MEDIUM / LOW |
| status | TaskStatus | PENDING / COMPLETED / EXPIRED |
| completedAt | DateTime | Set when status → COMPLETED |

#### Task Deadline & Expiry Rules
- Admin can set deadline for **same day** if current time is before 5:30 PM
- Deadline is always stored with time **17:30:00** (5:30 PM) on the chosen date
- Task calendar disables a day if 5:30 PM on that day has already passed
- The task detail modal displays: deadline date + "Expires at 5:30 PM"
- Auto-expiry (`deadline < now()`) naturally fires at 5:30 PM — no separate time logic needed
- Form hint shown in calendar popover: *"Tasks expire at 5:30 PM on the deadline date"*

#### Status Transitions
- `PENDING` → `COMPLETED`: Sets `completedAt`, notifies assigner
- `PENDING` → `EXPIRED`: Automatic via cron when `deadline < now()` (fires at 5:30 PM)
- Cannot complete an EXPIRED task
- Cannot complete an already COMPLETED task

#### Backoffice Tasks Page Tabs
The `/backoffice/tasks` page has three tabs:
- **Pending** — active tasks; "Complete" button available
- **Completed** — finished tasks; read-only
- **Expired** — auto-expired tasks; read-only; links from the dashboard KPI card (`?tab=expired`)

#### CRUD Operations
- **GET** `/api/tasks` — paginated; filters: assignedToId, assignedById, status, priority, department, dateFrom, dateTo
  - Auto-expires overdue PENDING tasks on each list call
  - BACK_OFFICE sees only own tasks
- **POST** `/api/tasks` — create + notify assignee
- **GET** `/api/tasks/[id]` — single task with comments
- **PATCH** `/api/tasks/[id]` — update fields or complete
- **GET** `/api/tasks/[id]/comments` — list comments (sorted ascending)
- **POST** `/api/tasks/[id]/comments` — add comment (max 2000 chars)

---

### 7.5 Reports

**Pages:** `/reports`, `/reports/brokerage`, `/reports/tasks`
**API:** `src/app/api/reports/`

#### Report Types

**Brokerage Report** (`GET /api/reports/brokerage?year=`)
- Annual brokerage matrix: operator × month × amount
- 12-month breakdown for full year
- Admins see all operators; equity dealers see only themselves
- Response: `{ matrix, months, operators }`

**Task Completion Report** (`GET /api/reports/tasks?year=&employeeId=`)
- Monthly task stats per employee
- Returns: completed, pending, expired counts + completion rate %
- BACK_OFFICE/EQUITY_DEALER/MF_DEALER see only own data

**Export** (`POST /api/reports/export`) — ADMIN+ only
- Type `brokerage`: exports Date, Client Code, Client Name, Operator, Amount, File Name as XLSX
- Type `tasks`: exports Title, Assigned To, Assigned By, Status, Priority, Deadline, Completed At as XLSX

#### Role-Based Report Access
| Role | Brokerage Report | Task Report | Export |
|------|-----------------|-------------|--------|
| SUPER_ADMIN | All operators | Any employee | ✅ |
| ADMIN | All operators | Any employee | ✅ |
| EQUITY_DEALER | Own only | ❌ | ❌ |
| MF_DEALER | — | ❌ | ❌ |
| BACK_OFFICE | — | Own only | ❌ |

> **Note:** Task Report was removed from EQUITY_DEALER and MF_DEALER report cards since task performance is not tracked for those departments.

---

### 7.6 Dashboards

#### Admin Dashboard (`/dashboard`)
**API:** `GET /api/dashboard/admin`

**KPI Cards (6):**
- Total Employees
- Total Clients (with Equity/MF breakdown)
- Monthly Brokerage (with trend vs last month)
- Traded Clients %
- Pending Tasks count
- Overdue Tasks count

**Widgets:**
- Brokerage Bar Chart — last 6 months + current by operator (Recharts)
- Task Pie Chart — PENDING / COMPLETED / EXPIRED distribution
- Operator Performance Table — daily brokerage breakdown per operator

---

#### Equity Dealer Dashboard (`/equity/dashboard`)
**API:** `GET /api/dashboard/equity`

**KPI Cards (5):**
- Total Clients
- Traded Clients
- Not Traded
- Traded %
- Monthly Brokerage (MTD)

---

#### MF Dealer Dashboard (`/mf/dashboard`)
**API:** `GET /api/dashboard/mf`

**KPI Cards (3):**
- Total Clients
- Active Clients (INVESTMENT_DONE / INTERESTED)
- Inactive Clients

---

#### Backoffice Dashboard (`/backoffice/dashboard`)
**API:** `GET /api/dashboard/backoffice?filter=today|tomorrow|week|month`

**KPI Cards (3):**
- Tasks Pending (blue accent)
- Tasks Completed this month (green accent)
- Tasks Expired (red accent) — links to `/backoffice/tasks?tab=expired`

**Table:** Filtered tasks — task name, assigned by/to, department badge, priority, status, deadline countdown
- Table has `min-w-[700px]` overflow scroll to prevent column truncation
- Default shows all pending tasks for the employee

**Filter options:** Today / Tomorrow / This Week / This Month
- **Today:** tasks due strictly on the current calendar day (`startOfDay → endOfDay`)
- **Tomorrow:** tasks due strictly on the next calendar day (`addDays(now, 1)`)
- **This Week:** tasks due within the current week (Mon–Sun)
- **This Month:** tasks due within the current calendar month

---

### 7.11 Dual-Role / Role Switcher

Some employees need access to two separate dashboards/views without maintaining two accounts. This is implemented via:

#### Database
- `Employee.secondaryRole Role?` — optional second role stored in DB
- Example: `vishakha.kul.work@gmail.com` has `role=BACK_OFFICE`, `secondaryRole=ADMIN`
- Example: `kedaroak_13@rediffmail.com` has `role=EQUITY_DEALER`, `secondaryRole=SUPER_ADMIN`

#### Session
- `secondaryRole` is included in the JWT token and `session.user` object
- Authorization checks in API routes always use `session.user.role` (primary role only)
- The higher-privilege secondary role is granted in session so that API data access is correct when active role is switched

#### Active Role Store (`src/stores/active-role-store.ts`)
Zustand store with `sessionStorage` persistence (resets on tab close; user-scoped to prevent cross-user contamination):

```typescript
interface ActiveRoleState {
  activeRole: string    // currently displayed role
  userId: string        // tracks which user is logged in
  initForUser(userId, primaryRole): void  // resets to primary if different user
  setActiveRole(role): void               // switches active role
}
```

- `initForUser` called on session load in sidebar — resets if a different user logs in
- Persisted under key `finance-crm-active-role` in `sessionStorage`
- Server-safe (falls back to no-op storage on server)

#### Role Switcher UI (TopBar)
- Visible **only** for employees with a non-null `secondaryRole`
- Appears between the Search icon and Notifications bell
- Pill-style button showing the currently active role name
- Dropdown lists both roles with a checkmark on the active one
- Switching calls `setActiveRole(role)` + navigates to the role's dashboard:

| Role | Dashboard |
|------|-----------|
| SUPER_ADMIN / ADMIN | `/dashboard` |
| EQUITY_DEALER | `/equity/dashboard` |
| MF_DEALER | `/mf/dashboard` |
| BACK_OFFICE | `/backoffice/dashboard` |

#### Sidebar Behavior
- Reads `effectiveRole = activeRole || session.user.role`
- Renders the nav items for the effective role
- Switches automatically when active role changes

#### API Authorization
- API routes are **not** affected by the active role — they always authorize against `session.user.role` (primary)
- For dual-role employees with a higher-privilege secondary role, the primary role must still cover required API access, OR the secondary role must be the one with the necessary permissions. The admin/super_admin role covers all data access so it naturally includes the lower-privilege role's data.

---

### 7.7 Notifications

**Library:** `src/lib/notifications.ts`
**Store:** `src/stores/notification-store.ts` (Zustand)
**API:** `src/app/api/notifications/`

#### Notification Types
| Type | Trigger |
|------|---------|
| TASK_ASSIGNED | Task created and assigned |
| TASK_COMPLETED | Task marked complete (notifies assigner) |
| TASK_EXPIRED | Cron marks task expired (notifies both parties) |
| BROKERAGE_UPLOAD | Brokerage file uploaded (notifies all EQUITY_DEALERs) |
| MONTHLY_RESET | Monthly reset cron runs (notifies all active employees) |

#### API Routes
- **GET** `/api/notifications?limit=&unreadOnly=` — fetch (default limit 20, max 100)
- **PATCH** `/api/notifications/[id]/read` — mark single as read
- **PATCH** `/api/notifications/mark-all-read` — mark all as read

#### UI Behavior (TopBar)
- Unread count badge (red, truncated to "9+" if >9)
- Dropdown panel showing 10 latest
- Unread items highlighted with blue left border
- Click: marks read + navigates to `notification.link`
- Auto-polls every **30 seconds**

---

### 7.8 Global Search

**API:** `GET /api/search?q=<query>` (min 2 chars, case-insensitive)
**File:** `src/app/api/search/route.ts`

| Entity | Fields searched | Role restriction | Max results |
|--------|----------------|-----------------|-------------|
| Clients | clientCode, firstName, lastName, phone | EQUITY_DEALER: own only | 5 |
| Tasks | title | BACK_OFFICE: own only | 5 |
| Employees | name, email | ADMIN+ only | 5 |

---

### 7.9 Settings & Activity Log

**Pages:** `/settings`, `/settings/activity-log`

#### Settings Tabs

**Profile Tab**
- Read-only display: name, email, department, role, designation
- Email change shows message: *"Email change requires admin approval"* (not implemented)

**Security Tab**
- Change password (current password + new password + confirm)
- Calls `PATCH /api/employees/{userId}` with `password` field
- Min 8 characters

**Activity Log Tab** (SUPER_ADMIN only)
- Filters: module (all / tasks / clients / brokerage / employees / auth)
- Columns: Timestamp, User, Action, Module (color-coded badge), Details
- 50 entries per page with pagination
- **API:** `GET /api/settings/activity-log?page=&limit=&module=`

---

### 7.10 Cron Jobs

Both endpoints require header: `x-cron-secret: <CRON_SECRET>`

#### Monthly Reset (`POST /api/cron/monthly-reset`)
**File:** `src/app/api/cron/monthly-reset/route.ts`
**Schedule:** First day of each month

**Actions:**
1. Archives previous month's client statuses to `MonthlyArchive`
2. Archives brokerage summaries per equity dealer
3. Archives task summaries per employee (completed/pending/expired counts)
4. Resets all equity clients: status → NOT_TRADED, remark → DID_NOT_ANSWER
5. Resets all MF clients: mfStatus → INACTIVE, mfRemark → DID_NOT_ANSWER
6. Clears all client notes and followUpDate
7. Creates MONTHLY_RESET notifications for all active employees
8. Logs MONTHLY_RESET action to ActivityLog

#### Task Expiry (`POST /api/cron/task-expiry`)
**File:** `src/app/api/cron/task-expiry/route.ts`
**Schedule:** Daily (or multiple times per day)

**Actions:**
1. Finds all PENDING tasks with `deadline < now()`
2. Updates them to EXPIRED
3. Creates TASK_EXPIRED notifications for assignees and assigners
4. Logs TASK_EXPIRY to ActivityLog

---

## 8. API Reference

### Complete API Route Table

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| **Auth** |
| GET/POST | `/api/auth/[...nextauth]` | — | — | NextAuth handlers |
| **Employees** |
| GET | `/api/employees` | ✅ | Any | List employees (filters: department, role, search, isActive) |
| POST | `/api/employees` | ✅ | ADMIN+ | Create employee |
| GET | `/api/employees/[id]` | ✅ | Any | Get single employee |
| PATCH | `/api/employees/[id]` | ✅ | ADMIN+ | Update employee |
| DELETE | `/api/employees/[id]` | ✅ | ADMIN+ | Delete employee |
| **Clients** |
| GET | `/api/clients` | ✅ | Any | List clients (paginated, filtered) |
| POST | `/api/clients` | ✅ | Any | Create client |
| GET | `/api/clients/[id]` | ✅ | Any | Get single client |
| PATCH | `/api/clients/[id]` | ✅ | Any | Update client |
| DELETE | `/api/clients/[id]` | ✅ | ADMIN+ | Delete client |
| POST | `/api/clients/import` | ✅ | ADMIN+ | CSV import (preview + confirm) |
| GET | `/api/clients/export` | ✅ | Any | Export clients as CSV |
| PATCH | `/api/clients/bulk` | ✅ | Any | Bulk status update |
| **Brokerage** |
| GET | `/api/brokerage` | ✅ | Any | Brokerage performance data |
| POST | `/api/brokerage/upload` | ✅ | ADMIN+ | Upload brokerage file |
| GET | `/api/brokerage/daily` | ✅ | Any | Daily brokerage breakdown |
| **Tasks** |
| GET | `/api/tasks` | ✅ | Any | List tasks (paginated, filtered) |
| POST | `/api/tasks` | ✅ | Any | Create + assign task |
| GET | `/api/tasks/[id]` | ✅ | Any | Get task with comments |
| PATCH | `/api/tasks/[id]` | ✅ | Any | Update task / complete |
| GET | `/api/tasks/[id]/comments` | ✅ | Any | List task comments |
| POST | `/api/tasks/[id]/comments` | ✅ | Any | Post comment |
| **Dashboards** |
| GET | `/api/dashboard/admin` | ✅ | ADMIN+ | Admin KPIs + charts |
| GET | `/api/dashboard/equity` | ✅ | EQUITY/ADMIN+ | Equity dealer KPIs |
| GET | `/api/dashboard/mf` | ✅ | MF/ADMIN+ | MF dealer KPIs |
| GET | `/api/dashboard/backoffice` | ✅ | BACKOFFICE/ADMIN+ | Backoffice tasks |
| **Reports** |
| GET | `/api/reports/brokerage` | ✅ | Any | Annual brokerage matrix |
| GET | `/api/reports/tasks` | ✅ | Any | Annual task report |
| POST | `/api/reports/export` | ✅ | ADMIN+ | Export as XLSX |
| **Notifications** |
| GET | `/api/notifications` | ✅ | Any | Fetch notifications |
| PATCH | `/api/notifications/[id]/read` | ✅ | Any | Mark single read |
| PATCH | `/api/notifications/mark-all-read` | ✅ | Any | Mark all read |
| **Search** |
| GET | `/api/search?q=` | ✅ | Any | Global search |
| **Settings** |
| GET | `/api/settings/activity-log` | ✅ | SUPER_ADMIN | Activity log |
| **Cron** |
| POST | `/api/cron/monthly-reset` | Header | — | Monthly archival + reset |
| POST | `/api/cron/task-expiry` | Header | — | Expire overdue tasks |

---

## 9. Frontend Structure

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx                      # Login page with role redirect
│   ├── (protected)/
│   │   ├── layout.tsx                           # SessionProvider + sidebar + topbar
│   │   ├── dashboard/page.tsx                   # Admin dashboard
│   │   ├── clients/page.tsx                     # Admin: all clients
│   │   ├── brokerage/
│   │   │   ├── page.tsx                         # Admin brokerage view
│   │   │   └── upload/page.tsx                  # Upload file + preview + confirm
│   │   ├── tasks/page.tsx                       # Admin tasks page
│   │   ├── reports/
│   │   │   ├── page.tsx                         # Reports hub (role-based cards)
│   │   │   ├── brokerage/page.tsx               # Brokerage report + chart + export
│   │   │   └── tasks/page.tsx                   # Task report + chart + export
│   │   ├── masters/
│   │   │   ├── employees/page.tsx               # Employee master CRUD
│   │   │   ├── clients/
│   │   │   │   ├── page.tsx                     # Client master list
│   │   │   │   └── new/page.tsx                 # Create client form
│   │   ├── equity/
│   │   │   ├── dashboard/page.tsx               # Equity dealer dashboard (5 KPIs)
│   │   │   ├── clients/page.tsx                 # Equity dealer's clients
│   │   │   └── brokerage/page.tsx               # My brokerage view
│   │   ├── mf/
│   │   │   ├── dashboard/page.tsx               # MF dealer dashboard (3 KPIs)
│   │   │   └── clients/page.tsx                 # MF dealer's clients
│   │   ├── backoffice/
│   │   │   ├── dashboard/page.tsx               # Backoffice dashboard
│   │   │   └── tasks/page.tsx                   # Assigned tasks list
│   │   └── settings/
│   │       ├── page.tsx                         # Profile + security tabs
│   │       └── activity-log/page.tsx            # Activity log (SUPER_ADMIN)
│   ├── api/                                     # All API routes (see section 8)
│   └── page.tsx                                 # Root redirect → /login
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx                          # Role-based navigation
│   │   └── topbar.tsx                           # Notifications + search + user
│   ├── dashboard/
│   │   ├── kpi-card.tsx                         # Metric card component
│   │   ├── brokerage-chart.tsx                  # Horizontal bar chart
│   │   ├── task-pie-chart.tsx                   # Donut chart
│   │   └── operator-table.tsx                   # Operator daily breakdown table
│   ├── tasks/
│   │   ├── task-assignment-form.tsx             # Dept → Employee → task form
│   │   ├── task-detail-modal.tsx                # Task detail + complete button
│   │   ├── task-comments.tsx                    # Comments list + add form
│   │   └── task-card.tsx                        # Task summary card
│   ├── brokerage/
│   │   └── upload-zone.tsx                      # Drag-and-drop file input
│   └── ui/                                      # Shadcn/ui: 20+ components
├── lib/
│   ├── auth.ts                                  # NextAuth config
│   ├── prisma.ts                                # Prisma singleton client
│   ├── validations.ts                           # Zod schemas (all entities)
│   ├── notifications.ts                         # createNotification helpers
│   ├── activity-log.ts                          # logActivity helper
│   └── cron/
│       ├── monthly-reset.ts                     # Monthly reset logic
│       └── task-expiry.ts                       # Task expiry logic
├── stores/
│   ├── notification-store.ts                   # Zustand notification state (polls every 30s)
│   └── active-role-store.ts                    # Zustand active role (sessionStorage, dual-role)
└── types/
    ├── index.ts                                 # TypeScript interfaces
    └── next-auth.d.ts                           # NextAuth type augmentation (role, secondaryRole, etc.)
```

---

## 10. Navigation & Sidebar

**File:** `src/components/layout/sidebar.tsx`

### Menu Structure by Role

**ADMIN / SUPER_ADMIN**
- Dashboard → `/dashboard`
- All Clients → `/clients`
- Brokerage → `/brokerage`
- Tasks → `/tasks`
- Reports → `/reports`
- Masters (expandable)
  - Employee Master → `/masters/employees`
  - Client Master → `/masters/clients`

**EQUITY_DEALER**
- Dashboard → `/equity/dashboard`
- My Clients → `/equity/clients`
- My Brokerage → `/equity/brokerage`
- Reports → `/reports`

**MF_DEALER**
- Dashboard → `/mf/dashboard`
- My Clients → `/mf/clients`
- Reports → `/reports`

**BACK_OFFICE**
- Dashboard → `/backoffice/dashboard`
- Tasks → `/backoffice/tasks`
- Reports → `/reports`

### Sidebar Features
- Active link: blue left border + dark background
- Expandable Masters section: ChevronDown/Right toggle
- User section (bottom): avatar initials + name + designation + sign out
- Nav items driven by `effectiveRole` from `useActiveRoleStore` (not directly from session) — updates instantly on role switch

### TopBar Features
- **Search:** Opens command palette (`CommandSearch` component)
- **Role Switcher:** Pill button (blue) visible only for dual-role employees — shows active role; dropdown allows switching to the other role and navigates to the new dashboard
- **Notifications:** Bell icon with unread badge; dropdown panel with 10 latest; 30s polling
- **User Avatar:** Initials badge; dropdown with Change Password and Sign Out

---

## 11. Shared Components

### KPI Card (`components/dashboard/kpi-card.tsx`)
Props: `title`, `value`, `subtitle`, `icon`, `accent` (blue/indigo/green/emerald/amber/red), `trend`, `action`

### Brokerage Chart (`components/dashboard/brokerage-chart.tsx`)
Horizontal bar chart with operator performance. Colors: `[#3b82f6, #ef4444, #a855f7, #f59e0b, #10b981, #6b7280, #06b6d4, #ec4899]`

### Task Pie Chart (`components/dashboard/task-pie-chart.tsx`)
Donut chart. Colors: pending=#F9A825, completed=#2E7D32, expired=#D32F2F

### Operator Table (`components/dashboard/operator-table.tsx`)
Sticky header (green #2E7D32), totals footer (light green #e8f5e9), daily breakdown columns, horizontal scroll

### Task Detail Modal (`components/tasks/task-detail-modal.tsx`)
Full task view with meta info, priority/status badges, countdown to deadline, embedded comments, and "Complete" button with AlertDialog confirmation

### Upload Zone (`components/brokerage/upload-zone.tsx`)
Drag-and-drop, file type filter (`.csv,.xlsx,.xls`), size validation (default 10 MB), visual feedback

---

## 12. Known Issues & Bugs

> Issues identified from code analysis as of 2026-02-26

1. **Task auto-expiry is lazy (not real-time)**
   `GET /api/tasks` expires overdue tasks on each list call rather than relying solely on the cron job. This means tasks only get marked EXPIRED when someone views the task list. If cron is not set up, tasks remain PENDING indefinitely.
   **File:** `src/app/api/tasks/route.ts` — inline expiry before select

2. **Unmapped brokerage client codes silently skipped**
   Client codes in brokerage files that don't match any `Client.clientCode` in the database are tracked as warnings but still saved as `BrokerageDetail` records with `clientId = null` and `operatorId` empty. These orphaned records affect reporting totals but are attributed to no operator.
   **File:** `src/app/api/brokerage/upload/route.ts`

3. **Monthly reset does NOT check if archive already exists**
   If `/api/cron/monthly-reset` is called twice in the same month, the `@@unique([month, year, entityType, entityId])` constraint on `MonthlyArchive` will throw a database error. No idempotency guard exists.
   **File:** `src/lib/cron/monthly-reset.ts`

4. **Notification polling is unconditional**
   The TopBar polls `/api/notifications` every 30 seconds regardless of user activity or tab focus. On Vercel/serverless, this generates a constant stream of cold-start DB queries.
   **File:** `src/components/layout/topbar.tsx`

5. **Settings page email change is UI-only placeholder**
   The email field shows a message "Email change requires admin approval" but there is no ticket/request flow behind it — it is completely non-functional.
   **File:** `src/app/(protected)/settings/page.tsx` lines 82-83

6. **Client import skips operator validation**
   During CSV import preview, the `operatorId` column value is validated for format but not checked against actual active employees. An import can succeed with a non-existent or inactive `operatorId`.
   **File:** `src/app/api/clients/import/route.ts`

7. **Brokerage report `/equity/brokerage` accessible by ADMIN but uses equity dealer filter**
   When an ADMIN visits the equity brokerage page, the API call uses their session ID as operatorId, returning no data since ADMIN is not an equity dealer.
   **File:** `src/app/(protected)/equity/brokerage/page.tsx`

8. **Dual-role API authorization gap**
   API routes authorize using `session.user.role` (primary role). If a dual-role employee's primary role is lower-privilege (e.g. BACK_OFFICE) and they switch to their secondary role (ADMIN), some write APIs (e.g. creating tasks) will be denied by the API even though the UI shows admin nav. Workaround: ensure the higher-privilege role is set as the primary role for dual-role employees.
   **Files:** `src/app/api/tasks/route.ts`, `src/app/api/employees/route.ts` (role checks use `session.user.role`)

---

## 13. Incomplete / Pending Features

1. **Client Engagement Report**
   Listed as a report card for ADMIN on the Reports page (`/reports`) with description "Client trading status and follow-up data" but links to `/reports/brokerage` instead of a dedicated page. No `GET /api/reports/clients` route exists.
   **File:** `src/app/(protected)/reports/page.tsx` line 10

2. **Dedicated Notifications Page (`/notifications`)**
   The TopBar notification panel has a "View all notifications" link to `/notifications`, but no page exists at that route. Clicking it returns a 404.
   **File:** `src/components/layout/topbar.tsx` lines 114-119

3. **Email Change Flow**
   The settings profile tab marks email as read-only with "requires admin approval" but there is no mechanism for an employee to request it or for an admin to approve it.

4. **MF Dealer Report Card**
   The MF dealer's "My Clients" report card links to `/mf/clients` (a client list page) rather than a dedicated report. No MF-specific report page exists.
   **File:** `src/app/(protected)/reports/page.tsx` line 19

5. **Cron Job Scheduling**
   The cron routes (`/api/cron/monthly-reset`, `/api/cron/task-expiry`) exist but there is no built-in scheduler. They must be triggered by an external service (e.g., Vercel Cron, GitHub Actions, Easycron). No `vercel.json` cron config found.

6. **Notification Read Receipt on Navigate**
   Notifications are marked read on click in the dropdown, but there is no mechanism to mark them read if a user navigates directly to the linked page via URL.

7. **Dual-role employees: Settings page shows primary role only**
   The Settings profile tab always shows `session.user.role` (primary role). If the employee has switched to their secondary role, the Settings page will still display the primary role designation. This is cosmetic only.

---

## 14. File Structure Map

### Key Files Quick Reference

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Complete database schema |
| `prisma/seed.ts` | Database seed data |
| `src/lib/auth.ts` | NextAuth configuration |
| `src/lib/prisma.ts` | Prisma singleton |
| `src/lib/validations.ts` | All Zod schemas |
| `src/lib/notifications.ts` | Notification creation helpers |
| `src/lib/activity-log.ts` | Activity logging helper |
| `src/lib/cron/monthly-reset.ts` | Monthly archival + reset logic |
| `src/lib/cron/task-expiry.ts` | Task auto-expiry logic |
| `src/stores/notification-store.ts` | Zustand notification state (polls every 30s) |
| `src/stores/active-role-store.ts` | Zustand active role store (dual-role switcher, sessionStorage) |
| `src/types/index.ts` | TypeScript interfaces |
| `src/types/next-auth.d.ts` | Session/JWT type augmentation (role, secondaryRole, department, designation) |
| `src/components/layout/sidebar.tsx` | Role-based navigation |
| `src/components/layout/topbar.tsx` | Top bar with notifications |
| `src/components/dashboard/kpi-card.tsx` | Metric card |
| `src/components/brokerage/upload-zone.tsx` | File upload input |
| `src/components/tasks/task-detail-modal.tsx` | Task view + complete |
| `.env.example` | Environment variable template |
| `package.json` | Dependencies + scripts |

---

*Documentation generated from codebase analysis — 2026-02-26*
*Last updated — 2026-02-26: Added dual-role/role switcher, task 5:30 PM expiry, backoffice expired tab & KPI, Due Tomorrow filter, ADMIN-only bulk client ops, task report removal for equity/MF, secondaryRole DB field*

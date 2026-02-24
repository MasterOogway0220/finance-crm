# MASTER PROMPT — FinanceCRM: Complete Build Instructions for Claude Code

> **IMPORTANT**: This is a single, exhaustive prompt. Follow every instruction sequentially. Do NOT skip sections. Do NOT simplify the UI. Build production-grade code with real business logic, not placeholder demos.

---

## PROJECT IDENTITY

- **Name**: FinanceCRM
- **Domain**: Financial Brokerage CRM for a firm with 3 departments — Equity, Mutual Funds, Back-Office
- **UI Benchmark**: Zoho CRM (clean, card-based, dark sidebar, professional)
- **Currency**: Indian Rupees (₹) — use `Intl.NumberFormat('en-IN')` for all currency formatting

---

## TECH STACK (USE EXACTLY THIS)

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS + shadcn/ui components |
| Database | MySQL 8.0+ (Hostinger hosting — use their bundled MySQL) |
| Auth | NextAuth.js v5 (credentials provider, JWT strategy) |
| Charts | Recharts |
| File Parsing | SheetJS (xlsx) for brokerage uploads, Papaparse for CSV |
| Date Handling | date-fns |
| Icons | Lucide React |
| Toast/Notifications | sonner (toast library) |
| Forms | React Hook Form + Zod validation |
| Tables | @tanstack/react-table |
| Scheduler | node-cron (for monthly resets and task expiry) |
| State | Zustand (global state for notifications, user session) |

---

## STEP 1: PROJECT INITIALIZATION

```bash
npx create-next-app@latest finance-crm --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd finance-crm
npx shadcn@latest init
# Install ALL dependencies
npm install prisma @prisma/client next-auth@beta @auth/prisma-adapter
npm install react-hook-form @hookform/resolvers zod
npm install recharts @tanstack/react-table
npm install xlsx papaparse date-fns
npm install lucide-react sonner zustand
npm install bcryptjs node-cron
npm install -D @types/bcryptjs @types/papaparse @types/node-cron
# Install shadcn components
npx shadcn@latest add button card input label select dialog dropdown-menu table badge tabs avatar separator sheet tooltip popover calendar command alert-dialog textarea progress skeleton switch
```

---

## STEP 2: DATABASE SCHEMA (Prisma)

Create `prisma/schema.prisma` with EXACTLY this schema. Do NOT deviate from these models:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

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

model Employee {
  id            String      @id @default(cuid())
  name          String
  email         String      @unique
  phone         String
  password      String
  department    Department
  designation   String
  role          Role
  isActive      Boolean     @default(true)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  // Relations
  assignedClients    Client[]          @relation("OperatorClients")
  tasksReceived      Task[]            @relation("TaskAssignee")
  tasksAssigned      Task[]            @relation("TaskAssigner")
  taskComments       TaskComment[]
  notifications      Notification[]
  activityLogs       ActivityLog[]
  brokerageUploads   BrokerageUpload[]

  @@index([department])
  @@index([role])
}

model Client {
  id              String          @id @default(cuid())
  clientCode      String          @unique
  firstName       String
  middleName      String?
  lastName        String
  phone           String
  department      Department      // EQUITY or MUTUAL_FUND
  operatorId      String
  operator        Employee        @relation("OperatorClients", fields: [operatorId], references: [id])

  // Equity-specific
  status          ClientStatus    @default(NOT_TRADED)
  remark          ClientRemark    @default(DID_NOT_ANSWER)

  // MF-specific
  mfStatus        MFClientStatus  @default(INACTIVE)
  mfRemark        MFClientRemark  @default(DID_NOT_ANSWER)

  notes           String?         @db.Text
  followUpDate    DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  brokerageDetails BrokerageDetail[]

  @@index([operatorId])
  @@index([clientCode])
  @@index([department])
  @@index([status])
}

model Task {
  id              String        @id @default(cuid())
  title           String
  description     String        @db.Text
  assignedToId    String
  assignedTo      Employee      @relation("TaskAssignee", fields: [assignedToId], references: [id])
  assignedById    String
  assignedBy      Employee      @relation("TaskAssigner", fields: [assignedById], references: [id])
  startDate       DateTime      @default(now())
  deadline        DateTime
  status          TaskStatus    @default(PENDING)
  priority        TaskPriority  @default(MEDIUM)
  completedAt     DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  comments        TaskComment[]

  @@index([assignedToId])
  @@index([assignedById])
  @@index([status])
  @@index([deadline])
}

model TaskComment {
  id          String    @id @default(cuid())
  taskId      String
  task        Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  authorId    String
  author      Employee  @relation(fields: [authorId], references: [id])
  content     String    @db.Text
  createdAt   DateTime  @default(now())

  @@index([taskId])
}

model BrokerageUpload {
  id            String    @id @default(cuid())
  uploadDate    DateTime  // The business date this brokerage is for
  uploadedById  String
  uploadedBy    Employee  @relation(fields: [uploadedById], references: [id])
  totalAmount   Float     @default(0)
  fileName      String
  createdAt     DateTime  @default(now())

  details       BrokerageDetail[]

  @@unique([uploadDate])
  @@index([uploadDate])
}

model BrokerageDetail {
  id              String          @id @default(cuid())
  brokerageId     String
  brokerage       BrokerageUpload @relation(fields: [brokerageId], references: [id], onDelete: Cascade)
  clientCode      String
  clientId        String?
  client          Client?         @relation(fields: [clientId], references: [id])
  operatorId      String
  amount          Float
  createdAt       DateTime        @default(now())

  @@unique([brokerageId, clientCode])
  @@index([operatorId])
  @@index([brokerageId])
}

model MonthlyArchive {
  id          String    @id @default(cuid())
  month       Int       // 1-12
  year        Int
  entityType  String    // "client_status", "brokerage_summary", "task_summary"
  entityId    String    @default("")  // Use empty string instead of null for MySQL unique constraint compatibility
  data        Json      // archived snapshot
  createdAt   DateTime  @default(now())

  @@unique([month, year, entityType, entityId])
  @@index([month, year])
}

model Notification {
  id          String    @id @default(cuid())
  userId      String
  user        Employee  @relation(fields: [userId], references: [id])
  type        String    // "task_assigned", "task_expired", "task_completed", "brokerage_uploaded", "client_assigned", "monthly_reset", "deadline_reminder"
  title       String
  message     String    @db.Text
  isRead      Boolean   @default(false)
  link        String?   // optional URL to navigate to
  createdAt   DateTime  @default(now())

  @@index([userId, isRead])
  @@index([createdAt])
}

model ActivityLog {
  id          String    @id @default(cuid())
  userId      String
  user        Employee  @relation(fields: [userId], references: [id])
  action      String
  module      String    // "tasks", "clients", "brokerage", "employees", "auth"
  details     String?   @db.Text
  ipAddress   String?
  createdAt   DateTime  @default(now())

  @@index([userId])
  @@index([module])
  @@index([createdAt])
}
```

After creating schema, run:
```bash
npx prisma generate
npx prisma db push
```

---

## STEP 3: SEED DATA

Create `prisma/seed.ts`. This seeds all employees from the client's CSV data with default password `Finance@123` (bcrypt hashed):

```
EQUITY DEPARTMENT:
- Kedar Dattatraya Oak | 9820769466 | kedaroak_13@rediffmail.com | Director | SUPER_ADMIN
- Sarvesh Kedar Oak | 7506878954 | sarveshoak3@gmail.com | Director | ADMIN
- Reshma Manoj Verunkar | 9870304188 | reshmamyerunkar@gmail.com | Equity Dealer | EQUITY_DEALER
- Karan Ganesh Patil | 8355906043 | patilkaran128@gmail.com | Equity Dealer | EQUITY_DEALER
- Vinit Vijay Gollar | 9920854923 | vinitgollar07@gmail.com | Equity Dealer | EQUITY_DEALER
- Shweta Arvind Pethe | 9820401832 | pethe.shweta95@gmail.com | Equity Dealer | EQUITY_DEALER
- Kedar Niranjan Mulye | 7506149415 | kedarmulyeo1@gmail.com | Equity Dealer | EQUITY_DEALER

MUTUAL FUND DEPARTMENT:
- Gayatri Ganesh Ghadi | 9870696706 | gayatri.ghadi123@gmail.com | Mutual Fund Dealer | MF_DEALER
- Rishita Rajesh Tawde | 9869081424 | risha.tawade@yahoo.co.in | Mutual Fund Dealer | MF_DEALER

BACK-OFFICE DEPARTMENT:
- Akshita Raju Ramugade | 9326212377 | akshita15work@gmail.com | Back Office | BACK_OFFICE
- Vishakha Narayan Kulkarni | 9730072211 | vishakha.kul.work@gmail.com | Back Office | BACK_OFFICE
- Pradip Vinayak Mahadik | 9867179860 | pradipmahadik1982@gmail.com | Back Office | BACK_OFFICE
- Adesh Datta Mhatre | 7219026123 | adeshmhatre008@gmail.com | Back Office | BACK_OFFICE
- Rutvik Pravin Sovilkar | 8767549873 | rutviksovilkar2000@gmail.com | Back Office | BACK_OFFICE
```

Also seed some sample clients (at least 20 for Equity with various operators, 5 for MF) and some sample tasks to make the UI testable immediately.

---

## STEP 4: AUTHENTICATION (NextAuth.js)

### Configuration:
- Use Credentials Provider (email + password)
- JWT strategy with `role`, `department`, `id`, `name` in the token
- Session callback exposes `role`, `department`, `id` to the client
- Protect all routes via middleware — redirect unauthenticated users to `/login`

### Login page (`/login`):
- Clean centered card with FinanceCRM logo at top
- Email input, Password input, "Sign In" button
- Error message display for invalid credentials
- No registration page — users are created by admin only

### Role-based redirect after login:
| Role | Redirect To |
|---|---|
| SUPER_ADMIN | `/dashboard` (admin dashboard) |
| ADMIN | `/dashboard` (admin dashboard) |
| EQUITY_DEALER | `/equity/dashboard` |
| MF_DEALER | `/mf/dashboard` |
| BACK_OFFICE | `/backoffice/dashboard` |

### Middleware (`middleware.ts`):
- Protect ALL routes under `/(dashboard|equity|mf|backoffice|tasks|clients|brokerage|reports|masters|settings)/*`
- Check role-based access: e.g., Back-Office cannot access `/equity/*`
- Redirect unauthorized access to their correct dashboard

---

## STEP 5: GLOBAL LAYOUT (Zoho CRM Style)

### File: `src/app/(protected)/layout.tsx`

This is the authenticated shell wrapping all protected pages. Structure:

```
┌─────────────────────────────────────────────────────────────┐
│ TOP BAR (h-16, white bg, border-bottom)                     │
│ [Hamburger ☰] [FinanceCRM Logo]     [🔍 Search] [🔔 3] [👤]│
├──────────┬──────────────────────────────────────────────────┤
│ SIDEBAR  │ MAIN CONTENT (scrollable)                        │
│ (w-64)   │                                                  │
│ dark bg  │ {children}                                       │
│ #1a1a2e  │                                                  │
│          │                                                  │
├──────────┤                                                  │
│ User     │                                                  │
│ avatar + │                                                  │
│ name     │                                                  │
│ Sign out │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### Sidebar Design (MATCH ZOHO CRM):
- Background: dark navy/charcoal (`#1a1a2e` or `#0f172a`)
- Logo area at top: FinanceCRM with a small icon (use a trending-up lucide icon in blue)
- Nav items: icon + label, text white/gray
- Active item: left blue accent bar (4px), slightly lighter background, white text
- Hover: subtle background change
- User section at bottom: avatar circle with initials, employee name, designation below, sign-out button
- Collapsible on tablet (icons only), hamburger on mobile

### Sidebar items are DYNAMIC based on role. Render different items per role:

**Super Admin / Admin:**
1. Dashboard (LayoutDashboard icon)
2. All Clients (Users icon)
3. Brokerage (IndianRupee icon)
4. Tasks (CheckSquare icon)
5. Task Assignment (ClipboardPlus icon)
6. Reports (BarChart3 icon)
7. Masters (Database icon) — expandable sub-menu: Employee Master, Client Master
8. Settings (Settings icon)

**Equity Dealer:**
1. Dashboard (LayoutDashboard icon)
2. My Clients (Users icon)
3. My Brokerage (IndianRupee icon)
4. My Tasks (CheckSquare icon)
5. Assign Task (ClipboardPlus icon)
6. Reports (BarChart3 icon)
7. Settings (Settings icon)

**MF Dealer:**
1. Dashboard (LayoutDashboard icon)
2. My Clients (Users icon)
3. My Tasks (CheckSquare icon)
4. Assign Task (ClipboardPlus icon)
5. Reports (BarChart3 icon)
6. Settings (Settings icon)

**Back-Office Employee (ONLY 3 items per client requirement):**
1. Dashboard (LayoutDashboard icon)
2. Tasks (CheckSquare icon)
3. Reports (BarChart3 icon)

### Top Bar:
- Global search: Command+K or click search icon → opens a command palette (use shadcn Command component) that searches across clients, tasks, employees
- Notification bell with red badge showing unread count → clicking opens a dropdown panel listing recent notifications, each clickable to navigate
- User avatar dropdown: "Profile", "Settings", "Sign Out"

### Notification Panel (dropdown from bell icon):
- Shows latest 10 notifications
- Each notification: icon (based on type), title, message, time ago
- "Mark all as read" link at top
- Unread notifications have a blue left border
- Clicking a notification marks it as read and navigates to the relevant page

---

## STEP 6: ADMIN DASHBOARD (`/dashboard`)

**Route:** `src/app/(protected)/dashboard/page.tsx`
**Access:** SUPER_ADMIN, ADMIN only

### Layout:
**Page header:** "Dashboard" title with current date displayed

**Row 1 — KPI Cards (6 cards in a responsive grid, 3 cols on desktop, 2 on tablet, 1 on mobile):**

Each card uses the shadcn Card component with:
- Label text (top-left, small, muted)
- Large number (bottom-left, font-bold text-3xl)
- Small icon (top-right, in a colored circle background)
- Optional subtitle text below the number
- Hover: subtle shadow increase

Cards:
1. **Total Employees** — count from Employee master, icon: Users, accent: blue. Subtitle: "Across 3 departments"
2. **Total Clients** — count from Client master, icon: Briefcase, accent: indigo. Subtitle: "Equity: X | MF: Y"
3. **Monthly Brokerage** — sum of all brokerage for current month formatted as ₹XX,XX,XXX, icon: IndianRupee, accent: green. Subtitle: "+X% from last month" (compare with previous month archive, show green up arrow if positive, red down arrow if negative)
4. **Traded Clients** — percentage across all equity operators, icon: TrendingUp, accent: emerald. Subtitle: "X of Y clients"
5. **Pending Tasks** — all tasks with PENDING status, icon: Clock, accent: amber. Subtitle: "Across all departments"
6. **Overdue Tasks** — tasks where deadline < today AND status = PENDING (these are expired), icon: AlertTriangle, accent: red. Subtitle: "Requires attention"

**Row 2 — Charts (2 columns):**

Left (60% width): **Brokerage Trend Chart**
- Recharts `BarChart` (horizontal — use `layout="vertical"`)
- Y-axis: operator names
- X-axis: brokerage amounts
- Stacked bars, each segment = one month (color-coded)
- Show last 6 months of data from MonthlyArchive + current month live
- Title: "Brokerage by Operator" with a month-range subtitle
- Use these colors for months: blue, red, purple, amber, green, gray, cyan, pink

Right (40% width): **Task Distribution**
- Recharts `PieChart` / donut chart
- Segments: Pending (amber), Completed (green), Expired (red)
- Center text: total task count
- Legend below

**Row 3 — Operator Performance Table (full width):**

This is the critical business table. Build it with @tanstack/react-table.

Columns:
| # | Column | Source |
|---|---|---|
| 1 | Operator Name | employee.name where role = EQUITY_DEALER |
| 2 | No. of Clients | count of clients where operatorId = this employee |
| 3 | Successfully Traded | count where status = TRADED |
| 4 | Not Traded | total - traded |
| 5 | Successfully Traded (%) | (traded / total * 100).toFixed(2) + "%" |
| 6 | Traded Amount in % | (operator month brokerage / total company brokerage * 100).toFixed(2) + "%" |
| 7 | Did Not Answer | count where remark = DID_NOT_ANSWER |
| 8 | Total in Month (₹) | sum of all brokerage details for this operator in current month |
| 9-39 | Day 1 through Day 31 | brokerage for each calendar day (show only up to today's date, future days show "—") |

**Footer row:** Bold, green background — shows company-wide totals for columns 2-8 and each day column.

Styling: match the client's green-header spreadsheet reference — use a dark green (#2E7D32) header row with white text, alternating row colors, bold operator names.

**Row 4 — Quick Actions (4 buttons in a row):**
- Upload Brokerage → navigates to `/brokerage/upload`
- Assign Task → opens task assignment modal
- Add New Client → navigates to `/masters/clients/new`
- Generate Report → navigates to `/reports`

Each button: outlined style with icon left, text right.

---

## STEP 7: EQUITY DEALER DASHBOARD (`/equity/dashboard`)

**Route:** `src/app/(protected)/equity/dashboard/page.tsx`
**Access:** EQUITY_DEALER only (show data ONLY for logged-in user)

### Layout:

**Welcome Banner:**
- "Welcome, {employee.name}" (text-2xl font-bold)
- "Here's your work overview for today" (text-muted)
- Right side: current date formatted as "Tuesday, 24 February 2026"

**Row 1 — KPI Cards (3+2 grid):**

Top row (3 cards):
1. **Total Clients** — blue accent, icon: Users. Number = count of clients assigned to this operator. Subtitle: "Assigned to you"
2. **Traded Clients** — green accent, icon: TrendingUp. Number = count where status = TRADED. Subtitle: "Active trading"
3. **Not Traded** — red/orange accent, icon: TrendingDown. Number = total - traded. Subtitle: "Pending activation"

Bottom row (2 cards):
4. **Pending Tasks** — amber, icon: Clock. Count of tasks assigned to this user with status PENDING.
5. **Completed Tasks** — green, icon: CheckCircle. Count of tasks completed this month.

**Row 2 — My Tasks Preview:**
- Section title: "My Tasks" with subtitle "Your assigned tasks and their status"
- Show 5 most recent tasks as list items
- Each item: colored dot (orange=pending, green=completed, red=expired), task title, status badge pill on right
- "View All Tasks" link at bottom → navigates to `/equity/tasks`

**Row 3 — Daily Brokerage Chart:**
- Recharts `BarChart` (vertical)
- X-axis: dates (1, 2, 3... up to today)
- Y-axis: brokerage amount in ₹
- Single color bars (blue)
- Title: "My Daily Brokerage — {current month name}"
- Show total MTD brokerage as a summary card above the chart

---

## STEP 8: MY CLIENTS PAGE — EQUITY (`/equity/clients`)

**Route:** `src/app/(protected)/equity/clients/page.tsx`
**Access:** EQUITY_DEALER — show ONLY clients where operatorId = logged-in user's id

### Layout:

**Page Header:** "My Clients" title, subtitle: "Manage your client trading status"

**Filter Bar (below header):**
- Search input (left): placeholder "Search by code, name, or phone..." — filters in real-time across clientCode, firstName+lastName, phone
- Status dropdown: "All Status" / "Traded" / "Not Traded"
- Remark dropdown: "All Remarks" / "Successfully Traded" / "Not Traded" / "No Funds for Trading" / "Did Not Answer" / "Self Trading"
- Bulk Actions button (right): appears when checkboxes are selected → dropdown with "Update Status" and "Update Remark"
- Export CSV button (far right): exports current filtered view as CSV

**Data Table** (full width, @tanstack/react-table with pagination):

| Column | Width | Render |
|---|---|---|
| ☐ Checkbox | 40px | For bulk selection |
| Client Code | 120px | Monospace font, e.g. `18K099` |
| Client Name | 200px | "{firstName} {middleName} {lastName}" — truncate with tooltip if long |
| Contact | 130px | Phone number, on mobile: wrapped in `<a href="tel:...">` |
| Product Type | 100px | Badge: "Equity" (blue) or "MF" (green) |
| Status | 130px | Inline dropdown (select component): Traded / Not Traded. On change → API call to update. **When changed to Traded, auto-set remark to "Successfully Traded" (but allow override)** |
| Remarks | 180px | Inline dropdown: Successfully Traded, Not Traded, No Funds for Trading, Did Not Answer, Self Trading. On change → API call. |
| Follow-up | 130px | Date picker (calendar popover). When set, shows date. When empty, shows "Set date" link. |
| Notes | 150px | Click to expand/edit. Shows truncated text with "..." if long. Clicking opens an inline text area. Save on blur. |

**Row Styling:**
- Status = Traded: light green background row (`bg-green-50`)
- Remark = "No Funds for Trading": light yellow background (`bg-yellow-50`)
- All others: white / alternating gray

**Pagination:** 25 rows per page, with page number controls.

**IMPORTANT API ENDPOINTS needed:**
```
GET    /api/clients?operatorId=xxx&status=xxx&remark=xxx&search=xxx&page=1&limit=25
PATCH  /api/clients/[id]  — body: { status, remark, notes, followUpDate }
PATCH  /api/clients/bulk   — body: { clientIds: [], status?, remark? }
GET    /api/clients/export?operatorId=xxx&format=csv
```

---

## STEP 9: BROKERAGE MODULE

### 9A: Brokerage Upload Page (`/brokerage/upload`)

**Access:** SUPER_ADMIN, ADMIN only

**Layout:**

**Step 1 — File Upload:**
- Drag-and-drop zone (dashed border, centered)
- Text: "Drop your brokerage file here or click to browse"
- Accepts: .csv, .xlsx, .xls
- File size limit: 10MB
- Date picker: "Select brokerage date" — defaults to yesterday (since brokerage for day X is typically uploaded on day X+1)
- "Process File" button

**Step 2 — Preview & Confirmation (shown after file is parsed):**
- Show a summary table:
  | Operator | Client Count | Total Brokerage |
  |---|---|---|
  | Karan Ganesh Patil | 15 | ₹1,28,370 |
  | Reshma Manoj Verunkar | 8 | ₹45,210 |
  | ... | ... | ... |
  | **TOTAL** | **23** | **₹1,73,580** |
- Show warnings if any:
  - "3 client codes not found in Client Master (skipped): ABC123, XYZ456, ..."
  - "12 duplicate entries consolidated (summed)"
- If brokerage for this date already exists: show alert "⚠️ Brokerage for {date} already exists. Uploading will overwrite existing data."
- "Confirm Upload" and "Cancel" buttons

**Step 3 — Success:**
- Success toast: "Brokerage for {date} uploaded successfully"
- Redirect to brokerage dashboard

**Server-side parsing logic (`/api/brokerage/upload`):**
1. Accept multipart form data (file + date)
2. Parse with SheetJS — read first sheet
3. Find columns: look for a column containing "client" or "code" (case-insensitive) and a column containing "brokerage" or "amount" (case-insensitive). If not found, try columns A and B.
4. For each row: extract clientCode (trim whitespace, uppercase) and amount (parse as float)
5. Deduplicate: group by clientCode, sum amounts
6. Map to operators: lookup each clientCode in Client table → get operatorId
7. Collect unmapped codes (not in Client Master) as warnings
8. If date already has upload: delete existing BrokerageUpload and BrokerageDetails for that date
9. Create BrokerageUpload record, then bulk-create BrokerageDetail records
10. Update BrokerageUpload.totalAmount = sum of all details
11. Send notification to all EQUITY_DEALER employees: "Brokerage for {date} has been uploaded"
12. Create ActivityLog entry

### 9B: Brokerage Dashboard (`/brokerage`)

**Access:** SUPER_ADMIN, ADMIN (full view), EQUITY_DEALER (own data only at `/equity/brokerage`)

**Layout (Admin View):**

**Month/Year Selector:** Dropdown at top-right to select which month to view (default: current month)

**Main Table** (the big operator performance table):

Build this as a wide scrollable table. Columns:

| Col | Header | Width | Data |
|---|---|---|---|
| A | Operator | 150px, sticky left | Employee name (bold, colored text matching reference) |
| B | No. of Clients | 80px | Client count |
| C | Successfully Traded | 100px | Count where status=TRADED |
| D | Not Traded | 80px | B - C |
| E | Successfully Traded (%) | 100px | (C/B*100).toFixed(2)% |
| F | Traded Amount in % | 100px | (operator_total / company_total * 100).toFixed(2)% |
| G | Did Not Answer | 80px | Count where remark=DID_NOT_ANSWER |
| H | Total in Month (₹) | 120px | Sum of brokerage for this operator in selected month |
| I+ | Day 1, Day 2, ... Day 31 | 80px each | Brokerage amount for that specific date. If no upload for that date, show 0 or "—" |

**Header Row:** Dark green background (#2E7D32), white bold text.
**Data Rows:** Alternating white and light gray. Operator name in bold dark color.
**Footer Row:** TOTAL row with green/yellow background, bold, showing company-wide sums.

**Chart below table:** Stacked horizontal bar chart (Recharts BarChart with layout="vertical"):
- Y-axis: operator names
- X-axis: brokerage amount
- Each bar segment = one month's total (use MonthlyArchive for past months, live data for current month)
- Color-code each month segment differently
- Title: "Equity All Stats"

### 9C: My Brokerage (Equity Dealer View) (`/equity/brokerage`)

**Access:** EQUITY_DEALER only, own data

**Layout:**
- Large KPI card: "Total Brokerage (MTD)" showing ₹ formatted total
- Table: Date | Brokerage Amount — one row per day where brokerage was uploaded
- Bar chart: daily brokerage for current month
- Month selector to view past months (from archive)

---

## STEP 10: TASK MANAGEMENT MODULE

### 10A: Task Assignment (`/tasks/assign`)

**Access:** SUPER_ADMIN, ADMIN, EQUITY_DEALER, MF_DEALER (NOT Back-Office)

Can be a dedicated page OR a modal (accessible from sidebar "Assign Task" or the quick action button). Implement as a full page with a centered form card.

**Form Layout (inside a Card, max-width 600px, centered):**

Title: "Assign New Task"

| Row | Field | Component | Behavior |
|---|---|---|---|
| 1 | Department | Select dropdown | Options: Equity, Mutual Fund, Back-Office, Admin. On change → fetches employees of that department and populates the "Assign To" dropdown. Reset "Assign To" when department changes. |
| 2 | Assign To | Select dropdown (dynamic) | Disabled until department is selected. Shows: "{employee.name}" for each active employee in the selected department. |
| 3 | Assigned By | Read-only input | Auto-filled: "{logged-in user's name} ({department})" |
| 4 | Task Title | Text input | Max 100 chars, required |
| 5 | Task Description | Textarea | Min 10 chars, required, 4 rows |
| 6 | Start Date | Read-only input | Auto: current date formatted as "24 Feb 2026" |
| 7 | Deadline | Date picker (Calendar) | Required. Must be >= today. If past date selected, show red validation error: "Deadline cannot be in the past" |
| 8 | Priority | Select dropdown | High (red badge) / Medium (yellow badge) / Low (green badge). Default: Medium |
| 9 | — | "Assign Task" Button | Full-width, primary blue. On submit: validate → call API → show success toast → reset form |

**API: `POST /api/tasks`**
- Create task record
- Create notification for assignee: "New task assigned: {title}"
- Create activity log entry
- Return created task

**Validation (Zod schema):**
```typescript
const taskSchema = z.object({
  assignedToId: z.string().min(1, "Please select an employee"),
  title: z.string().min(1).max(100),
  description: z.string().min(10, "Description must be at least 10 characters"),
  deadline: z.date().min(new Date(new Date().setHours(0,0,0,0)), "Deadline cannot be in the past"),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
});
```

### 10B: Back-Office Tasks Page (`/backoffice/tasks`)

**Access:** BACK_OFFICE only

**Layout:**

**Tab Bar at top:**
Two tabs: **Pending** | **Completed**
(Implemented with shadcn Tabs component — URL param sync: `?tab=pending` or `?tab=completed`)

**Below tabs — Filter Row:**
- Department dropdown: "All Departments" / "Admin" / "Equity" / "Mutual Fund"
  - This filters by `task.assignedBy.department`

**Task List:**
Display tasks as card-style list items (NOT a traditional table — match the client's reference UI):

Each task card:
```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│ ┃  Task Title (bold)                              [PENDING]     │
│ ┃  Task description preview (gray, truncated)      badge        │
│ ┃  Assigned by: Name • Department • Due: 28 Feb   Days: 4 left │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```
- Left accent bar color: orange (pending), green (completed), red (expired)
- Status badge pill: PENDING (yellow bg), COMPLETED (green bg), EXPIRED (red bg)
- "Days to expiry" shown on right: "4 days left" (green text), "Due today" (orange), "Expired 3 days ago" (red)
- **SHOW ALL TASKS** — pending, completed, AND expired — all visible. Tabs filter them. The "All" view under each tab shows all of that status.
- Clicking ANY task card → opens Task Detail Modal

**Show additional columns/info:**
- Assignee department
- Date assigned
- Deadline
- Days to expiry (calculated: deadline - today, negative if expired)

**Task Detail Modal (shadcn Dialog, large size):**

Content layout:
```
┌─────────────────────────────────────────────────────────┐
│  Task Title (text-xl bold)                      [badge] │
│                                                         │
│  Assigned By:  Karan Ganesh Patil (Equity)              │
│  Date Assigned:  20 Feb 2026                            │
│  Deadline:       28 Feb 2026                            │
│  Days to Expiry: 4 days remaining  (or "Expired by 3   │
│                                     days" in red)       │
│  Priority:       [HIGH] (red badge)                     │
│                                                         │
│  ─── Task Description ───                               │
│  Full text of the task displayed here...                │
│                                                         │
│  ─── Comments ───                                       │
│  [Comment 1 by Author - 2 days ago]                     │
│  [Comment 2 by Author - 1 day ago]                      │
│  [Add comment input + Post button]                      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │        ✅ Complete Task (green button)           │    │
│  └─────────────────────────────────────────────────┘    │
│  (button hidden if status = COMPLETED or EXPIRED)       │
└─────────────────────────────────────────────────────────┘
```

**Complete Task Flow:**
1. User clicks "Complete Task" button
2. Confirmation dialog appears (shadcn AlertDialog):
   - Title: "⚠️ Complete Task"
   - Description: "This action cannot be reversed. Once marked as complete, the task status is permanent. Are you sure you want to proceed?"
   - Buttons: "Cancel" (outline) | "Submit" (destructive/green)
3. On "Submit":
   - API call: `PATCH /api/tasks/[id]` with `{ status: "COMPLETED" }`
   - Server validates: if deadline < today → reject with "Task has expired and cannot be completed"
   - Server validates: if already COMPLETED → reject
   - On success: set completedAt = now(), create notification for assigner, create activity log
   - Close modal, refresh task list, show success toast

**AUTO-EXPIRY (Critical — server-side cron job):**
- Run a cron job every hour (or at midnight daily): find all tasks where `status = PENDING` AND `deadline < new Date()` → update status to `EXPIRED`
- Create notifications for affected assignees: "Task '{title}' has expired"
- Also check on every API read: if a pending task's deadline < now, treat it as EXPIRED in the response (belt-and-suspenders approach)

### 10C: My Tasks (Equity/MF Dealer) (`/equity/tasks` and `/mf/tasks`)

Same UI as Back-Office tasks page but:
- Shows tasks assigned TO the logged-in user
- Has an additional tab: "Assigned by Me" — showing tasks the dealer has assigned to others
- "Assigned by Me" tab shows: task title, assigned to (name + department), deadline, status

### 10D: Tasks (Admin View) (`/tasks`)

**Access:** SUPER_ADMIN, ADMIN

Shows ALL tasks across the system with additional filters:
- Assigned To (employee dropdown)
- Assigned By (employee dropdown)
- Department
- Status: All / Pending / Completed / Expired
- Date range picker

Full data table with all columns. Admin can see everything but cannot complete tasks on behalf of employees.

---

## STEP 11: BACK-OFFICE DASHBOARD (`/backoffice/dashboard`)

**Access:** BACK_OFFICE only

**Layout:**

**Welcome Section:**
- "Welcome, {employee.name}" (text-2xl bold)
- Designation: "Back Office" (text-muted)
- Date: auto-formatted current date — "Tuesday, 24 February 2026"

**KPI Cards Row (2 cards):**
1. **Tasks Pending** — amber accent, large number, icon: Clock
   - MUST have a "View" button at bottom-right of card
   - "View" button navigates to `/backoffice/tasks?tab=pending`
2. **Tasks Completed** — green accent, large number, icon: CheckCircle
   - MUST have a "View" button at bottom-right of card
   - "View" button navigates to `/backoffice/tasks?tab=completed`

**My Tasks Section:**

Below cards, section title: "My Tasks" with a dropdown on the right: **Day | Week | Month**

- "Day" → shows only PENDING tasks due today
- "Week" → shows only PENDING tasks due within this week (Mon-Sun)
- "Month" → shows only PENDING tasks due within this calendar month

Display tasks as card list (same card format as the tasks page — colored left bar, title, description, badge).

**Monthly Reset Note:** Both card counts reset on 1st of each month. This month's data starts fresh. Historical data is in Reports.

---

## STEP 12: MUTUAL FUND MODULE

### 12A: MF Dashboard (`/mf/dashboard`)

**Access:** MF_DEALER only

Same structure as Equity Dashboard but with MF-specific KPIs:
- Total Clients (assigned to this dealer)
- Active Clients (mfStatus = ACTIVE)
- Inactive Clients (mfStatus = INACTIVE)
- Pending Tasks
- Completed Tasks

My Tasks preview and a client engagement mini-chart.

### 12B: MF My Clients (`/mf/clients`)

Same table structure as Equity My Clients but with MF-specific fields:

| Column | Type |
|---|---|
| Client Code | Read-only |
| Client Name | Read-only |
| Contact | Phone |
| Status | Dropdown: Active / Inactive |
| Remark | Dropdown: Investment Done / Interested / Not Interested / Did Not Answer / Follow-up Required |
| Notes | Editable text |
| Follow-up Date | Date picker |

Same filtering, search, bulk operations, export functionality as Equity.

---

## STEP 13: MASTERS MODULE

### 13A: Employee Master (`/masters/employees`)

**Access:** SUPER_ADMIN, ADMIN

**Layout:**

**Header:** "Employee Master" + "Add Employee" button (top right, primary blue)

**Data Table:**
| Column | Notes |
|---|---|
| Name | Full name |
| Phone | Phone number |
| Email | Email address |
| Department | Badge colored by department |
| Designation | Text |
| Role | Badge |
| Status | Toggle switch: Active/Inactive |
| Actions | Edit button, Deactivate button |

**Add/Edit Employee Form (modal or slide-over):**
- Name (text, required)
- Email (email, required, unique validation)
- Phone (text, 10 digits, required)
- Department (dropdown: Equity, Mutual Fund, Back-Office, Admin)
- Designation (text, required)
- Role (dropdown: SUPER_ADMIN, ADMIN, EQUITY_DEALER, MF_DEALER, BACK_OFFICE)
- Password (only on create — min 8 chars; on edit: optional "Reset Password" button)
- Active toggle

### 13B: Client Master (`/masters/clients`)

**Access:** SUPER_ADMIN, ADMIN

**Header:** "Client Master" + "Add Client" button + "Bulk Import" button

**Data Table:**
All clients across all operators. Columns: Client Code, Name, Phone, Department (badge), Operator Name, Status, Remark, Date Added. With search and filters.

**Add Client Form (`/masters/clients/new` or modal):**

| Field | Component | Validation |
|---|---|---|
| Client Code | Text input | **CRITICAL: Must match one of 3 formats. Validate on blur with regex. Show red error if invalid: "Invalid client code format. Accepted: 18K099, 91383117, 18KS008"** |
| First Name | Text input | Required |
| Middle Name | Text input | Optional |
| Last Name | Text input | Required |
| Phone Number | Text input | 10 digits, required |
| Department | Select | Equity / Mutual Fund. On change → filter Operator dropdown |
| Assigned Operator | Select (dynamic) | Shows only employees from selected department with matching dealer role |
| — | Submit: "Add Client" button | |

**Client Code Validation Regex:**
```typescript
function validateClientCode(code: string): boolean {
  const formatA = /^\d{2}[A-Z]\d{3}$/;          // 18K099
  const formatB = /^\d{8}$/;                      // 91383117
  const formatC = /^\d{2}[A-Z]{1,5}\d{3}$/;      // 18KS008
  return formatA.test(code) || formatB.test(code) || formatC.test(code);
}
```

Show real-time validation feedback: green checkmark if valid, red X with message if invalid.

**Bulk Import:**
- Upload CSV with columns: Client Code, First Name, Middle Name, Last Name, Phone, Department, Operator Email
- Parse and validate all rows
- Show preview: valid rows (green) and invalid rows (red with error reason)
- "Import Valid Rows" button

**Client Transfer:**
- In the client table, each row has an "Actions" dropdown with "Transfer Client" option
- Opens modal: "Transfer {clientName} to:" with department + operator dropdowns
- On confirm: update operatorId, create activity log

---

## STEP 14: REPORTS MODULE

### 14A: Reports Landing (`/reports`)

Show different report options based on role:

**Admin View:**
- Equity Brokerage Report (monthly)
- Operator Performance Report
- Task Completion Report (all departments)
- Client Engagement Report
- Department Comparison

**Equity Dealer View:**
- My Brokerage Report
- My Client Engagement Report
- My Task Report

**MF Dealer View:**
- My Client Report
- My Task Report

**Back-Office View:**
- My Task Performance Report

### 14B: Brokerage Report (`/reports/brokerage`)

**Access:** Admin + Equity Dealer (own)

**Filters:** Date range (month/year pickers), Operator (admin only — dropdown with "All")

**Content:**
- Monthly brokerage table: Operator × Month matrix
- Stacked bar chart
- Summary cards: Total brokerage, top operator, company average
- Export buttons: "Download PDF" and "Download Excel"

### 14C: Task Report (`/reports/tasks`)

**Access:** All roles (scoped)

**Back-Office specific view:**
- Summary cards: Total Completed (all-time), Total Pending/Expired, Completion Rate %
- Monthly breakdown table:
  | Month | Tasks Received | Completed | Pending/Expired | Completion Rate |
- Bar chart: completed vs pending per month (Recharts grouped bar chart)
- Department filter: see tasks from Equity / Admin / MF separately

**Admin view:**
- Same as above but can see all employees
- Employee comparison: side-by-side completion rates
- Department-wise task volume chart

### 14D: Export Functionality

Every report page has:
- "Export to Excel" button → generates .xlsx file using SheetJS
- "Export to PDF" button → generates PDF (use a library like jsPDF + autoTable, or server-side html-to-pdf)
- Include date range, filters applied, and generated-by in the export header

---

## STEP 15: MONTHLY RESET SYSTEM

### Cron Job: `src/lib/cron/monthly-reset.ts`

Schedule: Runs on the 1st of every month at 00:00 IST

Steps:
1. **Archive Client Statuses:**
   - For each client: create MonthlyArchive record with entityType = "client_status", data = { clientCode, status, remark, operatorId }
   - For each operator: create MonthlyArchive with entityType = "brokerage_summary", data = { operatorId, totalBrokerage, tradedClients, totalClients }

2. **Archive Task Summaries:**
   - For each employee: count completed, pending, expired tasks for the month → create MonthlyArchive with entityType = "task_summary"

3. **Reset Client Statuses:**
   - `UPDATE clients SET status = 'NOT_TRADED', remark = 'DID_NOT_ANSWER' WHERE department = 'EQUITY'`
   - `UPDATE clients SET mfStatus = 'INACTIVE', mfRemark = 'DID_NOT_ANSWER' WHERE department = 'MUTUAL_FUND'`

4. **Send Notifications:**
   - Notify all users: "Monthly reset completed for {month name}. All statuses have been reset."

5. **Log Activity:**
   - Create activity log: "Monthly reset completed for {month}/{year}"

### Cron Job: Task Expiry Check (`src/lib/cron/task-expiry.ts`)

Schedule: Runs every day at 00:05 IST (and also at noon for safety)

Steps:
1. Find all tasks where status = PENDING AND deadline < start_of_today
2. Update all to status = EXPIRED
3. For each expired task: create notification for assignee and assigner

### Implementation:

In `src/app/api/cron/monthly-reset/route.ts` — create an API route that can be triggered by:
- node-cron running in a custom server
- OR an external cron service (like Vercel Cron) hitting this endpoint
- Protect with a secret key in header

---

## STEP 16: NOTIFICATION SYSTEM

### API Endpoints:
```
GET    /api/notifications?unreadOnly=true&limit=10
PATCH  /api/notifications/[id]/read
PATCH  /api/notifications/mark-all-read
```

### Helper function: `src/lib/notifications.ts`
```typescript
export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) { ... }
```

Call this function from:
- Task creation → notify assignee
- Task completion → notify assigner
- Task expiry → notify both
- Brokerage upload → notify all equity dealers
- Client assignment → notify operator
- Monthly reset → notify all
- Deadline approaching (24h before) → notify assignee

### Frontend:
- Zustand store for notifications: `{ notifications: [], unreadCount: 0, fetchNotifications, markAsRead, markAllRead }`
- Poll every 30 seconds: `GET /api/notifications?unreadOnly=true`
- Display in the notification bell dropdown (see Step 5)

---

## STEP 17: ACTIVITY LOG (`/settings/activity-log`)

**Access:** SUPER_ADMIN only

**Data Table:**
| Column | Source |
|---|---|
| Timestamp | createdAt formatted |
| User | user.name |
| Action | action text |
| Module | module name (badge) |
| Details | additional context |

Filters: User, Module, Date range. Paginated, 50 per page.

### Helper: `src/lib/activity-log.ts`
```typescript
export async function logActivity(params: {
  userId: string;
  action: string;
  module: string;
  details?: string;
  ipAddress?: string;
}) { ... }
```

Log on: login, logout, task creation, task completion, client status change, brokerage upload, employee CRUD, client CRUD, monthly reset.

---

## STEP 18: SETTINGS PAGE (`/settings`)

**Access:** All roles

**Sections:**
1. **Profile** — View/edit own name, phone, email (email change requires admin). Change password form.
2. **Notification Preferences** — Toggle on/off: email notifications, in-app notifications (by type)
3. **System Settings** (Admin only) — Company name, brokerage upload settings, client code validation patterns

---

## STEP 19: GLOBAL SEARCH

Implement a Command-K palette using shadcn's Command component.

Keyboard shortcut: Ctrl+K / Cmd+K opens the search modal.

**Search scopes:**
- Clients: search by code, name, phone → shows matching clients with operator name
- Tasks: search by title → shows matching tasks with status
- Employees: search by name → shows matching employees with department

**Each result:** Icon (Users/CheckSquare/Briefcase), primary text, secondary text (department/status), click → navigate to relevant page.

**Implementation:**
- Debounced search (300ms) → hits `GET /api/search?q=xxx` → returns combined results from clients, tasks, employees
- Limit 5 results per category
- Show category headers: "Clients", "Tasks", "Employees"

---

## STEP 20: API ROUTE STRUCTURE

Organize ALL API routes under `src/app/api/`:

```
api/
├── auth/
│   └── [...nextauth]/route.ts
├── employees/
│   ├── route.ts              (GET list, POST create)
│   └── [id]/route.ts         (GET one, PATCH update, DELETE deactivate)
├── clients/
│   ├── route.ts              (GET list, POST create)
│   ├── [id]/route.ts         (GET, PATCH, DELETE)
│   ├── bulk/route.ts         (PATCH bulk update)
│   ├── import/route.ts       (POST bulk import CSV)
│   └── export/route.ts       (GET export CSV)
├── tasks/
│   ├── route.ts              (GET list, POST create)
│   ├── [id]/route.ts         (GET, PATCH)
│   └── [id]/comments/route.ts (GET, POST)
├── brokerage/
│   ├── route.ts              (GET dashboard data)
│   ├── upload/route.ts       (POST upload file)
│   └── daily/route.ts        (GET daily breakdown)
├── notifications/
│   ├── route.ts              (GET list)
│   ├── [id]/read/route.ts    (PATCH mark read)
│   └── mark-all-read/route.ts (PATCH)
├── reports/
│   ├── brokerage/route.ts    (GET brokerage report data)
│   ├── tasks/route.ts        (GET task report data)
│   └── export/route.ts       (POST generate export file)
├── search/route.ts            (GET global search)
├── dashboard/
│   ├── admin/route.ts         (GET admin dashboard KPIs)
│   ├── equity/route.ts        (GET equity dealer dashboard KPIs)
│   ├── mf/route.ts            (GET MF dealer dashboard KPIs)
│   └── backoffice/route.ts    (GET back-office dashboard KPIs)
└── cron/
    ├── monthly-reset/route.ts (POST trigger monthly reset)
    └── task-expiry/route.ts   (POST trigger task expiry check)
```

**EVERY API route MUST:**
1. Check authentication (get session, verify user exists)
2. Check authorization (verify role has access to this endpoint)
3. Validate input with Zod
4. Use Prisma transactions for multi-step operations
5. Return consistent JSON: `{ success: true, data: ... }` or `{ success: false, error: "message" }`
6. Handle errors with try/catch and return appropriate HTTP status codes

---

## STEP 21: ENVIRONMENT VARIABLES

Create `.env.example`:
```
DATABASE_URL="mysql://username:password@localhost:3306/finance_crm"
# Hostinger MySQL: mysql://u123456789_user:password@srv123.hostinger.com:3306/u123456789_finance_crm
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"
CRON_SECRET="your-cron-secret"
```

---

## MYSQL-SPECIFIC CONSIDERATIONS FOR HOSTINGER

### Prisma + MySQL Notes:
1. **String fields** default to `VARCHAR(191)` in MySQL. All long text fields (descriptions, messages, notes) MUST use `@db.Text` annotation — this is already done in the schema above.
2. **JSON columns** — MySQL 8.0+ supports native JSON. The `Json` type in Prisma maps correctly. If Hostinger runs MySQL 5.7, use `@db.LongText` instead and serialize/deserialize JSON manually.
3. **DateTime** — MySQL stores timestamps in UTC. Use `@default(now())` which Prisma handles via `CURRENT_TIMESTAMP(3)`.
4. **Unique constraint with nullable columns** — MySQL allows multiple NULLs in unique indexes (unlike PostgreSQL). The `MonthlyArchive.@@unique([month, year, entityType, entityId])` requires `entityId` to always have a value. Use empty string `""` instead of `null` when there's no entity reference.
5. **Connection pooling** — Hostinger shared hosting may limit concurrent MySQL connections (typically 30-50). Add `connection_limit` to DATABASE_URL: `mysql://user:pass@host:3306/db?connection_limit=10`
6. **Prisma migrations** — Use `npx prisma db push` for initial setup. For production changes, use `npx prisma migrate dev` locally then `npx prisma migrate deploy` on Hostinger.

### Hostinger Deployment:
1. **Hosting Plan**: Use Hostinger **VPS** or **Cloud Hosting** plan (shared hosting does NOT support Node.js runtime). Alternatively, use Hostinger's MySQL database with a separate Node.js host (e.g., deploy Next.js on Vercel/Railway and connect to Hostinger's MySQL remotely).
2. **MySQL Access**: Create database via Hostinger hPanel → Databases → MySQL. Note the host (usually `localhost` on VPS, or `srv-xxx.hostinger.com` for remote access), username, password, and database name.
3. **Remote MySQL**: If deploying Next.js outside Hostinger, enable "Remote MySQL" in hPanel and whitelist your deployment server's IP.
4. **Environment**: Set `DATABASE_URL` in your deployment platform's environment variables with the Hostinger MySQL connection string.
5. **SSL**: For remote connections, add `?sslaccept=strict` to the DATABASE_URL if Hostinger's MySQL requires SSL.
6. **Cron Jobs**: Use Hostinger's built-in cron job scheduler (hPanel → Advanced → Cron Jobs) to call the monthly reset and task expiry API endpoints via `curl`.

---

## STEP 22: CRITICAL BUSINESS RULES (ENFORCE ALL OF THESE)

1. **Monthly Reset**: On 1st of each month — archive data, then reset all client statuses to NOT_TRADED/DID_NOT_ANSWER, MF to INACTIVE/DID_NOT_ANSWER. Brokerage counters reset.
2. **Task Expiry**: Deadline passed + status PENDING → auto-EXPIRED. EXPIRED tasks CANNOT be completed. Enforce server-side.
3. **Task Completion Irreversible**: Once COMPLETED, cannot go back to PENDING. No status regression allowed.
4. **Client Code Validation**: 3 formats only: `^\d{2}[A-Z]\d{3}$`, `^\d{8}$`, `^\d{2}[A-Z]{1,5}\d{3}$`. Reject all others with clear error message.
5. **Operator Data Isolation**: EQUITY_DEALER sees only their own clients and brokerage. Never cross-operator data leakage.
6. **Brokerage Deduplication**: Sum multiple entries for same client code in a single upload.
7. **Cascading Dropdowns**: Department selection filters employee list in task assignment and client assignment forms.
8. **Back-Office Sidebar**: Exactly 3 items — Dashboard, Tasks, Reports. No more.
9. **Dashboard KPI View Buttons**: Back-Office dashboard cards MUST have "View" buttons that link to pre-filtered task views.
10. **Back-Office Task Filters**: Day/Week/Month dropdown shows ONLY PENDING tasks for that period.

---

## STEP 23: UI POLISH CHECKLIST

- [ ] All monetary values formatted with ₹ symbol and Indian number format (₹1,23,456.78)
- [ ] All dates formatted consistently: "24 Feb 2026" for display, ISO for API
- [ ] Loading skeletons on all data-fetching pages (use shadcn Skeleton)
- [ ] Empty states with illustrations for: no tasks, no clients, no brokerage data
- [ ] Confirmation dialogs for ALL destructive actions
- [ ] Toast notifications for all CRUD operations (success and error)
- [ ] Responsive design: works on desktop (1280px+), tablet (768px), mobile (375px)
- [ ] Sidebar collapses to icons on tablet, hamburger on mobile
- [ ] Tables scroll horizontally on mobile
- [ ] KPI cards stack to 1 column on mobile
- [ ] All forms show field-level validation errors in real-time
- [ ] Buttons show loading spinners during API calls (use `isLoading` state)
- [ ] Page titles update via Next.js metadata
- [ ] Breadcrumbs on all pages showing navigation path
- [ ] 404 page and error boundary pages styled consistently
- [ ] Favicon and app manifest for PWA

---

## STEP 24: COLOR THEME (match exactly)

```css
/* In tailwind.config.ts or globals.css */
:root {
  --sidebar-bg: #0f172a;        /* Dark navy sidebar */
  --sidebar-active: #1e293b;    /* Active sidebar item bg */
  --sidebar-accent: #3b82f6;    /* Blue accent bar */
  --primary: #1B73E8;           /* Primary blue */
  --success: #2E7D32;           /* Green */
  --warning: #F9A825;           /* Amber */
  --danger: #D32F2F;            /* Red */
  --muted-bg: #F5F5F5;          /* Page background */
  --card-bg: #FFFFFF;           /* Cards */
  --table-header: #2E7D32;      /* Brokerage table header - dark green */
  --table-alt: #F9FAFB;         /* Alternating row */
}
```

Font: Use Inter (import from Google Fonts in layout.tsx):
```tsx
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'] })
```

---

## STEP 25: FILE STRUCTURE

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (protected)/
│   │   ├── layout.tsx              ← Sidebar + Top bar shell
│   │   ├── dashboard/page.tsx      ← Admin dashboard
│   │   ├── equity/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── clients/page.tsx
│   │   │   ├── brokerage/page.tsx
│   │   │   └── tasks/page.tsx
│   │   ├── mf/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── clients/page.tsx
│   │   │   └── tasks/page.tsx
│   │   ├── backoffice/
│   │   │   ├── dashboard/page.tsx
│   │   │   └── tasks/page.tsx
│   │   ├── brokerage/
│   │   │   ├── page.tsx            ← Brokerage dashboard (admin)
│   │   │   └── upload/page.tsx
│   │   ├── tasks/
│   │   │   ├── page.tsx            ← All tasks (admin)
│   │   │   └── assign/page.tsx
│   │   ├── clients/page.tsx        ← All clients (admin)
│   │   ├── reports/
│   │   │   ├── page.tsx            ← Report landing
│   │   │   ├── brokerage/page.tsx
│   │   │   └── tasks/page.tsx
│   │   ├── masters/
│   │   │   ├── employees/page.tsx
│   │   │   └── clients/
│   │   │       ├── page.tsx
│   │   │       └── new/page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       └── activity-log/page.tsx
│   ├── api/                         ← All API routes (see Step 20)
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── topbar.tsx
│   │   ├── notification-panel.tsx
│   │   └── command-search.tsx
│   ├── dashboard/
│   │   ├── kpi-card.tsx
│   │   ├── brokerage-chart.tsx
│   │   ├── task-pie-chart.tsx
│   │   └── operator-table.tsx
│   ├── clients/
│   │   ├── client-table.tsx
│   │   ├── client-form.tsx
│   │   ├── client-code-input.tsx
│   │   └── bulk-import-modal.tsx
│   ├── tasks/
│   │   ├── task-card.tsx
│   │   ├── task-detail-modal.tsx
│   │   ├── task-assignment-form.tsx
│   │   ├── task-comments.tsx
│   │   └── complete-task-dialog.tsx
│   ├── brokerage/
│   │   ├── upload-zone.tsx
│   │   ├── upload-preview.tsx
│   │   ├── brokerage-table.tsx
│   │   └── brokerage-chart.tsx
│   ├── reports/
│   │   ├── brokerage-report.tsx
│   │   └── task-report.tsx
│   └── ui/                          ← shadcn components (auto-generated)
├── lib/
│   ├── prisma.ts                    ← Prisma client singleton
│   ├── auth.ts                      ← NextAuth config
│   ├── validations.ts               ← All Zod schemas
│   ├── notifications.ts             ← createNotification helper
│   ├── activity-log.ts              ← logActivity helper
│   ├── utils.ts                     ← formatCurrency, formatDate, cn, etc.
│   ├── client-code-validator.ts     ← Client code regex validation
│   └── cron/
│       ├── monthly-reset.ts
│       └── task-expiry.ts
├── hooks/
│   ├── use-notifications.ts
│   ├── use-current-user.ts
│   └── use-debounce.ts
├── stores/
│   └── notification-store.ts        ← Zustand store
└── types/
    └── index.ts                     ← Shared TypeScript types
```

---

## STEP 26: LAUNCH CHECKLIST

After building everything:
1. Run `npx prisma db push` to create all tables
2. Run `npx prisma db seed` to seed employee data
3. Test login for each role (SUPER_ADMIN, ADMIN, EQUITY_DEALER, MF_DEALER, BACK_OFFICE)
4. Verify sidebar shows correct items per role
5. Test brokerage upload with a sample CSV file
6. Test task assignment flow end-to-end
7. Test task completion with irreversibility
8. Test task expiry (create a task with past deadline, verify it shows as expired)
9. Verify client code validation rejects bad codes
10. Verify operator data isolation (equity dealer cannot see other operator's clients)
11. Test responsive design at 1280px, 768px, 375px
12. Verify all notifications are generated correctly
13. Test global search across clients, tasks, employees
14. Verify export functionality (CSV from clients, Excel from reports)

---

## FINAL NOTES FOR CLAUDE CODE

- Build every single page. Do not leave any page as "TODO" or placeholder.
- Every API route must have real database queries, not mock data.
- Every table must have real pagination, sorting, and filtering.
- Every form must have complete Zod validation with error messages.
- Every chart must use real data from the database.
- Use server components where possible, client components only where interactivity is needed.
- Use `loading.tsx` files for suspense boundaries on data-fetching pages.
- Handle all edge cases: empty states, loading states, error states.
- The brokerage table with 31 day-columns MUST scroll horizontally with a sticky first column (operator name).
- Use Prisma transactions for any multi-step write operations.
- All monetary values MUST use the `₹` symbol with Indian formatting.
- The app must be production-ready — not a prototype.
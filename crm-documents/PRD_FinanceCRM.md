# Product Requirements Document (PRD)

## FinanceCRM — Customer Relationship Management Platform for Financial Services

| Field | Detail |
|---|---|
| **Document Version** | 1.0 |
| **Date** | February 24, 2026 |
| **Product Name** | FinanceCRM |
| **Client Domain** | Financial Brokerage & Advisory Services |
| **Reference Platform** | Zoho CRM (UI/UX Benchmark) |
| **Status** | Draft — Awaiting Client Sign-off |

---

## 1. Executive Summary

FinanceCRM is a purpose-built Customer Relationship Management platform designed for a financial brokerage firm operating across three core departments — **Equity**, **Mutual Funds**, and **Back-Office**. The system will track daily brokerage performance, manage client–operator relationships, automate task workflows, and provide rich reporting dashboards — all within a clean, modern interface inspired by Zoho CRM.

The platform replaces the client's existing manual processes (Excel-based brokerage tracking, ad-hoc task assignment, and fragmented reporting) with a unified, role-based web application that offers real-time visibility into business performance, employee productivity, and client engagement.

---

## 2. Problem Statement

The client's current workflow suffers from several pain points:

**Manual Brokerage Tracking** — Daily brokerage data is downloaded from the SNAP ERP system (Ventura), pasted into rough Excel sheets, cleaned for duplicate client codes, and then manually mapped to operators. This process is error-prone, time-consuming, and lacks a single source of truth.

**Fragmented Task Management** — Tasks are assigned across departments (Equity → Back-Office, Admin → Back-Office, MF → Back-Office) via verbal communication or informal channels. There is no centralized system to track deadlines, completion status, or overdue items.

**No Performance Visibility** — There is no dashboard to give managers or employees a bird's-eye view of monthly brokerage totals, traded vs. non-traded client ratios, or task completion rates.

**No Historical Reporting** — Monthly data is overwritten rather than archived, making it impossible to identify trends or evaluate long-term performance.

---

## 3. Goals & Success Metrics

### 3.1 Primary Goals

- Digitize end-to-end brokerage tracking from raw data upload to per-operator daily/monthly summaries
- Implement a role-based task management system with automatic expiry enforcement
- Provide department-specific dashboards with real-time KPIs
- Store and surface historical data for trend analysis and performance reviews
- Deliver a Zoho CRM–grade user experience with clean navigation, consistent design language, and mobile responsiveness

### 3.2 Success Metrics

| Metric | Target |
|---|---|
| Time to update daily brokerage (admin) | < 5 minutes (down from ~30 min manual) |
| Task assignment to acknowledgment cycle | < 2 minutes |
| Overdue task visibility | 100% (auto-flagged, no manual checking) |
| Monthly report generation | 1-click, < 3 seconds |
| System adoption rate (all 3 departments) | 100% within 30 days of launch |

---

## 4. User Roles & Permissions

The system defines five distinct roles, each with specific access levels and landing experiences.

### 4.1 Role Matrix

| Role | Description | Access Scope |
|---|---|---|
| **Super Admin** | System owner / Director-level | Full access to all modules, all departments, user management, system settings, master data, audit logs |
| **Admin** | Operations manager | Upload brokerage data, assign clients to operators, assign tasks, view all department dashboards, manage masters |
| **Equity Dealer** | Equity department operator | Own client list, update traded/not-traded status, view own brokerage dashboard, receive tasks, view own reports |
| **Mutual Fund Dealer** | MF department operator | Own client list, update client engagement status, view own dashboard, receive tasks, view own reports |
| **Back-Office Employee** | Support/operations staff | View and complete assigned tasks, view own task dashboard, view own reports |

### 4.2 Authentication & Session

- Email + password login with bcrypt hashing
- Role-based routing: upon login, redirect to department-specific landing page
- Session timeout after 30 minutes of inactivity
- Password reset via email OTP
- **Enhancement (beyond client spec):** Optional two-factor authentication (TOTP-based) for Admin and Super Admin roles

---

## 5. Information Architecture & Navigation

The application follows a Zoho CRM–inspired layout: a persistent **left sidebar** for primary navigation, a **top bar** for user profile, notifications, and global search, and a **main content area** that changes based on the selected module.

### 5.1 Global Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo: FinanceCRM]                    🔍 Search  🔔  👤    │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  SIDEBAR   │            MAIN CONTENT AREA                    │
│            │                                                 │
│  Dashboard │   ┌─────────────────────────────────────────┐   │
│  Clients   │   │  Page Header + Breadcrumbs              │   │
│  Tasks     │   ├─────────────────────────────────────────┤   │
│  Reports   │   │                                         │   │
│  Masters   │   │  KPI Cards / Data Tables / Forms        │   │
│  Settings  │   │                                         │   │
│            │   │                                         │   │
│            │   └─────────────────────────────────────────┘   │
│            │                                                 │
├────────────┤                                                 │
│ 👤 User    │                                                 │
│ Sign Out   │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```

### 5.2 Sidebar Navigation by Role

| Sidebar Item | Super Admin | Admin | Equity Dealer | MF Dealer | Back-Office |
|---|---|---|---|---|---|
| Dashboard | ✅ (Global) | ✅ (Global) | ✅ (Equity) | ✅ (MF) | ✅ (Task-based) |
| My Clients | — | — | ✅ | ✅ | — |
| All Clients | ✅ | ✅ | — | — | — |
| Brokerage | ✅ | ✅ (Upload) | ✅ (View Own) | — | — |
| Tasks | ✅ | ✅ (Assign) | ✅ (View Own) | ✅ (View Own) | ✅ (Primary) |
| Task Assignment | ✅ | ✅ | ✅ | ✅ | — |
| Reports | ✅ | ✅ | ✅ (Own) | ✅ (Own) | ✅ (Own) |
| Masters | ✅ | ✅ | — | — | — |
| User Management | ✅ | — | — | — | — |
| Settings | ✅ | ✅ | ✅ (Profile) | ✅ (Profile) | ✅ (Profile) |

---

## 6. Module Specifications

---

### 6.1 MODULE: Admin Dashboard (Global Overview)

**Accessible to:** Super Admin, Admin

This is the command center — a Zoho CRM–style overview page that gives leadership a real-time snapshot of the entire business.

#### 6.1.1 KPI Cards Row (Top)

| Card | Data Source | Display |
|---|---|---|
| Total Employees | Employee Master | Count by department with mini donut chart |
| Total Clients | Client Master | Total count + breakdown by Equity / MF |
| Monthly Brokerage | Brokerage Module | Current month total (₹) with % change from last month |
| Traded Clients (%) | Client Status | Percentage of traded clients across all operators |
| Pending Tasks | Task Module | Count of all pending tasks across departments |
| Overdue Tasks | Task Module | Count of expired/overdue tasks (highlighted in red) |

#### 6.1.2 Charts Section

**Brokerage Trend Chart** — Stacked horizontal bar chart showing monthly brokerage per operator (reference: client's Equity All Stats chart). X-axis = brokerage amount, Y-axis = operator names, color-coded by month.

**Operator Performance Table** — Live data table mirroring the client's reference spreadsheet:

| Column | Description |
|---|---|
| Operator | Name of equity dealer |
| No. of Clients | Total clients assigned |
| Successfully Traded | Count of clients with status = Traded |
| Not Traded | Total − Traded |
| Successfully Traded (%) | (Traded / Total) × 100 |
| Traded Amount in % | Operator brokerage / Total company brokerage × 100 |
| Did Not Answer | Count of clients with remark = "Did not answer" |
| Total in Month | Cumulative brokerage for current month |
| Daily Brokerage Columns | One column per working day (1st to 31st) |

**Department Task Summary** — Pie chart breaking down pending/completed/expired tasks across Equity, MF, and Back-Office.

#### 6.1.3 Quick Actions Panel

- **Upload Brokerage** — One-click shortcut to the brokerage upload flow
- **Assign Task** — Opens the task assignment modal
- **Add New Client** — Opens the client registration form
- **Generate Report** — Shortcut to the report builder

---

### 6.2 MODULE: Equity Department

**Accessible to:** Equity Dealers (own data), Admin/Super Admin (all data)

#### 6.2.1 Equity Dealer Dashboard

When an Equity Dealer logs in, they see a personalized dashboard:

**Welcome Banner** — "Welcome, {Employee Name}" with designation, current date (auto-populated), and a motivational KPI summary.

**KPI Cards:**

| Card | Color Accent | Data |
|---|---|---|
| Total Clients | Blue | Count of clients assigned to this operator |
| Traded Clients | Green | Count with status = "Traded" |
| Not Traded | Red/Orange | Total − Traded |
| My Brokerage (MTD) | Purple | Month-to-date brokerage for this operator |
| Pending Tasks | Yellow | Tasks assigned to this operator that are pending |
| Completed Tasks | Green | Tasks completed this month |

**My Tasks Preview** — A compact list showing the 5 most recent tasks with status badges (Completed / Pending / Expired). Clickable "View All" redirects to the full Tasks page.

**Daily Brokerage Mini-Chart** — A small sparkline or bar chart showing the operator's daily brokerage for the current month.

#### 6.2.2 My Clients (Traded / Not-Traded Management)

This is the core operational screen for Equity Dealers. It displays all clients assigned to the logged-in operator.

**Table Columns:**

| Column | Type | Notes |
|---|---|---|
| Client Code | Text (read-only) | Formats: `18K099`, `91383117`, `18KS008` |
| Client Name | Text (read-only) | Full name (First + Middle + Last) |
| Client Contact | Phone number | Clickable to initiate call (mobile) |
| Product Type | Dropdown (read-only) | Equity / MF — set at client creation |
| Status | Dropdown | **Traded** / **Not Traded** (default: Not Traded) |
| Remarks | Dropdown | Successfully Traded, Not Traded, No Funds for Trading, Did Not Answer, Self Trading (default: Did Not Answer) |
| Next Follow-up On | Date picker | Optional — dealer sets next follow-up date |
| Notes | Text box | Free-text notes field for additional context |

**Filtering & Search:**

- Search bar: search by client code, name, or phone number
- Status filter dropdown: All / Traded / Not Traded
- Remark filter dropdown: All / Successfully Traded / Not Traded / No Funds / Did Not Answer / Self Trading
- Combined filtering: both filters work simultaneously

**Business Rules:**

- Default status for all clients at month start: **Not Traded**
- Default remark: **Did Not Answer**
- When status changes to "Traded", remark auto-suggests "Successfully Traded" (but can be overridden)
- Operators can only see and edit their own client list — never another operator's clients
- Monthly auto-reset: On the 1st of every month at 00:00, all client statuses reset to "Not Traded" and remarks reset to "Did Not Answer"
- Historical data is preserved in the reporting tables before reset

**Enhancement (beyond client spec):**

- **Bulk Status Update:** Select multiple clients via checkboxes and update status/remark in one action
- **Export to CSV:** Operators can export their client list as a CSV for offline reference
- **Color-coded rows:** Traded clients get a subtle green background, Not Traded stays white, "No Funds" gets a light yellow background for quick visual scanning
- **Follow-up Reminders:** If a "Next Follow-up On" date is set, the system shows a notification bell reminder on that date

#### 6.2.3 Brokerage Management

**Admin/Super Admin View — Brokerage Upload & Dashboard**

This module replaces the client's manual Excel-based brokerage mapping process.

**Upload Flow:**

1. Admin downloads the daily brokerage report (CSV/Excel) from SNAP (Ventura's ERP). This happens outside the CRM.
2. Admin clicks "Upload Brokerage" in the CRM.
3. System presents a file upload dialog (accepts `.csv`, `.xlsx`, `.xls`).
4. Admin selects the date for which brokerage is being uploaded.
5. System parses the file. Expected columns: **Client Code**, **Brokerage Amount**.
6. **Duplicate Handling (Cleaning):** If a client code appears multiple times (multiple trades in a day), the system automatically sums the brokerage amounts. Example: Client A1 appears 3 times with ₹10, ₹20, ₹25 → system records ₹55 for A1.
7. **Mapping:** Using the Client Master (which maps Client Code → Operator), the system allocates each client's brokerage to the correct operator.
8. System shows a preview: operator-wise aggregated brokerage for that date.
9. Admin confirms upload → data is committed.
10. If brokerage for that date was already uploaded, system warns: "Brokerage for {date} already exists. Overwrite?" with confirm/cancel.

**Brokerage Dashboard (Main View):**

A full-width data table mirroring the client's reference spreadsheet:

| Column | Description |
|---|---|
| Operator Name | Name of equity dealer |
| No. of Clients | Total clients assigned (from Client Master) |
| Successfully Traded | Count of clients with Traded status |
| Not Traded | Total − Traded |
| Successfully Traded (%) | Percentage |
| Traded Amount in % | Operator's share of total company brokerage |
| Did Not Answer | Count with this remark |
| Total in Month (₹) | Cumulative monthly brokerage |
| Day 1, Day 2, ... Day 31 | Individual daily brokerage amounts |

**Footer Row:** Company-wide totals for all numeric columns.

**Visual Chart:** Stacked horizontal bar chart (as per client reference) — operator names on Y-axis, brokerage values on X-axis, color-coded by month.

**Monthly Reset:** On the 1st of each month, brokerage counters reset to 0 for all operators. Previous month's data is archived and accessible via Reports.

**Equity Dealer View — My Brokerage:**

- Read-only view of their own brokerage data
- Shows daily brokerage for the current month in a table
- Monthly total prominently displayed
- Month-over-month comparison chart

---

### 6.3 MODULE: Mutual Fund Department

**Accessible to:** MF Dealers (own data), Admin/Super Admin (all data)

#### 6.3.1 MF Dealer Dashboard

Similar structure to the Equity Dealer dashboard, adapted for MF-specific KPIs:

**KPI Cards:**

| Card | Data |
|---|---|
| Total Clients | Clients assigned to this MF dealer |
| Active Clients | Clients with recent activity / engagement |
| Inactive Clients | Clients with no activity in current month |
| Pending Tasks | Task count |
| Completed Tasks | Task count |

#### 6.3.2 My Clients (MF)

Table view of all clients assigned to the MF dealer:

| Column | Type |
|---|---|
| Client Code | Text (read-only) |
| Client Name | Text (read-only) |
| Client Contact | Phone number |
| Operator Name | Text (read-only — self) |
| Status | Dropdown: Active / Inactive |
| Remark | Dropdown: Investment Done, Interested, Not Interested, Did Not Answer, Follow-up Required |
| Notes | Text box |

**Enhancement (beyond client spec):**
- **SIP Tracker:** A sub-table per client to log SIP (Systematic Investment Plan) registrations and renewals
- **AUM Tracking:** If data is available, display Assets Under Management per client

#### 6.3.3 MF Reports

Monthly engagement metrics, client conversion rates, and trend charts — stored historically for performance reviews.

---

### 6.4 MODULE: Back-Office Department

**Accessible to:** Back-Office Employees (own data), Admin/Super Admin (all data)

The Back-Office module is fundamentally different from Equity and MF because performance is measured entirely by **task completion** rather than brokerage or client trading.

#### 6.4.1 Back-Office Dashboard

**Welcome Banner:** Employee name, designation ("Back Office"), current day and date (auto-populated).

**KPI Cards:**

| Card | View Button | Description |
|---|---|---|
| Tasks Pending | ✅ (links to pending tasks filter) | Count of incomplete tasks |
| Tasks Completed | ✅ (links to completed tasks filter) | Count of completed tasks this month |

Each card includes a **"View" button** — clicking it navigates to the Tasks section with the corresponding filter pre-applied (Pending-only or Completed-only).

**My Tasks Section (on Dashboard):**

- Dropdown filter: **Day / Week / Month** — filters to show only **pending** tasks for the selected time period
- Task cards displayed in a list format (matching client reference UI):
  - Left color accent bar (orange = pending, green = completed, red = expired)
  - Task title (bold)
  - Task description (grey subtitle)
  - Status badge: PENDING / COMPLETED / EXPIRED

**Monthly Reset:** Dashboard counters reset on the 1st of each month. Historical data is preserved in Reports.

#### 6.4.2 Back-Office Sidebar Navigation

The sidebar for Back-Office employees contains exactly three items (per client spec):

1. **Dashboard** — As described above
2. **Tasks** — Full task management view
3. **Reports** — Historical performance data

#### 6.4.3 Tasks Section (Full View)

**Tab Bar:** Two main tabs at the top — **Pending** | **Completed**

**Filter Dropdowns (below tabs):**

| Filter | Options |
|---|---|
| Status | Pending / Completed (linked to tab selection) |
| Department | Admin / Equity / Mutual Fund (filters by assignee's department) |

Both filters work in combination: selecting "Pending" + "Equity" shows only pending tasks assigned by the Equity department.

**Task List Table Columns:**

| Column | Description |
|---|---|
| Task Title | Brief summary of the task |
| Assignee Name | Who assigned the task |
| Assignee Department | Equity / Admin / MF |
| Date Assigned | Auto-captured at task creation |
| Deadline | Due date set by assigner |
| Days to Expiry | Calculated: Deadline − Today (negative if expired) |
| Status | Pending / Completed / Expired |

**Show All Tasks:** The section displays ALL tasks — pending, completed, and expired — with clear visual differentiation.

**Task Row Click → Task Detail View:**

Clicking any task row opens a detail panel (slide-over or modal):

| Field | Display |
|---|---|
| Task Title | Full task description |
| Assigned By | Name and department of the assigner |
| Date Assigned | Creation date |
| Deadline | Due date |
| Days to Expiry | Countdown (or "Expired by X days") |
| Task Description | Full text of the task |

**Complete Task Button:**

- Visible only if the task is still **Pending** and **not expired**
- On click → **Warning Pop-up:** "⚠️ This action cannot be reversed. Once marked as complete, the task status is permanent. Are you sure?" with **Submit** and **Cancel** buttons
- On Submit → task status changes to "Completed", timestamp recorded

**Auto-Expiry Rule (Critical Business Logic):**

> If a task's deadline has passed (current date > deadline), the system automatically marks it as **Expired**. An expired task remains permanently in the Pending/Expired state — the employee **cannot** change its status to Completed. This is a hard rule enforced server-side.

**Enhancement (beyond client spec):**
- **Task Priority Levels:** High / Medium / Low — set by the assigner, displayed as color-coded badges
- **Task Comments Thread:** Allow the assignee to add comments/updates without marking complete (useful for tasks that need multiple steps)
- **Notification System:** In-app notification when a new task is assigned, and a reminder 24 hours before deadline

#### 6.4.4 Back-Office Reports

**Report View:**

Displays historical monthly performance data with the following structure:

**Summary Cards:**
- Total Tasks Completed (all-time or selected range)
- Total Tasks Pending/Expired (all-time or selected range)
- Completion Rate (%) = Completed / Total × 100

**Monthly Breakdown Table:**

| Month | Tasks Received | Completed | Pending/Expired | Completion Rate |
|---|---|---|---|---|
| January 2026 | 45 | 38 | 7 | 84.4% |
| February 2026 | 32 | 28 | 4 | 87.5% |
| **Total** | **77** | **66** | **11** | **85.7%** |

**Chart:** Bar chart showing completed vs. pending tasks per month, providing the "bird's-eye view" the client requested.

**Enhancement (beyond client spec):**
- **Department-wise Breakdown:** Filter reports by assigning department (Equity / Admin / MF)
- **Export to PDF/Excel:** One-click report download
- **Average Resolution Time:** Track how quickly tasks are completed relative to their deadline

---

### 6.5 MODULE: Task Assignment (Cross-Department)

**Accessible to:** Super Admin, Admin, Equity Dealers, MF Dealers

This module allows authorized users to create and assign tasks to any employee in any department — primarily used for assigning work to Back-Office employees, but flexible enough for inter-departmental task routing.

#### 6.5.1 Task Assignment Form

The form opens as a modal or dedicated page:

| Field | Type | Behavior |
|---|---|---|
| **Assignee Department** | Dropdown | Options: Equity, Mutual Fund, Back-Office, Admin. Selection populates the "Assign To" name dropdown. |
| **Assignee Name** | Dropdown (dynamic) | Shows only employees belonging to the selected department. Populated from Employee Master. |
| **Assigned By (Name)** | Auto-filled | Logged-in user's name (read-only) |
| **Assigned By (Department)** | Auto-filled | Logged-in user's department (read-only) |
| **Task Title** | Text input | Brief summary (max 100 characters) |
| **Task Description** | Text area | Full task details (rich text — supports bold, bullets, links) |
| **Start Date** | Auto-filled | Current date and time (read-only) |
| **Deadline** | Date picker | Must be ≥ today. Validation: cannot set deadline in the past. |
| **Priority** | Dropdown | High / Medium / Low (Enhancement) |
| **Assign Button** | Submit | Validates all fields, creates the task, sends notification to assignee |

**Validation Rules:**
- All fields except Priority are mandatory
- Deadline must be a future date or today
- Task description must be at least 10 characters
- If department or employee dropdown is empty (no employees in that department), show an informative message

**Post-Assignment:**
- Task appears immediately in the assignee's task list / dashboard
- In-app notification sent to the assignee
- Assignment logged with timestamp for audit purposes

#### 6.5.2 My Assigned Tasks (Assigner's View)

A section under Tasks where the assigner can see all tasks they have assigned to others:

| Column | Description |
|---|---|
| Task Title | Summary |
| Assigned To | Employee name + department |
| Date Assigned | Creation date |
| Deadline | Due date |
| Status | Pending / Completed / Expired |

This gives managers visibility into whether their assigned tasks are being completed on time.

---

### 6.6 MODULE: Masters Management

**Accessible to:** Super Admin, Admin

#### 6.6.1 Employee Master

Central registry of all system users.

**Fields:**

| Field | Type | Validation |
|---|---|---|
| Full Name | Text | Required |
| Phone Number | Text | 10-digit Indian mobile number |
| Email | Email | Valid email format, unique in system |
| Department | Dropdown | Equity, Mutual Fund, Back-Office, Admin |
| Designation | Text | e.g., Director, Equity Dealer, MF Dealer, Back Office |
| Status | Toggle | Active / Inactive |
| Date Added | Auto | System timestamp |

**Pre-loaded Data (from client CSVs):**

**Equity Department:**
- Kedar Dattatraya Oak — Director
- Sarvesh Kedar Oak — Director
- Reshma Manoj Verunkar — Equity Dealer
- Karan Ganesh Patil — Equity Dealer
- Vinit Vijay Gollar — Equity Dealer
- Shweta Arvind Pethe — Equity Dealer
- Kedar Niranjan Mulye — Equity Dealer

**Mutual Fund Department:**
- Gayatri Ganesh Ghadi — Mutual Fund Dealer
- Rishita Rajesh Tawde — Mutual Fund Dealer

**Back-Office Department:**
- Akshita Raju Ramugade — Back Office
- Vishakha Narayan Kulkarni — Back Office
- Pradip Vinayak Mahadik — Back Office
- Adesh Datta Mhatre — Back Office
- Rutvik Pravin Sovilkar — Back Office

**CRUD Operations:** Add, Edit, Deactivate (soft delete), Search, Filter by department.

#### 6.6.2 Client Master

Central registry of all clients mapped to their operators.

**Client Registration Form:**

| Field | Type | Validation |
|---|---|---|
| Client Code | Text | **Must match one of three formats** (see below) |
| First Name | Text | Required |
| Middle Name | Text | Optional |
| Last Name | Text | Required |
| Phone Number | Text | 10-digit Indian mobile number |
| Department | Dropdown | Equity / Mutual Fund — selection filters the Operator dropdown |
| Assigned Operator | Dropdown (dynamic) | Shows only employees from the selected department |
| Status | Auto | Default: "Not Traded" (Equity) / "Inactive" (MF) |
| Remark | Auto | Default: "Did Not Answer" |
| Date Added | Auto | System timestamp |

**Client Code Validation (Critical):**

The system must validate client codes against exactly three permitted formats. If the code does not match any format, a pop-up error is displayed: **"Invalid client code format. Please use one of the accepted formats: 18K099, 91383117, or 18KS008."**

| Format | Pattern | Example | Description |
|---|---|---|---|
| Format A | `{2-digit branch}{1 letter}{3-digit serial}` | `18K099` | Pune / Mumbai branch |
| Format B | `{8-digit number}` | `91383117` | Pune / Mumbai branch |
| Format C | `{2-digit branch}{1-5 letters}{3-digit serial}` | `18KS008` | Karad / Pune branch (branch code + location + initial + serial) |

**Regex Patterns:**
- Format A: `^\d{2}[A-Z]\d{3}$`
- Format B: `^\d{8}$`
- Format C: `^\d{2}[A-Z]{1,5}\d{3}$`

**Client-Operator Assignment Rule:** Once a client is assigned to an operator, that client appears **only** in that operator's "My Clients" list. Clients are never visible to other operators of the same level.

**Enhancement (beyond client spec):**
- **Bulk Client Import:** Upload a CSV of clients with columns: Client Code, First Name, Middle Name, Last Name, Phone, Department, Operator — system validates all codes and maps accordingly
- **Client Transfer:** Admin can reassign a client from one operator to another, with an audit trail
- **Client Search (Global):** Admin can search across all clients regardless of operator assignment

---

### 6.7 MODULE: Notifications & Activity Feed

**Enhancement (beyond client spec — inspired by Zoho CRM)**

#### 6.7.1 Notification Bell (Top Bar)

A notification icon in the top-right corner with an unread count badge. Notifications are generated for:

| Event | Recipient |
|---|---|
| New task assigned | Assignee |
| Task deadline in 24 hours | Assignee |
| Task expired | Assignee + Assigner |
| Task completed | Assigner |
| Brokerage data uploaded for the day | All Equity Dealers |
| New client assigned | Operator |
| Monthly reset completed | All users |

#### 6.7.2 Activity Log (Admin)

An audit trail visible to Super Admin and Admin:

| Column | Description |
|---|---|
| Timestamp | Date and time of the action |
| User | Who performed the action |
| Action | What was done (e.g., "Marked task #142 as Completed") |
| Module | Which module (Tasks, Clients, Brokerage, etc.) |
| Details | Additional context |

---

### 6.8 MODULE: Reports & Analytics

**Accessible to:** All roles (scoped to own data for non-admin roles)

#### 6.8.1 Equity Reports

**Monthly Brokerage Report:**
- Table: Operator × Month matrix showing brokerage amounts
- Chart: Stacked bar chart (per client reference)
- Filters: Date range, Operator, Branch
- Export: PDF, Excel

**Client Engagement Report:**
- Traded vs. Not Traded ratios per operator per month
- Trend lines showing improvement or decline
- Top-performing operators ranked by traded %

**Daily Brokerage Drill-Down:**
- Select any past date → view that day's brokerage per operator
- Compare two dates side by side

#### 6.8.2 Back-Office Reports

**Task Completion Report:**
- Monthly summary: tasks received, completed, expired
- Completion rate trend over time
- Department-wise breakdown (tasks from Equity vs. Admin vs. MF)
- Individual employee performance comparison (Admin view)

#### 6.8.3 MF Reports

**Client Engagement Report:**
- Active vs. Inactive client ratios
- Follow-up completion rates
- Monthly activity trends

#### 6.8.4 Enhancement: Scheduled Reports

- Admin can schedule weekly or monthly reports to be auto-generated and emailed
- Pre-built report templates for common needs
- Custom date-range selection for ad-hoc reports

---

## 7. Data Architecture

### 7.1 Core Entities (Database Schema Overview — MySQL 8.0+)

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    employees      │     │     clients       │     │     tasks        │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ id (PK)          │     │ id (PK)          │     │ id (PK)          │
│ name             │◄────│ operator_id (FK)  │     │ title            │
│ email (unique)   │     │ client_code       │     │ description      │
│ phone            │     │ first_name        │     │ assigned_to (FK) │
│ password_hash    │     │ middle_name       │     │ assigned_by (FK) │
│ department       │     │ last_name         │     │ start_date       │
│ designation      │     │ phone             │     │ deadline         │
│ role             │     │ department        │     │ status           │
│ status           │     │ status            │     │ priority         │
│ created_at       │     │ remark            │     │ completed_at     │
│ updated_at       │     │ notes             │     │ created_at       │
└──────────────────┘     │ follow_up_date    │     │ updated_at       │
                         │ created_at        │     └──────────────────┘
                         │ updated_at        │
                         └──────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   brokerage      │     │ brokerage_details │     │ monthly_archives │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ id (PK)          │     │ id (PK)          │     │ id (PK)          │
│ upload_date      │     │ brokerage_id (FK)│     │ month            │
│ uploaded_by (FK) │     │ client_code      │     │ year             │
│ total_amount     │     │ operator_id (FK) │     │ entity_type      │
│ created_at       │     │ amount           │     │ entity_id        │
└──────────────────┘     │ created_at       │     │ data_json        │
                         └──────────────────┘     │ created_at       │
                                                  └──────────────────┘

┌──────────────────┐     ┌──────────────────┐
│  notifications   │     │  activity_log    │
├──────────────────┤     ├──────────────────┤
│ id (PK)          │     │ id (PK)          │
│ user_id (FK)     │     │ user_id (FK)     │
│ type             │     │ action           │
│ title            │     │ module           │
│ message          │     │ details          │
│ is_read          │     │ ip_address       │
│ created_at       │     │ created_at       │
└──────────────────┘     └──────────────────┘
```

### 7.2 Monthly Reset Strategy

A critical requirement is that several modules reset on the 1st of each month while preserving historical data.

**Approach: Archive-then-Reset**

1. **Scheduled Job** runs at 00:00 on the 1st of each month.
2. **Archive Phase:** Current month's data (client statuses, brokerage totals, task summaries) is snapshot into the `monthly_archives` table as JSON.
3. **Reset Phase:**
   - All client statuses → "Not Traded" / "Inactive"
   - All client remarks → "Did Not Answer"
   - Brokerage daily counters → 0
   - Task dashboard counters → 0 (but tasks themselves are retained in the task table with their original statuses for historical reference)
4. **Confirmation:** A system notification is sent to all admins confirming the monthly reset completed successfully.

---

## 8. UI/UX Design System

### 8.1 Design Philosophy

The interface is modeled after Zoho CRM's design language: clean, professional, with ample white space, card-based layouts, and a left-aligned dark sidebar. The goal is a tool that feels enterprise-grade but remains approachable for users with varying technical skills.

### 8.2 Color System

| Token | Hex | Usage |
|---|---|---|
| Primary | `#1B73E8` | Buttons, links, active sidebar item |
| Primary Dark | `#0D47A1` | Sidebar background |
| Success | `#2E7D32` | Completed status, traded clients, positive KPIs |
| Warning | `#F9A825` | Pending status, approaching deadlines |
| Danger | `#D32F2F` | Expired tasks, overdue items, errors |
| Neutral 100 | `#F5F5F5` | Page background |
| Neutral 200 | `#E0E0E0` | Card borders, dividers |
| Neutral 800 | `#424242` | Primary text |
| White | `#FFFFFF` | Card backgrounds, input fields |

### 8.3 Typography

| Element | Font | Size | Weight |
|---|---|---|---|
| Page Title | Inter | 24px | 700 (Bold) |
| Section Header | Inter | 18px | 600 (Semi-bold) |
| Card Title | Inter | 14px | 600 |
| Body Text | Inter | 14px | 400 |
| Table Header | Inter | 13px | 600 |
| Table Cell | Inter | 13px | 400 |
| Caption/Meta | Inter | 12px | 400 |

### 8.4 Component Library

| Component | Description |
|---|---|
| **KPI Card** | Rounded rectangle with subtle shadow, icon top-right, large number, label below, optional "View" button |
| **Data Table** | Zoho-style sortable, filterable table with alternating row colors, sticky header, pagination |
| **Status Badge** | Pill-shaped badge — green (Completed), yellow (Pending), red (Expired), blue (In Progress) |
| **Sidebar Item** | Icon + label, active state with left blue accent bar and lighter background |
| **Modal/Dialog** | Centered overlay with title, body, and action buttons — used for task details, confirmations |
| **Toast Notification** | Bottom-right slide-up notification for success/error messages |
| **Dropdown** | Consistent dropdown style with search functionality for long lists |
| **Date Picker** | Calendar-style picker with month/year navigation |
| **File Upload** | Drag-and-drop zone with file type indicators and upload progress |

### 8.5 Responsive Behavior

| Breakpoint | Layout Adaptation |
|---|---|
| ≥ 1280px (Desktop) | Full sidebar + main content |
| 768px–1279px (Tablet) | Collapsed sidebar (icons only) + full main content |
| < 768px (Mobile) | Hamburger menu for sidebar, stacked KPI cards, responsive tables with horizontal scroll |

---

## 9. Business Rules Summary

| # | Rule | Enforcement |
|---|---|---|
| BR-01 | Monthly reset of client statuses, brokerage counters, and dashboard KPIs on the 1st of each month | Server-side cron job |
| BR-02 | Expired tasks (deadline passed) cannot be marked as completed by the employee | Server-side validation |
| BR-03 | Client code must match one of three approved formats | Client-side + server-side regex validation |
| BR-04 | Operators can only view their own assigned clients | Row-level security filter on API queries |
| BR-05 | Brokerage upload deduplicates client codes by summing amounts | Server-side aggregation during upload parsing |
| BR-06 | Task completion is irreversible — once marked complete, it cannot be undone | Server-side state machine (no backward transitions) |
| BR-07 | Department dropdown in Task Assignment dynamically filters Employee dropdown | Client-side cascading dropdown |
| BR-08 | Dashboard counters for Back-Office reset monthly but Reports retain historical data | Archive-then-reset strategy |
| BR-09 | Newly assigned clients default to "Not Traded" status and "Did Not Answer" remark | Database default values |
| BR-10 | Back-Office employees cannot assign tasks — they can only receive and complete them | Role-based permission check |

---

## 10. Non-Functional Requirements

### 10.1 Performance

| Metric | Target |
|---|---|
| Page load time (dashboard) | < 2 seconds |
| API response time (95th percentile) | < 500ms |
| Brokerage file upload processing (1000 rows) | < 10 seconds |
| Concurrent users supported | 50+ |
| Database query optimization | Indexed on client_code, operator_id, department, status (MySQL InnoDB) |

### 10.2 Security

- All data transmitted over HTTPS (TLS 1.3)
- Passwords hashed with bcrypt (minimum 12 rounds)
- Role-based access control (RBAC) enforced at API layer
- SQL injection prevention via parameterized queries / ORM
- XSS prevention via input sanitization and output encoding
- CSRF tokens on all state-changing requests
- Rate limiting on login endpoint (5 attempts per minute)
- Audit logging for all sensitive operations

### 10.3 Availability & Backup

| Aspect | Requirement |
|---|---|
| Uptime target | 99.5% (excluding planned maintenance) |
| Database backups | Daily automated backups with 30-day retention |
| Disaster recovery | Restore from backup within 4 hours |
| Maintenance window | Sundays 02:00–04:00 IST |

### 10.4 Browser Support

| Browser | Minimum Version |
|---|---|
| Google Chrome | 100+ |
| Mozilla Firefox | 100+ |
| Microsoft Edge | 100+ |
| Safari | 15+ |
| Mobile Chrome (Android) | Latest 2 versions |
| Mobile Safari (iOS) | Latest 2 versions |

---

## 11. Recommended Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React.js 18+ with Next.js 14 | Component-based UI, SSR for fast loads, Zoho-like SPA feel |
| **UI Library** | Tailwind CSS + shadcn/ui | Rapid, consistent styling matching Zoho's clean aesthetic |
| **State Management** | Zustand or React Context | Lightweight, sufficient for role-based state |
| **Charts** | Recharts or Chart.js | Rich charting for brokerage and performance dashboards |
| **Backend** | Node.js with Express.js or Next.js API Routes | JavaScript full-stack, fast development cycle |
| **Database** | MySQL 8.0+ (Hostinger shared/cloud hosting) | Relational integrity for financial data, JSON column support, Hostinger-native |
| **ORM** | Prisma | Type-safe database queries, easy migrations, MySQL connector |
| **Authentication** | NextAuth.js or custom JWT | Role-based auth with session management |
| **File Processing** | SheetJS (xlsx) or Papaparse (csv) | Parse brokerage uploads on the server |
| **Job Scheduler** | node-cron or MySQL EVENT Scheduler | Monthly reset jobs, deadline expiry checks |
| **Hosting** | Hostinger (VPS or Cloud Hosting) | MySQL-native, cost-effective, Node.js support via VPS/Cloud plans |
| **Notifications** | In-app (WebSocket or polling) + Email (Nodemailer/Resend) | Real-time task notifications |

> **Hosting Note — Hostinger:** The production environment will use Hostinger's MySQL 8.0 database. Deployment options: (a) Hostinger VPS/Cloud with Node.js runtime for the full stack, or (b) Next.js deployed on Vercel with Hostinger MySQL accessed via Remote MySQL. All Prisma schema definitions use `mysql` provider. Long text fields use `@db.Text` column type. Connection pooling is configured with `connection_limit=10` to stay within Hostinger's concurrency limits.

---

## 12. Phased Delivery Plan

### Phase 1 — Foundation (Weeks 1–3)

| Deliverable | Details |
|---|---|
| Project setup | Repository, CI/CD, database schema, seed data from employee CSVs |
| Authentication | Login, role-based routing, session management |
| Employee Master | CRUD for employees, pre-loaded with client's data |
| Global layout | Sidebar, top bar, responsive shell |
| Admin Dashboard | Basic KPI cards (placeholder data) |

### Phase 2 — Equity Module (Weeks 4–6)

| Deliverable | Details |
|---|---|
| Client Master | Client registration with code validation, operator assignment |
| My Clients (Equity) | Traded/Not-Traded management, filters, search |
| Brokerage Upload | File upload, parsing, deduplication, operator mapping |
| Brokerage Dashboard | Full operator table with daily columns, totals, charts |
| Equity Dealer Dashboard | Personalized KPIs, mini-charts |

### Phase 3 — Task Management & Back-Office (Weeks 7–9)

| Deliverable | Details |
|---|---|
| Task Assignment | Cross-department form with cascading dropdowns |
| Back-Office Dashboard | Task KPI cards with View buttons, day/week/month filter |
| Tasks Section | Pending/Completed tabs, department filter, task detail view |
| Task Completion Flow | Warning pop-up, irreversible completion, auto-expiry |
| Notifications | In-app notification system |

### Phase 4 — MF Module & Reports (Weeks 10–11)

| Deliverable | Details |
|---|---|
| MF Dealer Dashboard | KPIs, client list |
| MF Client Management | Status tracking, remarks |
| Reports Module | Brokerage reports, task reports, charts, export |
| Monthly Reset | Cron job for archive-then-reset |

### Phase 5 — Polish & Launch (Week 12)

| Deliverable | Details |
|---|---|
| UAT | User acceptance testing with client team |
| Bug fixes | Address all UAT feedback |
| Performance tuning | Optimize queries, caching, lazy loading |
| Documentation | User guide, admin manual |
| Deployment | Production deployment, DNS setup, SSL |
| Training | 2-hour training session for all departments |

---

## 13. Enhancements Beyond Client Requirements

These are additional features inspired by Zoho CRM that add significant value and differentiate the product:

| # | Enhancement | Value |
|---|---|---|
| 1 | **Global Search** | Zoho-style universal search bar — search clients, tasks, employees from anywhere |
| 2 | **Bulk Operations** | Multi-select clients for bulk status update, bulk task assignment |
| 3 | **Export Everywhere** | PDF and Excel export on every data table and report |
| 4 | **Follow-up Reminders** | Calendar-based reminder system for client follow-ups |
| 5 | **Task Comments** | Threaded comments on tasks for back-and-forth communication |
| 6 | **Task Priority** | High/Medium/Low priority levels with visual indicators |
| 7 | **Email Notifications** | Email alerts for critical events (task assigned, approaching deadline, expired) |
| 8 | **User Preferences** | Theme selection (light/dark), notification preferences |
| 9 | **Activity Feed** | Zoho-style activity timeline showing recent actions across the system |
| 10 | **Scheduled Reports** | Auto-generate and email weekly/monthly reports |
| 11 | **Mobile PWA** | Progressive Web App for mobile access without native app development |
| 12 | **Two-Factor Auth** | TOTP-based 2FA for Admin and Super Admin accounts |
| 13 | **Data Import Wizard** | Guided bulk import for clients, employees, and historical brokerage data |
| 14 | **Custom Dashboard Widgets** | Allow admins to rearrange dashboard cards and charts (drag-and-drop) |
| 15 | **Client Communication Log** | Record call notes, meeting summaries per client for full CRM capability |

---

## 14. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Brokerage file format varies from SNAP exports | Upload fails / incorrect mapping | Medium | Build a flexible parser with column mapping UI; support multiple delimiters |
| Client code formats expand beyond 3 patterns | Validation blocks legitimate codes | Low | Make validation rules configurable via admin settings |
| Users forget to update client status before month-end | Inaccurate monthly reports | High | Send reminder notifications 3 days and 1 day before month-end |
| Concurrent brokerage uploads for the same date | Data duplication / conflicts | Low | MySQL unique constraint on (upload_date + operator_id + client_code) |
| Resistance to new system from employees | Low adoption | Medium | Invest in training, keep UI simple, provide first-month parallel run with Excel |

---

## 15. Glossary

| Term | Definition |
|---|---|
| **Operator** | An Equity Dealer or MF Dealer who manages a portfolio of clients |
| **Brokerage** | Commission earned from client trades, measured in ₹ |
| **SNAP** | Ventura's ERP system from which daily brokerage data is exported |
| **Traded** | A client who has executed at least one trade in the current month |
| **Not Traded** | A client who has not executed any trade in the current month |
| **MTD** | Month-to-Date — cumulative value from the 1st of the month to today |
| **SIP** | Systematic Investment Plan — recurring mutual fund investment |
| **AUM** | Assets Under Management — total market value of investments managed |
| **DND** | Do Not Disturb — client has opted out of communications |
| **CDSL** | Central Depository Services Limited — depository for securities |

---

## 16. Approval & Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Product Owner | | | |
| Client Stakeholder | | | |
| Technical Lead | | | |
| Design Lead | | | |
| QA Lead | | | |

---

*This document is a living artifact and will be updated as requirements evolve through the development process. All changes will be versioned and communicated to stakeholders.*
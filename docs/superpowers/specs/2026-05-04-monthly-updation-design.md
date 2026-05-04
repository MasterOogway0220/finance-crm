# Monthly Updation — Design Spec
**Date:** 2026-05-04

## Overview

Add month/year filtering across all CRM pages and dashboards so users can analyse any historical period, not just the current month. Also fix client count and traded-status bugs on dashboards, and introduce a monthly reset of client traded status.

---

## 1. Month/Year Selectors

All pages and dashboards that display month-scoped data will gain month/year dropdowns stored as URL params (`?month=M&year=Y`), defaulting to the current month/year on first load.

The existing selector component (used on the brokerage page) is reused everywhere.

**Pages that need selectors added:**

| Page | Route |
|------|-------|
| Admin Dashboard | `/dashboard` |
| Equity Dashboard | `/equity/dashboard` |
| MF Dashboard | `/mf/dashboard` |
| MF Business Log | `/mf/business/log` |
| MF Service Log | `/mf/service/log` |
| Tasks (main, equity, MF, backoffice) | `/tasks`, `/equity/tasks`, `/mf/tasks`, `/backoffice/tasks` |
| Brokerage Upload Log (admin section) | `/brokerage` (upload log table) |

When the selector changes, the page re-fetches with the new params. No global context — each page is independent.

---

## 2. Traded / Not-Traded Calculation Logic

`Client.status` is a single persistent field and is not month-aware. Month-accurate counts are derived as follows:

- **Current month:** read `Client.status` directly (live, real-time)
- **Any past month:** derive from `BrokerageDetail` — a client counts as traded in month X if at least one brokerage record exists for them in month X

No schema changes required. `BrokerageDetail` records are the historical source of truth.

**Not-traded count** = total assigned clients for operator − traded clients for that month.

### Monthly Reset (Cron Job)

On the 1st of every month a server-side cron job resets all `Client.status` to `NOT_TRADED`, giving every operator a clean slate for the new month.

During the month, traded status is updated as follows:
- **Kedar sir and Sarvesh** (matched by name on the `Employee` table): their clients auto-flip to `TRADED` via the existing `isAutoTradeOperator()` mechanism when brokerage is uploaded
- **All other operators:** `Client.status` must be set manually — the dashboard bug fix (Section 3) ensures manual changes reflect immediately for the current month

The cron job endpoint: `POST /api/cron/monthly-reset` — protected by a secret header, callable by a scheduler (e.g., Vercel Cron, external cron service).

---

## 3. Dashboard Bug Fixes

### Bug A — New client not reflected in total client count until next day

**Root cause:** Dashboard API derives operator client counts from a stale source rather than querying the `Client` table directly.

**Fix:** `/api/dashboard/admin` and `/api/dashboard/equity` query `Client` table live for total client counts per operator. No caching.

### Bug B — Manual status change not reflected in dashboard traded count

**Root cause:** Dashboard traded count reads from the wrong source for the current month.

**Fix:** For the current month, traded counts read directly from `Client.status` (live query). For past months, derived from `BrokerageDetail` records as described in Section 2.

---

## 4. MF Business Log, Service Log & Tasks

### MF Business Log & Service Log

- `/api/mf-business` and `/api/mf-service` accept `month` and `year` query params
- Filter by `businessDate` / `serviceDate` falling within the selected month/year
- MF Dashboard KPI cards (Total Clients, Active, Inactive, Total Sales, Total Commission) respond to the month/year selector using the same date-range filter

### Tasks

- Task pages filter by `createdAt` month/year (not deadline)
- Dashboard task section (pie chart: PENDING / COMPLETED / EXPIRED) filters task counts by `createdAt` for the selected month
- APIs accept `month` and `year` params on all task list endpoints

### Brokerage Upload Log

- Upload log table on the brokerage page strictly follows the selected month/year — shows only uploads where `uploadDate` falls in the selected month

---

## 5. API Changes Summary

| Endpoint | Change |
|----------|--------|
| `/api/dashboard/admin` | Accept `month`, `year` params; fix client count and traded count source |
| `/api/dashboard/equity` | Accept `month`, `year` params; fix traded count source |
| `/api/dashboard/mf` | Accept `month`, `year` params; filter MF records by date |
| `/api/mf-business` | Confirm/extend `month`, `year` param support |
| `/api/mf-service` | Confirm/extend `month`, `year` param support |
| `/api/tasks` (all role variants) | Accept `month`, `year` params; filter by `createdAt` |
| `/api/brokerage/log` | Confirm strict month/year filter on upload log |
| `/api/cron/monthly-reset` | New endpoint — resets all `Client.status` to `NOT_TRADED` on 1st of month |

---

## 6. Out of Scope

- No global month/year context in the layout — each page manages its own selection
- No changes to how brokerage upload itself works
- No new archive/backup tables — existing `BrokerageDetail` records serve as historical data
- No changes to the `MonthlyArchive` model or archive tab behaviour

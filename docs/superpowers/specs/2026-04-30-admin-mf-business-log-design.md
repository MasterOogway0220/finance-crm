# Admin MF Business Log — Design Spec

**Date:** 2026-04-30
**Status:** Approved

## Overview

Add a "Business Log" tab to the existing Admin MF Business Report page (`/reports/mf-business`). Admins can view the raw individual deal entries that MF employees enter each month, filterable by month/year, employee, and grouping mode — with Excel export.

## Problem

The admin MF Business Report currently shows only aggregate charts (bar charts, pie chart). Admins have no way to inspect the underlying individual deal records. Employees see their own log at `/mf/business/log`; admins need the same visibility across all employees.

## Solution

### Page Structure

Convert `/reports/mf-business/page.tsx` to a tabbed layout:

- **Tab 1: Charts** — existing content unchanged (bar charts, pie chart, service-business split)
- **Tab 2: Business Log** — new raw deal log table

The existing month/year/range filter row at the top is shared across both tabs. Switching tabs does not reset the filter.

### Business Log Tab — UI

**Toolbar (below tab bar):**
- Employee filter dropdown: "All Employees" + list of all active MF & Equity employees (fetched from `/api/employees`)
- "Group by Employee" toggle button
- Export Excel button (right-aligned)

**Summary cards (same style as employee log):**
- Records count
- Total Sales (yearly contribution sum)
- Total Commission (commission amount sum)

**Flat mode (default):**
Table columns: Date | Employee | Client Code | Client Name | Referred By | Product | Type | SIP Amt | Yearly | Comm % | Comm Amt

**Grouped mode:**
- One collapsible section per employee (accordion style)
- Each section header shows: Employee name + record count + subtotal sales + subtotal commission
- Each section contains the same table (without the Employee column, since it's in the header)
- Sections default to expanded

**Employee filter behaviour:**
- Flat mode: filters rows to selected employee
- Grouped mode: hides all other employee sections

### API Changes

**`GET /api/mf-business`** — add optional `employeeId` query param:
- If provided, adds `employeeId` filter to the Prisma where clause (admin only)
- Existing role-based scoping for MF_DEALER and EQUITY_DEALER is unchanged

**`POST /api/reports/export`** — add new `type: 'mf-business-log'` case:
- Accepts: `month`, `year`, `range` (MONTH | FULL_YEAR), optional `employeeId`
- Fetches all matching `MFBusiness` records (admin-scoped)
- Returns Excel file with columns: Date, Employee, Client Code, Client Name, Referred By, Product, Sub-Product, Type, SIP Amount, Yearly Contribution, Commission %, Commission Amount

### Data Flow

```
Admin selects month/year/range
  → useEffect fires fetch to /api/mf-business?month=X&year=Y[&employeeId=Z]
  → Returns flat array of MFBusinessRecord (with employeeName, referredByName)
  → Client groups by employeeId if grouped mode is on
  → Summary cards computed client-side from returned array
```

No new database models or migrations required — `MFBusiness` records are already permanent.

### Export Flow

```
Admin clicks Export Excel
  → POST /api/reports/export { type: 'mf-business-log', month, year, range, employeeId? }
  → Server queries MFBusiness with same filters
  → Returns .xlsx blob
  → Client triggers download
```

## Files Changed

| File | Change |
|------|--------|
| `src/app/(protected)/reports/mf-business/page.tsx` | Add tab switcher; extract charts into ChartTab component; add BusinessLogTab component |
| `src/app/api/mf-business/route.ts` | Add `employeeId` query param support for admin role |
| `src/app/api/reports/export/route.ts` | Add `mf-business-log` export type |

No new routes, no schema changes, no new components outside the page file.

## Out of Scope

- Admin editing or deleting employee records from this view (read-only)
- Pagination (existing limit of 50 records per fetch is sufficient for monthly data)
- Email/schedule export

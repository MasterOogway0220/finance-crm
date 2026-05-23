# Inactive Equity Clients Filter — Design Spec

**Date:** 2026-04-30
**Status:** Approved

## Overview

Add a real-time computed filter to the existing equity clients listing that surfaces clients who have given no business in Equity OR Mutual Fund for more than 2 calendar months. No persistent table or cron job is needed — the filter queries live data on demand.

---

## Requirements

- **Trigger:** A "No Business 2+ Months" toggle on the equity clients page filter bar.
- **Inactive definition:** An equity client is inactive if they have no equity brokerage activity AND no MF activity since the cutoff date.
- **Cutoff date:** 1st of the previous calendar month, computed at query time.
  - Example: If today is April 30 → cutoff = March 1.
  - Example: If today is May 15 → cutoff = April 1.
  - Rationale: Brokerage resets on the 1st of each month; 2 reset cycles back is the threshold.
- **Equity activity check:** Client has at least one `BrokerageDetail` record where `brokerage.uploadDate >= cutoff`.
- **MF activity check:** The same client (matched by `clientCode`) has at least one `MFBusiness` (businessDate >= cutoff) OR `MFService` (serviceDate >= cutoff) in the MUTUAL_FUND department.
- **Visibility:** All inactive equity clients across all operators are shown, regardless of the logged-in user's role or assigned clients.
- **Approach:** Real-time computed filter — no separate DB table, no cron job.

---

## Architecture

### API — `GET /api/clients`

Add a new query parameter: `inactive2m=true`.

**When `inactive2m=true`:**

1. Override the operator restriction — do not filter by `operatorId` even for `EQUITY_DEALER` role.
2. Force `department: 'EQUITY'`.
3. Ignore all other filters (status, remark, ageRange, mfStatus, mfRemark, search) — they do not apply to this view.
4. Compute cutoff: `new Date(now.getFullYear(), now.getMonth() - 1, 1)`.
5. Two-step inactive query:
   - **Step 1:** Fetch all `clientCode` values from `Client` where `department = MUTUAL_FUND` AND (`mfBusinesses.some(businessDate >= cutoff)` OR `mfServices.some(serviceDate >= cutoff)`). Collect these as `mfActiveClientCodes`.
   - **Step 2:** Query `Client` where:
     - `department = EQUITY`
     - `NOT { brokerageDetails: { some: { brokerage: { uploadDate: { gte: cutoff } } } } }`
     - `NOT { clientCode: { in: mfActiveClientCodes } }`
6. Pagination continues to work normally.

**When `inactive2m` is absent or `false`:** existing behaviour is unchanged.

### Frontend — `/equity/clients` page

- Add a **"No Business 2+ Months"** toggle button to the existing filter bar.
- When toggled on:
  - Send `inactive2m=true` to the API.
  - Disable/grey out all other filter controls (status, remark, age).
  - Display an info label above the table: *"Showing clients with no equity or MF activity since [cutoff date e.g. 1 Mar 2026]"*.
- When toggled off: restore normal filter state and controls.
- No new page, no new table component. Existing columns (client code, name, phone, email, operator name) are sufficient.

---

## Data Flow

```
User toggles "No Business 2+ Months"
  → Frontend sends GET /api/clients?inactive2m=true&page=1
  → API computes cutoff (1st of previous month)
  → Step 1: fetch MF-active clientCodes since cutoff
  → Step 2: find EQUITY clients with no brokerage AND not in mfActiveClientCodes
  → Returns paginated list
  → Frontend renders table with cutoff info label
```

---

## Edge Cases

- **Empty MF active list:** `NOT { clientCode: { in: [] } }` is always TRUE in MySQL — no clients are incorrectly excluded. Correct behaviour.
- **Client with no MF counterpart:** They are only checked against the BrokerageDetail filter. If no brokerage since cutoff, they appear in the list. Correct behaviour.
- **Month boundary (January):** `new Date(year, 0 - 1, 1)` = `new Date(year, -1, 1)` — JavaScript correctly resolves this to December 1 of the previous year.
- **Zero inactive clients:** The table renders empty with a "No inactive clients found" state.

---

## Out of Scope

- Persistent watchlist table or cron-based tracking.
- Notifications or alerts when a client becomes inactive.
- Export of the inactive list (can be added later if needed).
- Role-based visibility restrictions on this filter.

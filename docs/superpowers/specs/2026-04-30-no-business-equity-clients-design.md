# No Business — Equity Clients Report

**Date:** 2026-04-30  
**Status:** Approved

## Overview

A report page for Admins and Super Admins listing equity clients who have had no brokerage activity for more than 2 months. Clients are added automatically by the system and removed automatically when new equity brokerage or MF business occurs. Admins can also dismiss a client early (manual early removal).

## Criteria

### Added to the list
An equity client appears on the list when **all** conditions are true:
1. Their most recent `BrokerageDetail.createdAt` is older than 2 months ago, **OR** they have no brokerage records at all and their `Client.createdAt` is older than 2 months ago.
2. Their `mfStatus` is **not** `ACTIVE` (if MF has marked them active they are considered a live client).
3. They are not currently dismissed (see Dismissal logic below).

### Removed from the list (automatic)
A client is automatically excluded when any of the following are true:
- They have a `BrokerageDetail.createdAt` within the last 2 months (equity business received)
- They have a `MFBusiness.businessDate` within the last 2 months (MF business received)
- Their `mfStatus = ACTIVE` (MF team has marked them active)

**Dismissal auto-clear:** If an admin dismissed a client and subsequently a `BrokerageDetail` or `MFBusiness` record appears with a date after `dismissedAt`, the dismissal is treated as void and the client re-enters the list if they again go 2 months without activity. The `mfStatus = ACTIVE` exclusion always takes precedence over dismissal.

### Removed from the list (manual)
An Admin or Super Admin can dismiss a client early via the Dismiss action on the report page. The dismissal is stored with `dismissedAt` timestamp and the dismissing admin's ID. If the client subsequently receives new business, they auto-clear and the old dismissal becomes irrelevant.

## Data Model

### New Prisma model: `NoBusinessDismissal`

```prisma
model NoBusinessDismissal {
  id            String   @id @default(cuid())
  clientId      String   @unique   // one active dismissal per client
  client        Client   @relation(fields: [clientId], references: [id])
  dismissedById String
  dismissedBy   Employee @relation(fields: [dismissedById], references: [id])
  dismissedAt   DateTime @default(now())

  @@index([clientId])
}
```

Also add the reverse relation to `Client` and `Employee` models in schema.

## API

### `GET /api/reports/no-business`

Returns paginated list of equity clients currently on the no-business list.

**Access:** ADMIN, SUPER_ADMIN only

**Query params:**
| Param | Description |
|-------|-------------|
| `page` | Page number (default 1) |
| `limit` | Results per page (default 25) |
| `search` | Filter by client code or name |
| `operator` | Filter by assigned operator ID |

**Response shape per client:**
```json
{
  "id": "...",
  "clientCode": "...",
  "firstName": "...",
  "middleName": "...",
  "lastName": "...",
  "phone": "...",
  "operator": { "id": "...", "name": "..." },
  "lastBrokerageDate": "2026-01-10T00:00:00Z" | null,
  "daysInactive": 110,
  "dismissedAt": "2026-03-01T00:00:00Z" | null,
  "dismissedBy": { "id": "...", "name": "..." } | null
}
```

**Query logic:**
1. Fetch all `Client` where `department = EQUITY` AND `mfStatus != ACTIVE`
2. For each, compute `lastBrokerageDate` = max of `BrokerageDetail.createdAt` (null if none), and `lastMFBusinessDate` = max of `MFBusiness.businessDate` (null if none)
3. Exclude client if `lastBrokerageDate >= now - 2 months` OR `lastMFBusinessDate >= now - 2 months`
4. Of remaining clients, include only those where: `lastBrokerageDate < now - 2 months` OR (`lastBrokerageDate IS NULL` AND `createdAt < now - 2 months`)
5. Join `NoBusinessDismissal` — if a dismissal exists: check for any `BrokerageDetail.createdAt` or `MFBusiness.businessDate` after `dismissedAt`. If found → dismissal is void, client stays visible. If not found → admin-dismissed, exclude from list.
6. Apply search/operator filters, paginate, return.

### `POST /api/reports/no-business/dismiss`

Creates or upserts a `NoBusinessDismissal` for the specified client.

**Access:** ADMIN, SUPER_ADMIN only

**Body:**
```json
{ "clientId": "..." }
```

**Behaviour:** Upserts on `clientId` (one active dismissal per client). Records the requesting admin as `dismissedById`.

## UI

### Route
`src/app/(protected)/reports/no-business/page.tsx`

### Access control
Rendered only for `ADMIN` and `SUPER_ADMIN` roles. Other roles see a 403 or are redirected.

### Page structure

**Header**
- Title: "No Business — Equity Clients"
- Subtitle: "Equity clients with no brokerage for more than 2 months"
- Stats bar: total count currently on list

**Filter bar**
- Search input: filter by client code or name
- Operator dropdown: filter by assigned equity dealer

**Table columns**
| Column | Notes |
|--------|-------|
| Code | Client code (monospace) |
| Name | Full name with avatar initials |
| Phone | Clickable tel link |
| Operator | Assigned dealer name |
| Last Brokerage | Date or "Never" badge |
| Days Inactive | e.g. `74 days`; warning badge (amber) if > 90 days |
| Action | Dismiss button with confirm popover |

**Dismiss flow**
- Button opens a small confirm popover: "Dismiss this client from the list?"
- On confirm: calls `POST /api/reports/no-business/dismiss`, row disappears optimistically
- Dismissed clients re-appear automatically if they generate new business

**Pagination**
Standard previous/next, 25 per page, shows total count.

**Export**
CSV download button — exports current filtered list with all columns.

**Empty state**
"No dormant clients — all equity clients have recent brokerage activity."

### Navigation
A new "No Business" link added to the Reports section in the sidebar/nav, grouped under "Client Activity". Visible only to ADMIN and SUPER_ADMIN.

## Out of Scope
- Notifications or alerts when a client crosses the 2-month threshold
- Historical audit log of past dismissals (current model only tracks the latest)
- MF department equivalent (equity only for now)

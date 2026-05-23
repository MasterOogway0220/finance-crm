# Task Pullback (Cancel) — Design Spec

**Date:** 2026-04-23
**Status:** Approved

---

## Overview

Entities who can assign tasks (EQUITY_DEALER, MF_DEALER) should be able to cancel/pull back a task they assigned, as long as it is still PENDING. A cancelled task must not appear in the assignee's task report metrics.

---

## Scope

- Add `CANCELLED` task status
- Cancellation is only available to the **original assigner**, only while the task is **PENDING**
- Assignee receives a notification when their task is pulled back
- Reports exclude cancelled tasks entirely (no count in total, pending, expired, or completion rate)

---

## Schema

Add `CANCELLED` to the `TaskStatus` enum in `prisma/schema.prisma`:

```prisma
enum TaskStatus {
  PENDING
  COMPLETED
  EXPIRED
  CANCELLED
}
```

Run `npx prisma db push` after the change.

No new fields required on the `Task` model — `updatedAt` already captures when the cancellation happened.

---

## API — `PATCH /api/tasks/[id]`

### `updateTaskSchema` change
Add `CANCELLED` to the allowed status values:
```ts
status: z.enum(['PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED']).optional()
```

### Cancellation rules (JSON path)
When `status === 'CANCELLED'`:
1. Caller must be the assigner (`existing.assignedById === session.user.id`). Return 403 otherwise.
2. Task must be `PENDING`. Return 400 if already `COMPLETED`, `EXPIRED`, or `CANCELLED`.
3. Update task status to `CANCELLED`.
4. Send notification to the assignee:
   - type: `TASK_ASSIGNED` (reuse existing type — no schema change needed)
   - title: `"Task pulled back"`
   - message: `"Task \"<title>\" was pulled back by <assignerName> and is no longer required."`
   - link: assignee's tasks link
5. Log activity: `Pulled back task "<title>"`.

---

## UI — Task Detail Modal (`task-detail-modal.tsx`)

### Cancel button visibility
Show a **"Pull Back Task"** button when:
- `canEdit === true` (already means: caller is the assigner)
- `task.status === 'PENDING'`
- `isEditing === false`

No new prop needed — `canEdit` already encodes the right permission.

### Placement
Below the Edit button in the header action group, styled as a destructive outline button (`variant="outline"` with red text).

### Confirmation dialog
A simple `AlertDialog`:
- Title: **"Pull Back Task?"**
- Description: "This will cancel the task. [Assignee name] will be notified and the task will no longer appear in their work queue."
- Actions: Cancel | **Pull Back** (red)

### Callbacks
Add an `onTaskCancelled?: (taskId: string) => void` prop. Called on success so the parent page can remove or update the task row.

### Status display
Add `CANCELLED` to the `statusColor` map in the modal:
```ts
CANCELLED: 'bg-gray-100 text-gray-600'
```

---

## UI — Tasks List Page (`tasks/page.tsx`)

- Add `CANCELLED` to the `STATUS_COLORS` map: gray badge
- Add **"Cancelled"** option to the status filter `<Select>`
- Cancelled task rows rendered muted (no extra style required beyond the gray badge)

---

## Reports — No Changes Required

`/api/reports/tasks` aggregates by status using an if/else chain that only counts `COMPLETED`, `PENDING`, and `EXPIRED`. A `CANCELLED` task falls through all branches and is silently excluded. The `total` and `completionRate` calculations are therefore already correct.

The reports UI (`/reports/tasks/page.tsx`) has no changes needed.

---

## Notification Type

Reuse the existing `TASK_ASSIGNED` notification type for the pullback notification. The title and message make the intent clear without requiring a schema migration.

---

## Out of Scope

- Cancelling completed or expired tasks — not allowed
- Admin-initiated cancellation — admins can already edit/delete via the employee master; this feature is for assigners only
- A separate `cancelledAt` timestamp field — not needed for current reporting requirements

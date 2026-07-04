# WhatsApp Do-Not-Contact (Opt-Out) List — Design Spec

> Status: **APPROVED 2026-07-04**. Extends the WhatsApp sender (see `2026-07-03-marketing-whatsapp-sender-design.md`).
> Stack: Next.js 16 + Prisma 6/MySQL + next-auth v5; office-PC open-wa bridge (`worker/`).

## 1. Goal

Never message a number that has opted out — for compliance and to protect the WhatsApp number from bans. Numbers land on the list two ways: **staff add them manually**, or the bridge **auto-adds anyone who replies "STOP"** (the default template already says "Reply STOP to opt out"). Opt-out applies to **contacts only**; group sends are unaffected.

## 2. Data model (`prisma/schema.prisma` + mirror in `worker/prisma/schema.prisma`)

```prisma
enum WhatsappOptOutSource { STOP MANUAL }

model WhatsappOptOut {
  id          String               @id @default(cuid())
  phone       String               @unique   // normalized 91XXXXXXXXXX
  source      WhatsappOptOutSource @default(MANUAL)
  reason      String?
  createdById String?                        // null for auto-STOP (added by the bridge)
  createdAt   DateTime             @default(now())

  @@index([createdAt])
}
```

Worker mirror uses `@@map("WhatsappOptOut")` + the same enum. Phone is the normalized `91…` form so it matches `normalizeWhatsappPhone` output used everywhere else.

## 3. API (`canSendWhatsapp`-gated; `{success,data?,error?}`; `logActivity(module:'WHATSAPP')`)

- `GET /api/whatsapp/opt-outs?search=` → `{ success, data: { optOuts: { id, phone, source, reason, createdAt }[] } }` (newest first, optional phone/reason contains-search).
- `POST /api/whatsapp/opt-outs` `{ phone, reason? }` → normalize phone (400 if invalid); `upsert` by phone (source `MANUAL`, `createdById = session.user.id`); return the row. Idempotent (re-adding an existing number is fine).
- `DELETE /api/whatsapp/opt-outs/[id]` → remove (re-consent). P2025 → 404.

## 4. Enforcement

**Queue time — `POST /api/whatsapp/campaigns`:** after building the deduped `rows`, collect the normalized phones of the CONTACT rows, query `WhatsappOptOut` for those phones (`where: { phone: { in } }`), build a `Set<string>` of opted-out normalized phones, and split the rows with a pure helper. Count dropped rows as `skippedOptedOut`. Response gains `skippedOptedOut`; the queue toast shows "… , N opted-out" when > 0.

Pure helper (in `src/lib/whatsapp-outreach.ts`, unit-tested): `filterOptedOut(rows, optedOutSet)` where each row has `{ phone: string; targetType: 'CONTACT' | 'GROUP' }`. It **normalizes each CONTACT row's phone internally** (`normalizeWhatsappPhone`) and drops rows whose normalized phone is in `optedOutSet`; **GROUP rows (and rows with an unnormalizable phone) are always kept**. Returns `{ kept, skippedOptedOut }`.

**Send time — `worker/send.js`:** immediately before `sendText`, for a CONTACT target, check `prisma.whatsappOptOut.findUnique({ where: { phone: normalised } })`; if present, mark the row `SKIPPED` (error `'Opted out'`) and continue. Cheap defense-in-depth for opt-outs that arrive after queueing.

## 5. Auto-STOP (bridge — `worker/send.js`)

- After `create()` resolves (in `start`/`drainQueue`), register `client.onMessage(async (message) => …)` once.
- For each inbound message: take `message.body` (text), uppercase+trim; if it equals or starts with a keyword in `{ STOP, UNSUBSCRIBE, OPT OUT, OPTOUT, REMOVE, CANCEL }`, extract the sender number from `message.from` (strip `@c.us`), `normalizeWhatsappPhone` it, and `upsert` a `WhatsappOptOut` (source `STOP`, `createdById` null). Ignore group messages (`message.isGroupMsg`) and own messages.
- Best-effort: log each auto opt-out. This is validated on the office PC (open-wa `onMessage` can't run here).

## 6. UI (`src/components/whatsapp/opt-out-manager.tsx` + button on the WhatsApp page)

A "Do-Not-Contact" dialog (mirrors the Templates manager pattern):
- **Add** row: phone input + optional reason + Add button → POST → reload.
- **List**: searchable, each row shows phone, a `STOP`/`MANUAL` badge, reason, date, and a Remove (trash) button → DELETE → reload.
- Opened by a "Do-Not-Contact" button placed near the Templates button on the page.

## 7. Testing

- Unit (vitest): `filterOptedOut(rows, optedOutSet)` — drops matches, keeps non-matches, never touches GROUP rows; and a STOP-keyword matcher helper `isOptOutMessage(body)` (pure) covering STOP / unsubscribe / mixed case / normal message.
- Gates: `npx tsc --noEmit`, `npm test`, `npm run build`, `node --check worker/send.js`. Worker stays tsc/eslint-excluded.

## 8. Build order / plan

1. Data model (both schemas) + `prisma generate`.
2. Pure helpers `filterOptedOut` + `isOptOutMessage` (+ tests) in `src/lib/whatsapp-outreach.ts`.
3. Opt-out API (`GET/POST` + `[id] DELETE`).
4. Queue-time enforcement in campaigns + `skippedOptedOut`.
5. UI dialog + page button + toast wording.
6. Bridge: send-time skip + `onMessage` auto-STOP.
7. Verify + deploy (deferred owner `prisma db push` adds `WhatsappOptOut` + enum; office-PC `npm install` for the worker's regenerated client).

## 9. Deferred / out of scope
- Opt-out landing page / two-way confirmation ("reply START to resubscribe"); per-campaign opt-out reporting; hiding opted-out clients in the audience table (they're just filtered silently at queue time). Add later if wanted.

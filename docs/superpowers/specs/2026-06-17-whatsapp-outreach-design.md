# WhatsApp Outreach to Inactive Clients — Design Spec

> Status: **DESIGN ONLY — not built yet.** Captured 2026-06-17. Build deferred.
> Author context: Kesar Securities finance CRM (Next.js 16 App Router + React 19 + Prisma 6 / MySQL + Tailwind + shadcn/ui + sonner + zustand). App on Vercel; DB on Hostinger; domain points Hostinger → Vercel.

---

## 1. Context & Goal

The business wants to **re-engage "inactive" / "non-traded" clients over WhatsApp** — clients who currently aren't trading (equity) or aren't active (mutual fund). An **admin** picks which inactive clients to contact, writes one message, and the system sends it to them.

Hard requirements the owner set (in priority order):
1. **Free** — no paid messaging API, no per-message cost.
2. **Legal / won't get the number banned** — must not blast in a way that gets the company WhatsApp number blocked.
3. **As automated as possible** — admin clicks "send", and sending happens with minimal manual work.
4. **No 24/7 machine** — the office PC cannot be kept on all night.
5. **Office hours only** — send only between **10:00 and 16:00 IST**.
6. **Daily limit** — send only ~**20–40 messages/day** (default chosen: **30**).
7. **Admin selects the clients** — not an automatic blast to everyone; admin chooses recipients, but the daily limit still governs send speed.

---

## 2. The core constraint (why the design is what it is)

You **cannot have all three of {free, ban-safe, fully-automated}** at once. The realistic options:

| Approach | Free? | Ban-safe? | Automated? | Notes |
|---|---|---|---|---|
| **Click-to-send `wa.me` links** | ✅ | ✅ | ❌ (manual click + Enter per client) | CRM builds `wa.me/91…?text=…` links; staff sends from their own WhatsApp. |
| **Unofficial bot (whatsapp-web.js)** | ✅ | ⚠️ low-but-real ban risk | ✅ | Drives a real WhatsApp number via WhatsApp Web automation. Against WhatsApp ToS. **← CHOSEN** |
| **Official WhatsApp Cloud API** | ❌ (marketing templates cost per msg in India) | ✅ | ✅ | Already partly wired in `src/lib/whatsapp.ts`; needs WABA verification + approved marketing templates. Free-form text will NOT deliver to people who haven't messaged you in 24h. |

**Decision:** Go with the **unofficial whatsapp-web.js worker** because the owner prioritised *free + automated*. Ban risk is mitigated (see §9) by low daily volume, office-hours-only sending, random gaps, messaging **only our own clients**, and using a **dedicated number** that could be sacrificed if banned.

### Why "no 24/7 PC" is NOT a blocker
All campaign state lives in the **Hostinger database** (always on). The office PC is just a stateless "sending arm." It only needs to run **during office hours** (when it's on anyway). Worker exits at 16:00 / when the daily cap is hit / when the queue is empty. PC is shut at night with zero data loss; next morning the worker restarts and resumes from the DB. The WhatsApp login (QR) is saved on disk by `LocalAuth`, so it's scanned **once**, not daily.

---

## 3. Chosen Architecture

```
ADMIN (CRM "WhatsApp Outreach" page, on Vercel)
   │  filters inactive clients → selects recipients → writes message → "Queue Campaign"
   ▼
POST /api/whatsapp/campaigns  → writes one WhatsappMessage row per recipient (status PENDING)
   ▼
HOSTINGER MySQL DB  ←──────────────── the campaign's memory lives here (always on)
   ▲
   │  worker reads PENDING rows (respecting daily cap + office hours)
OFFICE PC (only on during work hours; NOT Vercel)
   └─ worker/send.js  (Node + whatsapp-web.js, company WhatsApp number)
        sends ≤30/day, 5-min gaps, 10:00–16:00, marks each SENT/FAILED/SKIPPED, resumes next day
```

Cost: **₹0.** No VPS, no per-message fee, no always-on machine.

---

## 4. Data numbers (measured from production DB on 2026-06-17)

Source: `scripts/count-inactive.ts` (read-only; left in repo — re-run anytime with
`npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/count-inactive.ts`).

| Metric | Count |
|---|---|
| Total client records | 2,782 (973 equity + 1,809 MF) |
| Equity — NOT_TRADED / TRADED | 703 / 270 |
| MF — INACTIVE / ACTIVE | 1,803 / 6 |
| Inactive records (both depts, pre-dedupe) | 2,506 |
| …with missing/placeholder/invalid phone | 215 |
| **Unique messageable phone numbers (real send count)** | **~1,474** |
| Equity dormant 2+ months (reference) | 729 |

**Important nuance:** the monthly reset flips nearly every MF client to INACTIVE (1,803 of 1,809), so "all inactive (equity + MF)" ≈ **the entire client book minus this month's 270 traders** ≈ **1,474 unique people** after merging duplicate equity/MF records by phone.

### Campaign duration vs daily cap (for ~1,474 people)
| Daily cap | Days to finish |
|---|---|
| 20/day | ~3.5 months of working days |
| 30/day | ~2.5 months |
| 40/day | ~1.8 months |

It's a slow, safe drip. The recipient list is **frozen as a snapshot when the admin clicks "Queue"**, so a long campaign isn't disturbed by monthly resets.

---

## 5. Audience definition

Computed from the `Client` model:
- **Equity inactive:** `{ department:'EQUITY', status:'NOT_TRADED' }`
- **MF inactive:** `{ department:'MUTUAL_FUND', mfStatus:'INACTIVE' }`
- **Dormant 2+ months (equity):** `{ department:'EQUITY', NOT:{ brokerageDetails:{ some:{ brokerage:{ isActive:true, uploadDate:{ gte: <first day of previous month> } } } } } }`
- **"all"** = Equity inactive ∪ MF inactive.

**Must dedupe by normalised phone** (the same person often has both an EQUITY and a MUTUAL_FUND record with the same phone — prefer the EQUITY record). **Exclude invalid/placeholder phones.**

**Phone normalisation** (mirror `src/lib/whatsapp.ts`): strip non-digits; 10 digits → `91`+digits; 12 digits starting `91` → as-is; else invalid. Reject `0000000000` / `910000000000`.

---

## 6. Data model (Prisma — to add to `prisma/schema.prisma`)

```prisma
enum WhatsappStatus { PENDING SENT FAILED SKIPPED }

model WhatsappMessage {
  id          String         @id @default(cuid())
  campaignId  String         // groups one admin "Queue" action
  clientId    String?        // loose ref (NO Prisma relation / FK — keeps migration tiny)
  clientCode  String
  clientName  String
  phone       String         // raw Client.phone as stored
  body        String         @db.Text   // already personalised ({{name}} replaced)
  status      WhatsappStatus @default(PENDING)
  error       String?        @db.Text
  sentAt      DateTime?
  createdById String
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@index([status])
  @@index([campaignId])
  @@index([sentAt])
}
```

- **No relation field added to `Client`** (intentional — keeps the migration to one new table + enum, minimal blast radius on the production DB).
- Deploy step (deferred): `npx prisma db push` (the repo uses `db push`, not migrations — see `package.json` `db:push`).

---

## 7. API contract (App Router routes)

All routes: `auth()` + `getActiveRole()` + `isManager(role)` gate (ADMIN/SUPER_ADMIN only; CA excluded). JSON shape `{ success, data?, error? }`, try/catch with `console.error('[METHOD /path]', e)` + 500 fallback. zod inline validation. Patterns mirror `src/app/api/clients/bulk/route.ts`.

### `GET /api/whatsapp/audience`
Query: `segment=all|equity|mf|dormant2m` · `search` · `page` · `limit` · `idsOnly=true`
- Build inactive set per segment → fetch `{ id, clientCode, firstName, middleName, lastName, phone, department }` → apply search (contains on code/first/last/phone) → **dedupe by normalised phone (equity preferred)** → drop invalid phones.
- `idsOnly=true` → `{ success, data:{ ids: string[] } }` (all matching, deduped — powers "select all matching").
- else → `{ success, data:{ clients:[{ id, clientCode, name, phone, department }], total } }` (paginated **after** dedupe).
- dormant2m cutoff = `new Date(now.getFullYear(), now.getMonth()-1, 1)`.

### `POST /api/whatsapp/campaigns`
Body: `{ clientIds: string[] (min 1), message: string (min 1) }`
- Fetch clients by id. `campaignId = crypto.randomUUID()`. For each: normalise phone → skip invalid (`skippedInvalid`); dedupe by phone (`skippedDuplicate`); `body = message.replaceAll('{{name}}', firstName)`.
- `createMany` WhatsappMessage rows (PENDING, `createdById = session.user.id`, `clientName` = full name).
- `logActivity({ action:'QUEUE', module:'WHATSAPP', ... })`.
- Return `{ success, data:{ campaignId, queued, skippedInvalid, skippedDuplicate } }`.

### `GET /api/whatsapp/campaigns`
- Return `{ success, data:{ sentToday, pendingTotal, campaigns:[{ campaignId, createdAt, total, pending, sent, failed, skipped }] (recent ~20) } }`.
- `sentToday` = count(status SENT, `sentAt >=` start of today). Use `groupBy` or fetch+reduce.

---

## 8. Frontend — `src/app/(protected)/whatsapp/page.tsx` (`'use client'`)

ADMIN-ONLY (SUPER_ADMIN/ADMIN; redirect others to `/dashboard`; **exclude CHARTERED_ACCOUNTANT**). Mirror selection/filter/toast/dialog patterns from `src/app/(protected)/masters/clients/page.tsx`.

Sections:
1. **Status strip** — from `GET /api/whatsapp/campaigns`: "Sent today: X / Pending in queue: Y" + recent campaigns list + note "Messages are sent by the office-PC worker at ~30/day during office hours."
2. **Audience** — Segment `<Select>` (All inactive / Equity not-traded / MF inactive / Dormant 2+ months) + debounced search + table (Code, Name, Phone, Dept) with header + per-row `Checkbox`. `Set<string>` selection persisting across pages. "Select all N matching" via `idsOnly=true`.
3. **Compose** — `Textarea` prefilled with a default template containing `{{name}}` + an opt-out line ("Reply STOP to opt out"), char counter, live preview (`{{name}}` → "Rahul").
4. **Queue Campaign** button (disabled if 0 selected or empty message) → `AlertDialog` confirm ("Queue N messages? They'll send ~30/day during office hours.") → `POST /api/whatsapp/campaigns` → toast "Queued X (skipped Y invalid, Z duplicate)", clear selection, refresh status strip.

**Sidebar** (`src/components/layout/sidebar.tsx`): add `{ label:'WhatsApp', href:'/whatsapp', icon: MessageCircle }` to `ADMIN_NAV` after "Reports". In `getNavItems`, the `CHARTERED_ACCOUNTANT` case returns `ADMIN_NAV.filter(i => i.href !== '/whatsapp')`; SUPER_ADMIN/ADMIN get full nav.

---

## 9. Worker — `worker/` folder (self-contained, plain CommonJS)

Runs on the office PC, **NOT** on Vercel. Must be in `tsconfig.json` `exclude` so it never enters the app build. Its deps (`whatsapp-web.js`, `qrcode-terminal`, `dotenv`, `@prisma/client`, `prisma`) live **only** in `worker/package.json` — **never** in root `package.json` (would break the Vercel build).

Files:
- `worker/package.json` — scripts `{ start: "node send.js", postinstall: "prisma generate --schema=../prisma/schema.prisma" }`.
- `worker/send.js` — the sender.
- `worker/.env.example` — `DATABASE_URL=`, `DAILY_LIMIT=30`, `GAP_MS=300000`, `JITTER_MS=60000`, `WINDOW_START_HOUR=10`, `WINDOW_END_HOUR=16`.
- `worker/README.md` — Windows setup guide (see §10).

Logic:
- On an Indian office PC, local time == IST → use `new Date().getHours()` for the window (no TZ library).
- Boot whatsapp-web.js **once** with `new LocalAuth()` + `puppeteer { headless:true, args:['--no-sandbox','--disable-setuid-sandbox'] }`. Print QR via `qrcode-terminal` on `'qr'`. Log `authenticated`/`ready`/`auth_failure`/`disconnected`.
- On `'ready'`, loop:
  1. If `hour < START_HOUR (10)` or `>= END_HOUR (16)` → log + exit.
  2. `sentToday = count(status SENT, sentAt >= start of today)`; if `>= DAILY_LIMIT (30)` → log + exit.
  3. `msg = findFirst(status PENDING, orderBy createdAt asc)`; if none → log "queue empty" + exit.
  4. normalise phone; if invalid → mark `SKIPPED`, continue immediately.
  5. `client.sendMessage(\`${normalised}@c.us\`, msg.body)` → on success `{ status:'SENT', sentAt:new Date() }`; on error `{ status:'FAILED', error:String(err) }`.
  6. wait `GAP_MS ± random(JITTER_MS)`, repeat.
- Exit on cap/window/empty is intentional → PC can shut down; daily cap is enforced by counting today's SENT rows, so restarts never exceed it.

### Ban-safety notes (bake into README)
- Use a **dedicated company number** you could afford to lose (not the primary business line).
- Keep daily limit low (20–40). Messages go **only to our own clients**.
- Office-hours-only + random gaps make traffic look human. Include an opt-out line; don't re-message non-responders.
- whatsapp-web.js is unofficial → occasional QR re-scan (every few weeks) and occasional library updates when WhatsApp changes.

---

## 10. Office-PC operator steps (one-time + daily)

One-time: install Node.js LTS → copy `DATABASE_URL` from the app env into `worker/.env` → `cd worker && npm install` → `npm start` → scan the QR with the company WhatsApp (Linked Devices). Optionally set a Windows Task Scheduler task to run `npm start` in `worker/` at login / 10:00.

Daily: turn on PC → (auto-start or `npm start`) → it sends the day's quota and stops. Turn off PC at night. Next morning it resumes from the DB.

---

## 11. Decisions locked & open

**Locked:**
- Audience: all inactive (equity NOT_TRADED + MF INACTIVE), any duration, deduped by phone, valid numbers only (~1,474).
- Who: ADMIN selects recipients; CA excluded.
- Mechanism: queue in DB + office-PC whatsapp-web.js worker (free, unofficial).
- Pace: daily cap 30 (changeable), 5-min gaps ± jitter, 10:00–16:00 IST, resumes across days.

**Open / to confirm before/while building:**
- Final daily-cap value (20 / 30 / 40 — default 30).
- Dedicated WhatsApp number to use (no code dependency; just the number scanned at QR).
- Where the worker physically runs: an **office PC kept on during work hours** (chosen path; shared "Business Web Hosting" plan **cannot** run it; a VPS was rejected to stay free).
- Optional later: a dedicated "messaging-only" login/role instead of using a full admin account.
- Optional later: surface daily-cap / window as editable settings in the admin UI; per-campaign progress detail view; "mark contacted / don't re-message" guards across campaigns; skip Sundays/holidays.

---

## 12. Build plan (when resumed)

1. **Foundation:** add `WhatsappMessage` model + `WhatsappStatus` enum to `prisma/schema.prisma`; add `"worker"` to `tsconfig.json` `exclude`; run `npx prisma generate` (no DB write yet).
2. **API:** `src/app/api/whatsapp/audience/route.ts` (GET) + `src/app/api/whatsapp/campaigns/route.ts` (POST + GET).
3. **Frontend:** `src/app/(protected)/whatsapp/page.tsx` + sidebar nav entry (gated).
4. **Worker:** `worker/` folder (package.json, send.js, .env.example, README.md).
5. **Verify:** `npx tsc --noEmit` clean for feature files; `npm test` (roles tests) green.
6. **Deploy step (needs owner approval):** `npx prisma db push` once to create the `WhatsappMessage` table on the Hostinger DB. Then set up the office PC per §10.

---

## 13. Reusable references in the codebase
- Existing WhatsApp (official API, plain text) helper: `src/lib/whatsapp.ts` (phone normalisation to copy).
- Auth/permission: `src/lib/auth.ts` (`auth`, `getActiveRole`), `src/lib/roles.ts` (`isManager`).
- API + bulk-selection patterns: `src/app/api/clients/bulk/route.ts`, `src/app/api/clients/route.ts`.
- Selection UI to mirror: `src/app/(protected)/masters/clients/page.tsx`.
- Sidebar nav: `src/components/layout/sidebar.tsx`.
- Read-only count tool: `scripts/count-inactive.ts`.

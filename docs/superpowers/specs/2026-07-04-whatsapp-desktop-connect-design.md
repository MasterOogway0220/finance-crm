# WhatsApp Desktop Connect — Design Spec

**Date:** 2026-07-04
**Status:** Draft for review
**Author:** Adi + Claude

## Goal

Let non-technical marketing staff connect and run the WhatsApp sender **entirely from the existing CRM desktop app** — open the app, click **Connect WhatsApp**, scan a QR once, done. No terminal, no `npm`, no separate program, no black console window. Messages then send automatically during office hours, with a hard guarantee that an in-flight send can never be interrupted or duplicated by another machine.

## Background

Today the sender is `worker/send.js` — a standalone Node process using `@open-wa/wa-automate` (which drives a real Chromium running WhatsApp Web). It reads `DATABASE_URL` from `worker/.env`, publishes its QR + state to the `WhatsappSession` DB row, and drains `PENDING` `WhatsappMessage` rows during office hours (daily limit, gaps, jitter, opt-out handling). It must be started by hand from a terminal (`cd worker && npm start`) — the blocker for non-technical staff.

The CRM website runs on Vercel (serverless) with the DB on Hostinger; **neither can hold a persistent WhatsApp Web browser session open**, so the sender must live on an always-on machine. The office already runs the **Kesar Securities CRM desktop app** (Electron, `electron-app/`) — it opens at login and auto-updates from GitHub releases. That app is the always-on host we will use.

## Decisions (locked)

- **Method:** Free `open-wa` sender (not the paid Meta Business API).
- **Host:** Bundled *inside* the existing Electron desktop app, run with Electron's built-in Node — the office PC needs **no** Node/npm install.
- **Data access:** **Direct database** (embed `DATABASE_URL` in the app). Accepted because the app is distributed strictly internally to employees. → The built installer must **never** be published to a public location.
- **Concurrency safety:** A DB-enforced **single-sender lease** + **atomic per-message claim** guarantee exactly one active sender and no double-sends. Any office PC running the app is safe; no manual "designated PC" needed.
- **Stale in-flight policy:** A send that gets stuck (app crashed mid-send) is **never auto-retried** — it is surfaced for manual review. Honors "never duplicate a send" over "never miss one."

## Architecture overview

```
┌─────────────────────── Office PC (always on) ───────────────────────┐
│  Kesar CRM Desktop App (Electron)                                    │
│                                                                      │
│  ┌────────────────────────┐        ┌──────────────────────────────┐ │
│  │ BrowserWindow           │  IPC   │ Main process (main.js)       │ │
│  │  = the CRM website      │◄──────►│  - spawns/stops worker       │ │
│  │  (Connect button here)  │ preload│  - utilityProcess.fork()     │ │
│  └───────────┬────────────┘        └───────────────┬──────────────┘ │
│              │ polls /api/whatsapp/session          │ runs           │
│              │ (QR + status)                        ▼                │
│              │                       ┌──────────────────────────────┐│
│              │                       │ worker (open-wa + Chromium)  ││
│              │                       │  - holds WhatsApp Web session ││
│              │                       │  - lease + atomic claim       ││
│              │                       │  - drains queue               ││
│              │                       └───────────────┬──────────────┘│
└──────────────┼───────────────────────────────────────┼──────────────┘
               │ HTTPS                                   │ direct DB (Prisma)
               ▼                                         ▼
        Vercel (CRM API)  ───────────────────────►  Hostinger MySQL
                          reads WhatsappSession /   WhatsappMessage,
                          WhatsappMessage rows      WhatsappSession, lease
```

Both the website (via API) and the worker (direct) talk to the **same** DB, so the QR the worker publishes shows up in the website's existing Connect panel unchanged.

## Components

### 1. Data model changes (`prisma/schema.prisma`)

**a. New `SENDING` status** on the `WhatsappStatus` enum:
```
enum WhatsappStatus {
  PENDING
  SENDING   // claimed by a sender, delivery in progress — untouchable by others
  SENT
  FAILED
  SKIPPED
}
```

**b. New single-row lease model** enforcing one active sender:
```
model WhatsappSenderLease {
  id         String   @id @default("default")
  holderId   String?  // random id of the app instance currently holding the lease
  holderName String?  // human hint, e.g. Windows machine name
  expiresAt  DateTime? // lease is valid only while now < expiresAt
  updatedAt  DateTime @updatedAt
}
```
- **Acquire/renew (atomic):** `updateMany` where `id='default' AND (holderId IS NULL OR holderId = :me OR expiresAt < :now)` → set `holderId=:me, expiresAt=:now+TTL`. If affected rows = 1 → we hold it; else another live sender owns it and we stay passive.
- **TTL:** lease valid 30s; renew every 10s while running. Dead holder → lease frees after ≤30s; another PC can take over. Never two holders at once.

**c. Atomic per-message claim** (no schema change, just query pattern):
- `findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } })`
- `updateMany({ where: { id, status: 'PENDING' }, data: { status: 'SENDING', updatedAt: now } })` → if count = 0, another machine grabbed it first; skip and re-pick. If count = 1, we own it exclusively.
- On confirmed delivery → `SENT`; on error (still connected) → `FAILED`; on invalid target / opt-out → `SKIPPED`.
- A row left in `SENDING` (crash between send and status update) is **not** auto-reset. The campaigns UI surfaces "stuck (needs review)" for `SENDING` rows older than 10 min so a human decides.

### 2. Worker changes (`worker/send.js`)

- **Resident, not run-once.** Instead of `process.exit(0)` when the queue is empty or the window closes, the worker idles (sleep + re-check) and keeps the WhatsApp session alive so "Connected" stays green continuously. It exits only when the desktop app tells it to stop or the app quits.
- **Lease-gated draining.** Before draining and before each send, acquire/renew the lease. If the lease can't be held, do not drain (another PC is the active sender).
- **Atomic claim** as described above (replaces the current plain `findFirst` + later `update`).
- **Config from the parent process, not `.env`.** When Electron forks the worker it passes `DATABASE_URL` and the tunables (`DAILY_LIMIT`, `GAP_MS`, window hours, etc.) as environment variables. `dotenv` stays as a fallback for standalone dev use.
- **Writable paths.** open-wa's session tokens and the Chromium cache are written under Electron's `userData` dir (passed in as an env var), so a packaged read-only app still works and the WhatsApp link survives restarts without re-scanning.
- Existing opt-out handling, normalization, office-hours window, daily limit, gaps/jitter, and group publishing are **kept as-is**.

### 3. Desktop app changes (`electron-app/`)

- **`main.js`:** add IPC handlers `whatsapp-start` / `whatsapp-stop`. `whatsapp-start` forks the worker via `utilityProcess.fork(workerEntry, [], { env: { DATABASE_URL, WA_USER_DATA: app.getPath('userData'), ...tunables } })` and tracks the child; `whatsapp-stop` gracefully kills it. Fork on demand (on Connect click), not automatically, so idle PCs don't spin up Chromium. Kill the child on app quit.
- **`preload.js`:** expose `startWhatsapp()`, `stopWhatsapp()`, and `isDesktopApp: true` on `window.electronAPI`.
- **Packaging (`electron-builder.yml`, `package.json`):** bundle the worker source, its `node_modules` (open-wa, `@prisma/client`), the **Windows** Prisma query engine (`binaryTargets` must include `windows`), and a **Chromium** for open-wa. Ship these as `extraResources` / `asarUnpack` so the binaries are runnable at runtime. `DATABASE_URL` is injected at build time (kept out of the public repo; installer distributed internally only). App download size grows (it now carries a browser) — a one-time cost auto-update handles.

### 4. Website changes (`src/components/whatsapp/connect-panel.tsx`)

- When `window.electronAPI?.isDesktopApp` is true → show a **Connect WhatsApp** button (calls `startWhatsapp()`) and, when connected, a **Disconnect** button (`stopWhatsapp()`). The existing 3s poll of `/api/whatsapp/session` continues to drive the QR image and the status badge.
- When **not** in the desktop app (a normal browser) → replace today's terminal instructions with a short message: "Open the Kesar CRM desktop app on the office PC to connect WhatsApp." No terminal commands shown to anyone, ever.
- Everything downstream of connection (QR display, status badge, group list) is unchanged — it already reads from the DB via `/api/whatsapp/session`.

## Data flow — connect & send

1. Staff open the desktop app → click **Connect WhatsApp**.
2. Web page → `electronAPI.startWhatsapp()` → IPC `whatsapp-start` → main forks the worker.
3. Worker boots open-wa → emits QR → writes `WhatsappSession { state: 'QR', qr }`.
4. Web panel's poll reads the QR from `/api/whatsapp/session` → shows it in-app.
5. Staff scan with the sending phone → open-wa authenticates → worker sets `state: 'CONNECTED'`.
6. Worker acquires the lease and drains: for each message, atomic-claim → `SENDING` → send → `SENT` (respecting daily limit, office hours, gaps/jitter, opt-outs). Renews the lease throughout.
7. Queue empty / window closed → worker idles (stays Connected), resumes when new messages appear within the window.
8. **Disconnect** (or app quit) → worker stops, releases the lease, sets `state: 'DISCONNECTED'`.

## Error handling

- **Second PC opens the app and clicks Connect:** it boots open-wa but **fails to acquire the lease** (a live sender holds it) → it does not drain; badge can show "Another PC is sending." No double-send possible.
- **Active sender PC crashes/turns off:** its lease expires within 30s; another PC that is running can take over. Any message it left in `SENDING` stays `SENDING` (untouchable) and is surfaced for manual review — never auto-resent.
- **Phone unlinks / session drops:** worker sets `DISCONNECTED`; staff click **Connect** and rescan. Pending messages stay `PENDING`.
- **Worker fails to boot open-wa / Chromium:** worker sets `DISCONNECTED` and logs; the desktop app can restart it on the next Connect click.
- **DB unreachable:** worker retries with backoff; publishes `DISCONNECTED` when it can.

## Testing approach

- **Unit (Node, worker):** lease acquire/renew/expire logic; atomic-claim returns exclusive ownership; two simulated senders never claim the same message; stale-`SENDING` detection (>10 min) flags but does not reset. Mirror opt-out/normalization tests already covered.
- **Integration (against a test DB):** two worker instances pointed at one queue → every message sent exactly once; killing the lease holder mid-run lets the other take over with no duplicates.
- **Desktop manual test:** package the app, run on a Windows PC, click Connect, confirm QR appears in-app, scan, confirm a queued test message sends; open the app on a second PC and confirm it does not double-send.
- **Website:** panel shows Connect/Disconnect in the desktop app and the "open the desktop app" hint in a plain browser.

## Out of scope

- Paid Meta WhatsApp Business API (explicitly deferred).
- Phone-number pairing codes (QR-only linking is kept).
- Auto-retry of stuck `SENDING` messages (deliberately manual).
- Multi-number / multi-session sending.

## Security note

`DATABASE_URL` (production) is embedded in the desktop app build. This is acceptable **only** because distribution is internal to employees. Action items: keep GitHub releases/installer **private**, and rotate the DB password if an installer ever leaks. Revisit the API-key approach if distribution ever widens.

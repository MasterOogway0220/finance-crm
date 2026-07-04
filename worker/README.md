# Kesar WhatsApp Outreach Worker (open-wa)

Sends the queued inactive-client WhatsApp messages from an **office PC**. It reads
`PENDING` rows from the shared Hostinger DB and sends them via a real WhatsApp
number using [`@open-wa/wa-automate`](https://github.com/open-wa/wa-automate-nodejs).
It sends at most `DAILY_LIMIT` per day, only between `WINDOW_START_HOUR`–`WINDOW_END_HOUR`,
then exits so the PC can be shut off. Progress lives entirely in the DB, so it
resumes across days with no data loss.

This folder is **standalone**: its dependencies live only here and it is excluded
from the app's TypeScript build (`tsconfig.json` → `exclude: ["worker"]`). Never add
`@open-wa/wa-automate` to the root `package.json` — it would break the Vercel build.

## One-time setup (Windows)

1. Install Node.js LTS.
2. In this `worker/` folder, copy `.env.example` to `.env` and paste the same
   `DATABASE_URL` the app uses (Hostinger MySQL).
3. `npm install` (installs deps and runs `prisma generate` against `./prisma/schema.prisma`).
4. `npm start` — a QR code prints in the terminal. On the **dedicated company phone**,
   open WhatsApp → Linked Devices → Link a device → scan it. This is a **one-time**
   scan; the session is saved on disk under the `kesar-outreach` session id.

## Connecting from the app (Phase 2)

The worker publishes its connection state to the shared DB (`WhatsappSession` row),
so the **WhatsApp page → "WhatsApp connection" card** shows it live:

- Start the worker → it emits a **QR** that appears on that card → scan it
  (WhatsApp → Linked devices → Link a device). The card flips to **Connected**.
- Once connected, the worker also publishes the number's **groups** so the page can
  target them, and it refreshes that list as it runs.
- When the worker stops (daily cap / window closed / queue empty / you close it), the
  card returns to **Disconnected** — that just means nothing is running right now;
  the WhatsApp login is still saved on disk, so the next `npm start` reconnects with
  **no re-scan**.

**In-app linking is QR-only.** open-wa surfaces a phone-pairing code only to *this
worker console*, not to the web app, so there is no reliable in-app "enter the code"
flow. If you specifically want to link by phone number, add `linkCode: '<number>'` to
the `create(...)` options in `send.js` and read the 8-char code printed in this window.

## Daily use

Turn the PC on during office hours → `npm start` (or a Windows Task Scheduler task
at login / 10:00). It sends the day's quota with ~5-minute gaps (± jitter) and then
exits. Turn the PC off at night; it resumes from the DB next morning. The daily cap
is enforced by counting today's `SENT` rows, so restarts never exceed it.

Robustness:
- **Started before 10:00** (e.g. auto-start at login): it waits until the window opens
  rather than exiting, so an early login never skips the day.
- **Session drops mid-run** (phone offline / device unlinked): it stops and leaves the
  remaining rows `PENDING` instead of marking real clients `FAILED`; just relaunch once
  the phone is back online. `FAILED` is reserved for genuine per-number send errors.
- A run processes the queue in a single loop (no `restartOnCrash`), so there are no
  overlapping senders / double-sends; if the browser crashes, the run ends and you relaunch.

## Configuration (`.env`)

| Var | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | — | Hostinger MySQL connection string (same as the app). |
| `DAILY_LIMIT` | `30` | Max messages sent per calendar day. |
| `GAP_MS` | `300000` | Base delay between sends (5 min). |
| `JITTER_MS` | `60000` | Random ± jitter added to each gap (1 min). |
| `WINDOW_START_HOUR` | `10` | Earliest send hour (local = IST). |
| `WINDOW_END_HOUR` | `16` | Stop sending at/after this hour. |

## Ban-safety

- Use a **dedicated number** you can afford to lose — not the primary business line.
- Keep `DAILY_LIMIT` low (20–40). Messages go **only to our own clients**.
- Office-hours-only + random gaps keep traffic human-looking; keep the opt-out line in the message.
- open-wa is unofficial → expect an occasional QR re-scan and library updates when WhatsApp changes.
- The free tier is sufficient (we only use `sendText`). Ignore the startup sponsor notice.

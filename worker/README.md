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

## Daily use

Turn the PC on during office hours → `npm start` (or a Windows Task Scheduler task
at login / 10:00). It sends the day's quota with ~5-minute gaps (± jitter) and then
exits. Turn the PC off at night; it resumes from the DB next morning. The daily cap
is enforced by counting today's `SENT` rows, so restarts never exceed it.

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

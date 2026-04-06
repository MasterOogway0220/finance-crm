# Electron Desktop App — Design Spec

**Date:** 2026-04-06
**Project:** Kesar Securities CRM
**Hosted URL:** https://crm.kesarsecurities.in/
**Target OS:** Windows (primary), cross-platform build possible
**Employees:** ~20

---

## Goal

Wrap the existing Next.js CRM web app in an Electron desktop application so employees can install it on their Windows machines. The app must:

1. Install as a standard Windows `.exe`
2. Auto-launch on Windows startup
3. Persist login — employees log in once (up to 30 days)
4. Record login time when the app opens (with an existing session)
5. Record logout time when the app is closed
6. Reflect all web app changes automatically (no Electron update needed)
7. Provide a refresh button and F5 shortcut (no browser toolbar available)

---

## Approach

**Electron** wrapping the hosted URL. The shell is a thin window — all business logic stays in Next.js. Changes to the web app are instantly reflected since the app loads a live URL.

Rejected alternatives:
- **Tauri** — requires Rust toolchain, more complex for a 20-person internal tool
- **PWA** — `before-quit` equivalent is unreliable; visibilitychange fires on every window switch, causing false logout entries
- **Electron + auto-updater** — unnecessary; web content updates automatically via URL

---

## Folder Structure

```
electron-app/                  ← new subfolder in existing repo
├── main.js                    ← main process (lifecycle, window, auto-launch)
├── preload.js                 ← IPC bridge (renderer ↔ main for quit signal)
├── package.json               ← electron + electron-builder deps
├── electron-builder.yml       ← Windows NSIS installer config
└── assets/
    └── icon.ico               ← app icon (256x256)

src/app/api/desktop/
├── app-opened/route.ts        ← creates EmployeeLoginLog when app opens with existing session
└── app-closed/route.ts        ← updates logoutAt when app closes
```

---

## UI — Custom Title Bar

The default OS window frame is removed (`frame: false` in BrowserWindow). A slim custom title bar is injected via the preload/renderer and overlaid on top of the web content:

| Element | Detail |
|---|---|
| Left | "Kesar Securities CRM" label |
| Right | Refresh (↻), Minimize (−), Maximize (□), Close (×) |
| Height | ~32px, draggable (`-webkit-app-region: drag`) |
| Buttons | not draggable (`-webkit-app-region: no-drag`) |
| Style | dark background matching CRM theme |

**F5** triggers `webContents.reload()` via a keydown listener in the main process.

The custom title bar is injected by `preload.js` using `DOMContentLoaded` so it appears on every page load without modifying the Next.js app.

---

## Login Tracking Flow

### Existing behaviour (unchanged)
- NextAuth `signIn` event → creates `EmployeeLoginLog` with `loginAt = now()`
- NextAuth `signOut` event → updates `logoutAt = now()`

### New behaviour (Electron-specific)

**App opens with existing session (no signIn event fires):**
```
app ready
  → BrowserWindow created, URL loaded
  → did-finish-load
      → renderer calls POST /api/desktop/app-opened (cookies auto-included)
          → 200: session found → create new EmployeeLoginLog, close any orphaned open logs
          → 401: not logged in → set flag, listen for navigation away from /login
                → user logs in → NextAuth signIn event handles log creation
```

**App closes:**
```
user clicks X / Alt+F4 / Windows shutdown
  → before-quit fires in main process
      → e.preventDefault()
      → webContents.executeJavaScript: fetch POST /api/desktop/app-closed
          → updates logoutAt on open logs for this user
      → app.quit() (second call, skips prevention via flag)
```

**Double-record protection:** A module-level `appOpenedRecorded` boolean flag prevents calling `app-opened` more than once per Electron process lifetime.

---

## API Routes (Next.js)

### POST /api/desktop/app-opened
- Requires valid NextAuth session (reads via `auth()`)
- Returns 401 if no session
- Closes any open (orphaned) logs for the user
- Creates a new `EmployeeLoginLog` with `loginAt = now()`
- Updates `employee.lastSeenAt`

### POST /api/desktop/app-closed
- Requires valid NextAuth session
- Returns 401 if no session (user wasn't logged in — no-op, safe)
- Updates `logoutAt = now()` on all open logs for the user

---

## Session Persistence

- NextAuth JWT cookie (`next-auth.session-token`) has `maxAge: 30 days`
- Electron stores cookies in `%APPDATA%\Kesar Securities CRM\` (Chromium profile)
- Employees log in once → auto-logged in on every subsequent app open for 30 days
- On session expiry: Next.js redirects to `/login` → employee logs in → signIn event fires → new log created

---

## Auto-Launch on Windows Startup

```javascript
app.setLoginItemSettings({ openAtLogin: true })
```

Called once on `app.ready`. Registers the app in Windows startup (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`). Does not require admin rights. Works on Windows 10/11.

---

## Build & Distribution

```
# One-time build (any Windows machine with Node.js 18+)
cd electron-app
npm install
npm run build
# Output: electron-app/dist/Kesar Securities CRM Setup.exe

# Initial distribution
Share .exe with 20 employees via WhatsApp / email / USB
Employees: double-click → "More info → Run anyway" (SmartScreen, once only) → install → done

# Future updates (after auto-updater is set up)
npm run build → upload to GitHub Releases → employees get updated automatically
```

---

## Auto-Update

Tool: **`electron-updater`** (part of electron-builder, free)
Host: **GitHub Releases** (free, public or private repo)

### How it works

```
You release a new version:
  1. Bump version in electron-app/package.json
  2. npm run build
  3. Create a GitHub Release → attach the .exe + .yml files from dist/

Employee's app (already installed):
  → On every app start → checks GitHub Releases for newer version
  → If update found → downloads silently in background
  → When download complete → shows a small notification:
       "A new update is ready. Restart to apply."
  → Employee clicks "Restart" → update installs → app reopens
```

### User experience
- **Silent download** — no interruption while working
- **Opt-in restart** — employee chooses when to restart (not forced)
- **If no internet** — update check fails silently, app works normally
- **First install** — no update mechanism needed; employees get the latest build directly

### What triggers a shell update
The Electron shell changes are rare. Updates are only needed when:
- Window behaviour changes (title bar, size, shortcuts)
- Auto-launch settings change
- A new API route is added for desktop lifecycle tracking

Web app changes (UI, features, bug fixes) **never** require a shell update — they reflect instantly via the URL.

### GitHub repo requirement
- A GitHub repository (can be the same repo or a dedicated one) must be public, OR
- If private: a GitHub Personal Access Token must be embedded in the build (fine for internal tools)
- `electron-builder.yml` points to `owner/repo` on GitHub

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| No internet on app open | Electron shows built-in offline page; retries on reconnect |
| API call fails on open | Silently ignored — tracking is best-effort, not blocking |
| API call fails on close | `app.quit()` still proceeds after 3s timeout |
| User force-kills process | logoutAt not recorded (same limitation as Electron's before-quit) |
| Session expires mid-session | Next.js redirects to /login; user logs in; signIn event records new log |
| Update check fails (no internet) | Silently ignored, app continues normally |
| Update download interrupted | Resumes on next app start |

---

## Out of Scope

- Mac/Linux installers (can be added later with same codebase)
- Offline mode / service worker caching
- Deep-link handling
- System tray icon

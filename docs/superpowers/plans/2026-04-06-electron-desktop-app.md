# Electron Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop wrapper for `https://crm.kesarsecurities.in/` that installs as a `.exe`, auto-launches on Windows startup, persists employee sessions, and records login/logout times when the app opens and closes.

**Architecture:** Electron loads the hosted Next.js URL in a frameless BrowserWindow with a custom injected title bar. Two new Next.js API routes handle desktop lifecycle events. Auto-update is provided via `electron-updater` + GitHub Releases.

**Tech Stack:** Electron 33, electron-builder 25, electron-updater 6, Next.js 14 (existing), Prisma (existing)

---

## File Map

**Create (Next.js):**
- `src/app/api/desktop/app-opened/route.ts` — records login when app opens with existing session
- `src/app/api/desktop/app-closed/route.ts` — records logoutAt when app closes

**Create (Electron shell — new subfolder):**
- `electron-app/package.json` — dependencies + build config
- `electron-app/electron-builder.yml` — Windows NSIS installer + GitHub publish config
- `electron-app/main.js` — main process: window, lifecycle, auto-launch, auto-update
- `electron-app/preload.js` — injects custom title bar into the web page DOM
- `electron-app/assets/icon.ico` — app icon (256x256, user must provide)

---

## Task 1: Next.js API — POST /api/desktop/app-opened

**Files:**
- Create: `src/app/api/desktop/app-opened/route.ts`

This route is called by Electron when the app starts and a session already exists (no NextAuth `signIn` event fires). It checks for a recently created login log (to avoid duplicating the one that NextAuth's `signIn` event just created during a normal login) and only creates a new one if none exists within the last 30 seconds.

- [ ] **Step 1: Create the route file**

```typescript
// src/app/api/desktop/app-opened/route.ts
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const userId = session.user.id
    const now = new Date()

    // If NextAuth's signIn event just created a log (within last 30s), don't duplicate
    const recentLog = await prisma.employeeLoginLog.findFirst({
      where: {
        employeeId: userId,
        logoutAt: null,
        loginAt: { gt: new Date(now.getTime() - 30_000) },
      },
    })

    if (!recentLog) {
      // Close any orphaned open logs from previous crashes / missed logouts
      await prisma.employeeLoginLog.updateMany({
        where: { employeeId: userId, logoutAt: null },
        data: { logoutAt: now },
      })
      await prisma.employeeLoginLog.create({
        data: { employeeId: userId },
      })
    }

    await prisma.employee.update({
      where: { id: userId },
      data: { lastSeenAt: now },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/desktop/app-opened/route.ts
git commit -m "feat: add desktop app-opened API route for login tracking"
```

---

## Task 2: Next.js API — POST /api/desktop/app-closed

**Files:**
- Create: `src/app/api/desktop/app-closed/route.ts`

Called by Electron's `before-quit` event. Updates `logoutAt` on any open login logs for the current user. Returns 401 silently if no session (user was on login screen when they closed the app — no log to close).

- [ ] **Step 1: Create the route file**

```typescript
// src/app/api/desktop/app-closed/route.ts
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    await prisma.employeeLoginLog.updateMany({
      where: { employeeId: session.user.id, logoutAt: null },
      data: { logoutAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/desktop/app-closed/route.ts
git commit -m "feat: add desktop app-closed API route for logout tracking"
```

---

## Task 3: Electron Scaffold — package.json + electron-builder.yml

**Files:**
- Create: `electron-app/package.json`
- Create: `electron-app/electron-builder.yml`
- Create: `electron-app/assets/` directory

- [ ] **Step 1: Create `electron-app/package.json`**

```json
{
  "name": "kesar-securities-crm",
  "version": "1.0.0",
  "description": "Kesar Securities CRM Desktop App",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win --x64"
  },
  "dependencies": {
    "electron-updater": "^6.3.9"
  },
  "devDependencies": {
    "electron": "^33.3.1",
    "electron-builder": "^25.1.8"
  }
}
```

- [ ] **Step 2: Create `electron-app/electron-builder.yml`**

Replace `GITHUB_OWNER` and `GITHUB_REPO` with your actual GitHub username and repository name before building. If you don't have a GitHub repo yet, you can leave these as placeholders and the app will still work — the auto-updater will just silently fail the update check.

```yaml
appId: in.kesarsecurities.crm
productName: Kesar Securities CRM
copyright: Copyright © 2026 Kesar Securities

directories:
  output: dist

files:
  - main.js
  - preload.js
  - "assets/**/*"
  - package.json

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: assets/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: false
  createDesktopShortcut: true
  createStartMenuShortcut: true
  installerIcon: assets/icon.ico
  uninstallerIcon: assets/icon.ico

publish:
  provider: github
  owner: GITHUB_OWNER
  repo: GITHUB_REPO
```

- [ ] **Step 3: Create the assets folder and add your icon**

Create the folder:
```bash
mkdir -p electron-app/assets
```

Place a 256x256 `.ico` file at `electron-app/assets/icon.ico`.

To create one from your logo (free):
1. Go to https://www.icoconverter.com
2. Upload your logo PNG
3. Select 256px size
4. Download and save as `electron-app/assets/icon.ico`

If you don't have a logo yet, **temporarily remove the `icon` lines from `electron-builder.yml`** (the `win.icon`, `nsis.installerIcon`, `nsis.uninstallerIcon` lines) and electron-builder will use its default icon. You can add your icon later.

- [ ] **Step 4: Install dependencies**

```bash
cd electron-app
npm install
```

Expected output: `added N packages` with no errors.

- [ ] **Step 5: Commit**

```bash
cd ..
git add electron-app/package.json electron-app/electron-builder.yml
git commit -m "feat: scaffold Electron app with builder config"
```

---

## Task 4: Electron preload.js — Custom Title Bar

**Files:**
- Create: `electron-app/preload.js`

The preload script runs in the renderer (web page) context on every page load. It:
1. Exposes IPC methods to the page via `contextBridge` so the title bar buttons can call main-process functions
2. Injects a fixed 32px title bar div into the DOM on `DOMContentLoaded`
3. Adds `padding-top: 32px` to `document.body` so the web content is pushed down below the bar

- [ ] **Step 1: Create `electron-app/preload.js`**

```javascript
// electron-app/preload.js
const { contextBridge, ipcRenderer } = require('electron')

// Expose window controls to the renderer (web page)
contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),
  refresh:  () => ipcRenderer.send('window-refresh'),
})

window.addEventListener('DOMContentLoaded', () => {
  // Remove any existing title bar (prevents duplicates on page reload)
  const existing = document.getElementById('electron-titlebar')
  if (existing) existing.remove()

  const bar = document.createElement('div')
  bar.id = 'electron-titlebar'
  bar.innerHTML = `
    <style>
      #electron-titlebar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 32px;
        background: #0f172a;
        display: flex;
        align-items: center;
        justify-content: space-between;
        z-index: 2147483647;
        -webkit-app-region: drag;
        user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        border-bottom: 1px solid #1e293b;
      }
      #electron-titlebar .etb-title {
        color: #64748b;
        font-size: 12px;
        padding-left: 12px;
        font-weight: 500;
        letter-spacing: 0.02em;
      }
      #electron-titlebar .etb-controls {
        display: flex;
        height: 100%;
        -webkit-app-region: no-drag;
      }
      #electron-titlebar .etb-btn {
        width: 46px;
        height: 32px;
        border: none;
        background: transparent;
        color: #64748b;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.1s, color 0.1s;
        padding: 0;
        line-height: 1;
      }
      #electron-titlebar .etb-btn:hover { background: #1e293b; color: #e2e8f0; }
      #electron-titlebar .etb-btn.etb-close:hover { background: #dc2626; color: #ffffff; }
    </style>
    <span class="etb-title">Kesar Securities CRM</span>
    <div class="etb-controls">
      <button class="etb-btn" id="etb-refresh" title="Refresh (F5)">&#8635;</button>
      <button class="etb-btn" id="etb-min"     title="Minimize">&#8722;</button>
      <button class="etb-btn" id="etb-max"     title="Maximize / Restore">&#9633;</button>
      <button class="etb-btn etb-close" id="etb-close" title="Close">&#215;</button>
    </div>
  `

  document.body.insertBefore(bar, document.body.firstChild)
  document.body.style.paddingTop = '32px'

  document.getElementById('etb-refresh').addEventListener('click', () => window.electronAPI.refresh())
  document.getElementById('etb-min').addEventListener('click',     () => window.electronAPI.minimize())
  document.getElementById('etb-max').addEventListener('click',     () => window.electronAPI.maximize())
  document.getElementById('etb-close').addEventListener('click',   () => window.electronAPI.close())
})
```

- [ ] **Step 2: Commit**

```bash
git add electron-app/preload.js
git commit -m "feat: add Electron preload with custom title bar injection"
```

---

## Task 5: Electron main.js — Main Process

**Files:**
- Create: `electron-app/main.js`

This is the heart of the Electron app. It:
- Creates the BrowserWindow and loads the CRM URL
- Registers IPC handlers for title bar button clicks
- Handles `did-finish-load` to call `/api/desktop/app-opened`
- Handles `before-quit` to call `/api/desktop/app-closed` with a 3s timeout fallback
- Sets auto-launch on Windows startup
- Registers F5 shortcut for reload
- Initialises `autoUpdater` to check GitHub Releases on startup

- [ ] **Step 1: Create `electron-app/main.js`**

```javascript
// electron-app/main.js
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')

const CRM_URL = 'https://crm.kesarsecurities.in'

let mainWindow = null
let isQuitting = false      // prevents re-entry in before-quit
let appOpenedRecorded = false  // prevents duplicate app-opened calls per process lifetime

// ─── Auto-updater config ───────────────────────────────────────────────────
autoUpdater.autoDownload = true          // download silently in background
autoUpdater.autoInstallOnAppQuit = true  // install on next quit

autoUpdater.on('update-downloaded', () => {
  // Notify the user via the web page that an update is ready
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`
      if (typeof window !== 'undefined') {
        const banner = document.createElement('div')
        banner.id = 'electron-update-banner'
        banner.innerHTML = \`
          <div style="
            position:fixed; bottom:16px; right:16px; z-index:2147483646;
            background:#0f172a; color:#e2e8f0; padding:12px 16px;
            border-radius:8px; border:1px solid #1e293b;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            font-size:13px; display:flex; align-items:center; gap:12px;
            box-shadow:0 4px 12px rgba(0,0,0,0.4);
          ">
            <span>&#10003; Update ready — restart to apply</span>
            <button onclick="window.electronAPI && window.electronAPI.close()" style="
              background:#2563eb; color:white; border:none; padding:4px 10px;
              border-radius:4px; cursor:pointer; font-size:12px;
            ">Restart</button>
          </div>
        \`
        document.body.appendChild(banner)
      }
    `).catch(() => {})
  }
})

// ─── Window creation ───────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false, // avoid white flash on startup
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
  })

  mainWindow.loadURL(CRM_URL)

  // Show window once content is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Record login when page finishes loading (handles both first load & refreshes)
  mainWindow.webContents.on('did-finish-load', () => {
    recordAppOpened()
  })

  // Also catch navigation events (e.g. redirect from /login to /dashboard after sign-in)
  mainWindow.webContents.on('did-navigate', () => {
    recordAppOpened()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── Login tracking ────────────────────────────────────────────────────────
async function recordAppOpened() {
  if (appOpenedRecorded || !mainWindow) return
  try {
    const status = await mainWindow.webContents.executeJavaScript(`
      fetch('/api/desktop/app-opened', {
        method: 'POST',
        credentials: 'include',
      }).then(r => r.status).catch(() => 0)
    `)
    if (status === 200) {
      appOpenedRecorded = true
    }
    // 401 = not logged in yet; will retry on next did-finish-load / did-navigate
  } catch {
    // Silently ignore — tracking is best-effort
  }
}

// ─── IPC handlers for title bar buttons ───────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())
ipcMain.on('window-refresh', () => mainWindow?.webContents.reload())

// ─── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Auto-launch on Windows startup (no admin rights required)
  app.setLoginItemSettings({ openAtLogin: true })

  createWindow()

  // F5 to reload
  globalShortcut.register('F5', () => {
    mainWindow?.webContents.reload()
  })

  // Check for shell updates from GitHub Releases (silently)
  try {
    autoUpdater.checkForUpdatesAndNotify()
  } catch {
    // Silently ignore if no publish config or no internet
  }
})

app.on('before-quit', async (e) => {
  if (isQuitting) return
  isQuitting = true
  e.preventDefault()

  // Record logout, but never block the quit for more than 3 seconds
  try {
    await Promise.race([
      (async () => {
        if (!mainWindow) return
        await mainWindow.webContents.executeJavaScript(`
          fetch('/api/desktop/app-closed', {
            method: 'POST',
            credentials: 'include',
          }).then(r => r.status).catch(() => 0)
        `)
      })(),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ])
  } catch {
    // Proceed regardless
  }

  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
```

- [ ] **Step 2: Commit**

```bash
git add electron-app/main.js
git commit -m "feat: add Electron main process with lifecycle tracking and auto-update"
```

---

## Task 6: Test Locally

- [ ] **Step 1: Run the app in development mode**

```bash
cd electron-app
npm start
```

Expected: A borderless window opens showing `https://crm.kesarsecurities.in/`. A dark 32px title bar appears at the top with "Kesar Securities CRM" on the left and ↻ − □ × on the right.

- [ ] **Step 2: Verify title bar controls work**

- Click ↻ → page reloads
- Press F5 → page reloads
- Click − → window minimizes
- Click □ → window maximizes / restores
- Click × → app closes

- [ ] **Step 3: Verify login tracking**

1. Open the app while already logged in
2. Check the database: `SELECT * FROM EmployeeLoginLog ORDER BY loginAt DESC LIMIT 5;`
   Expected: a new row with `logoutAt = NULL` and `loginAt ≈ now`
3. Close the app (click ×)
4. Re-check: the same row now has `logoutAt` filled in

- [ ] **Step 4: Verify session persistence**

1. Log in to the CRM in the Electron app
2. Close the app with ×
3. Reopen via `npm start`
4. Expected: you land directly on the dashboard — no login page

- [ ] **Step 5: Commit any fixes discovered during testing**

```bash
git add -p
git commit -m "fix: <describe what was fixed>"
```

---

## Task 7: Build the Windows Installer

- [ ] **Step 1: Ensure you have an icon (or remove icon lines)**

If `electron-app/assets/icon.ico` exists → proceed.

If not → open `electron-app/electron-builder.yml` and remove these three lines temporarily:
```
  icon: assets/icon.ico        ← remove from win: section
  installerIcon: assets/icon.ico   ← remove from nsis: section
  uninstallerIcon: assets/icon.ico ← remove from nsis: section
```

- [ ] **Step 2: Build the installer**

```bash
cd electron-app
npm run build
```

Expected output (last few lines):
```
  • building        target=nsis file=dist/Kesar Securities CRM Setup 1.0.0.exe
  • building        block map  blockMapFile=dist/Kesar Securities CRM Setup 1.0.0.exe.blockmap
```

The installer will be at: `electron-app/dist/Kesar Securities CRM Setup 1.0.0.exe`

- [ ] **Step 3: Test the installer**

1. Double-click `Kesar Securities CRM Setup 1.0.0.exe`
2. Windows SmartScreen appears → click "More info" → click "Run anyway" (one time only)
3. Installer runs → click Install
4. App launches automatically after install
5. Verify it appears in Start Menu as "Kesar Securities CRM"
6. Restart your PC — verify the app opens automatically on login (auto-launch)

- [ ] **Step 4: Commit build config and lock file**

```bash
cd ..
git add electron-app/package-lock.json
git commit -m "chore: add Electron package-lock"
```

---

## Task 8: Configure Auto-Update (GitHub Releases)

This task sets up automatic updates so that when you build a new version, installed apps check and download it automatically.

- [ ] **Step 1: Create or identify your GitHub repository**

You need a public GitHub repository. It can be the existing `finance-crm` repo or a new dedicated one.

If you don't have one:
1. Go to https://github.com/new
2. Create a public repository named `kesar-crm-desktop` (or any name)
3. Note your GitHub username and repo name

- [ ] **Step 2: Update `electron-builder.yml` with your GitHub details**

Open `electron-app/electron-builder.yml` and replace the last two lines:

```yaml
publish:
  provider: github
  owner: YOUR_ACTUAL_GITHUB_USERNAME
  repo: YOUR_ACTUAL_REPO_NAME
```

Example:
```yaml
publish:
  provider: github
  owner: kesarsecurities
  repo: kesar-crm-desktop
```

- [ ] **Step 3: Rebuild with updated config**

```bash
cd electron-app
npm run build
```

- [ ] **Step 4: Create your first GitHub Release**

1. Go to your GitHub repo → Releases → "Create a new release"
2. Tag: `v1.0.0`
3. Title: `Kesar Securities CRM 1.0.0`
4. Upload these files from `electron-app/dist/`:
   - `Kesar Securities CRM Setup 1.0.0.exe`
   - `Kesar Securities CRM Setup 1.0.0.exe.blockmap`
   - `latest.yml`
5. Click "Publish release"

- [ ] **Step 5: How to release future updates**

When you make changes to the Electron shell in the future:

```bash
# 1. Bump version in electron-app/package.json
#    e.g. "version": "1.0.0" → "version": "1.1.0"

# 2. Build
cd electron-app
npm run build

# 3. Create a new GitHub Release tagged v1.1.0
#    Upload the same 3 files from dist/

# Installed apps will detect the update on next start,
# download silently, and show "Restart to apply" banner.
```

- [ ] **Step 6: Commit**

```bash
cd ..
git add electron-app/electron-builder.yml
git commit -m "chore: configure auto-updater with GitHub Releases"
```

---

## Distribution Checklist

Share `electron-app/dist/Kesar Securities CRM Setup 1.0.0.exe` with employees:

- [ ] Send `.exe` file via WhatsApp / email / USB
- [ ] Tell employees: "Double-click to install. If Windows shows a warning, click **More info** then **Run anyway**. This only happens once."
- [ ] After install: app is in Start Menu + auto-opens on Windows startup
- [ ] No further action needed — web app updates reflect instantly, shell updates arrive automatically

---

## Spec Coverage Check

| Spec requirement | Covered by |
|---|---|
| Install as Windows .exe | Task 7 — electron-builder NSIS |
| Auto-launch on Windows startup | Task 5 — `app.setLoginItemSettings` |
| Persist login (30 days) | Electron cookie store (automatic) |
| Record login time on app open | Task 1 + Task 5 `recordAppOpened()` |
| Record logout time on app close | Task 2 + Task 5 `before-quit` |
| Auto-reflect web app changes | Inherent — loads live URL |
| Refresh button + F5 | Task 4 preload title bar + Task 5 globalShortcut |
| Auto-update for shell changes | Task 8 — electron-updater + GitHub Releases |
| No cost | All tools free (Electron, electron-builder, GitHub) |

// electron-app/main.js
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')

// ─── Must be called before app is ready ────────────────────────────────────
// Bypasses ALL SSL/TLS errors at the Chromium level — covers cert issues AND
// TLS handshake failures (tlsv1 alert internal error) that the certificate-error
// event alone does not catch.
app.commandLine.appendSwitch('ignore-certificate-errors')
app.commandLine.appendSwitch('ignore-ssl-errors')
app.commandLine.appendSwitch('disable-web-security')
app.commandLine.appendSwitch('allow-running-insecure-content')

// Override UA to a plain Chrome UA — some servers/CDNs block "Electron/x" UA strings
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const CRM_URL = 'https://kesar-crm.kesarsecurities.in'

let mainWindow = null
let isQuitting = false

// ─── Auto-updater ──────────────────────────────────────────────────────────
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('update-downloaded', () => {
  if (!mainWindow) return
  mainWindow.webContents.executeJavaScript(`
    (function () {
      const existing = document.getElementById('electron-update-banner')
      if (existing) return
      const banner = document.createElement('div')
      banner.id = 'electron-update-banner'
      banner.innerHTML = \`
        <div style="
          position:fixed;bottom:16px;right:16px;z-index:2147483646;
          background:#0f172a;color:#e2e8f0;padding:12px 16px;
          border-radius:8px;border:1px solid #1e293b;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          font-size:13px;display:flex;align-items:center;gap:12px;
          box-shadow:0 4px 12px rgba(0,0,0,0.4);
        ">
          <span>&#10003; Update ready &mdash; restart to apply</span>
          <button onclick="window.electronAPI&&window.electronAPI.close()" style="
            background:#2563eb;color:white;border:none;padding:4px 10px;
            border-radius:4px;cursor:pointer;font-size:12px;
          ">Restart</button>
        </div>
      \`
      document.body.appendChild(banner)
    })()
  `).catch(() => {})
})

autoUpdater.on('error', () => {
  // Silently ignore — update check is best-effort
})

// ─── Window ────────────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico')

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
  })

  mainWindow.webContents.setUserAgent(CHROME_UA)
  mainWindow.loadURL(CRM_URL)

  // Show window as soon as first paint is ready (background is dark, not white)
  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Handle load failure — show a dark retry page instead of blank screen
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return // -3 = ERR_ABORTED (redirect), not a real failure
    console.error(`[did-fail-load] code=${errorCode} desc="${errorDescription}" url="${validatedURL}"`)
    const retryPage = `data:text/html;charset=utf-8,<!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding-top:32px;box-sizing:border-box">
          <div style="text-align:center">
            <div style="font-size:48px;margin-bottom:16px">&#9888;</div>
            <h2 style="margin:0 0 8px">Could not connect</h2>
            <p style="color:#64748b;margin:0 0 8px;font-size:13px">Error ${errorCode}: ${errorDescription}</p>
            <p style="color:#64748b;margin:0 0 24px;font-size:13px">${CRM_URL}</p>
            <button id="retry-btn" style="background:#2563eb;color:white;border:none;padding:10px 24px;
              border-radius:6px;cursor:pointer;font-size:14px">Try Again</button>
          </div>
          <script>
            document.getElementById('retry-btn').onclick = function() {
              window.location.href = '${CRM_URL}'
            }
          <\/script>
        </body>
      </html>`
    mainWindow.webContents.loadURL(retryPage)
  })

  // Login tracking is handled by NextAuth signIn/signOut events in src/lib/auth.ts
  // No need to call app-opened since users always log in fresh (session cleared on close)

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── IPC handlers ──────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close',   () => app.quit())
ipcMain.on('window-refresh', () => mainWindow?.webContents.reload())

// ─── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true })

  createWindow()

  globalShortcut.register('F5',  () => mainWindow?.webContents.reload())
  globalShortcut.register('F12', () => mainWindow?.webContents.toggleDevTools())

  autoUpdater.checkForUpdatesAndNotify()
})

app.on('before-quit', (e) => {
  if (isQuitting) return
  isQuitting = true
  e.preventDefault()

  const recordAndQuit = async () => {
    try {
      await Promise.race([
        (async () => {
          if (!mainWindow) return
          // Sign out via NextAuth — this fires the signOut event (records logoutAt)
          // AND clears the session cookie so user must log in next time app opens
          await mainWindow.webContents.executeJavaScript(`
            (async () => {
              try {
                // Get CSRF token required by NextAuth signout
                const csrf = await fetch('/api/auth/csrf', { credentials: 'include' })
                  .then(r => r.json()).then(d => d.csrfToken).catch(() => null)
                if (csrf) {
                  await fetch('/api/auth/signout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'csrfToken=' + encodeURIComponent(csrf),
                    credentials: 'include',
                  })
                }
              } catch {}
            })()
          `)
        })(),
        new Promise(resolve => setTimeout(resolve, 4000)),
      ])
    } catch {
      // Proceed regardless
    }
    app.quit()
  }

  recordAndQuit().catch(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => globalShortcut.unregisterAll())

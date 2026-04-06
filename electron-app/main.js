// electron-app/main.js
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')

const CRM_URL = 'https://crm.kesarsecurities.in'

let mainWindow = null
let isQuitting = false        // prevents re-entry in before-quit
let appOpenedRecorded = false // prevents duplicate app-opened calls per process lifetime
let recordingInProgress = false

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
  // Silently ignore — update check is best-effort (no internet, no config, etc.)
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
    backgroundColor: '#0f172a', // dark background while page loads — prevents white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
  })

  mainWindow.loadURL(CRM_URL)

  // Show only after page actually renders — prevents white blank window
  mainWindow.webContents.once('did-finish-load', () => mainWindow.show())
  // Fallback: show after 10s in case page is slow
  setTimeout(() => { if (mainWindow && !mainWindow.isVisible()) mainWindow.show() }, 10000)

  // Handle failed page load — show retry page instead of blank white screen
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode === -3) return // aborted (e.g. redirect), not a real failure
    mainWindow.webContents.loadURL(`data:text/html;charset=utf-8,
      <html style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <div style="font-size:48px;margin-bottom:16px">&#9888;</div>
          <h2 style="margin:0 0 8px">Could not connect</h2>
          <p style="color:#64748b;margin:0 0 24px">${errorDescription}</p>
          <button onclick="window.location.href='${CRM_URL}'" style="background:#2563eb;color:white;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px">
            Try Again
          </button>
        </div>
      </html>
    `)
    mainWindow.show()
  })

  mainWindow.webContents.on('did-finish-load', () => recordAppOpened())
  mainWindow.webContents.on('did-navigate',    () => recordAppOpened())

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── Login tracking ────────────────────────────────────────────────────────
async function recordAppOpened() {
  if (appOpenedRecorded || recordingInProgress || !mainWindow) return
  recordingInProgress = true
  try {
    const status = await mainWindow.webContents.executeJavaScript(`
      fetch('/api/desktop/app-opened', {
        method: 'POST',
        credentials: 'include',
      }).then(r => r.status).catch(() => 0)
    `)
    if (status === 200) appOpenedRecorded = true
  } catch {
    // Silently ignore — tracking is best-effort
  } finally {
    recordingInProgress = false
  }
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
// Bypass SSL certificate errors — the hosted server has an internal SSL issue
// that Chromium rejects but browsers accept. Safe for an internal tool.
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault()
  callback(true)
})

app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true })

  createWindow()

  globalShortcut.register('F5', () => mainWindow?.webContents.reload())
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
  }

  recordAndQuit().catch(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => globalShortcut.unregisterAll())

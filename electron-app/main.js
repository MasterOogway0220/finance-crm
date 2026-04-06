// electron-app/main.js
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')

const CRM_URL = 'https://crm.kesarsecurities.in'

let mainWindow = null
let isQuitting = false        // prevents re-entry in before-quit
let appOpenedRecorded = false // prevents duplicate app-opened calls per process lifetime

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

// ─── Window ────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
  })

  mainWindow.loadURL(CRM_URL)

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.on('did-finish-load', () => recordAppOpened())
  mainWindow.webContents.on('did-navigate',    () => recordAppOpened())

  mainWindow.on('closed', () => { mainWindow = null })
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
    if (status === 200) appOpenedRecorded = true
    // 401 = not logged in yet; retries on next did-finish-load / did-navigate
  } catch {
    // Silently ignore — tracking is best-effort
  }
}

// ─── IPC handlers ──────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close',   () => mainWindow?.close())
ipcMain.on('window-refresh', () => mainWindow?.webContents.reload())

// ─── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true })

  createWindow()

  globalShortcut.register('F5', () => mainWindow?.webContents.reload())

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

app.on('will-quit', () => globalShortcut.unregisterAll())

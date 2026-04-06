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

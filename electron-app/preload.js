// electron-app/preload.js
const PRODUCT_NAME = 'Kesar Securities CRM'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),
  refresh:  () => ipcRenderer.send('window-refresh'),
})

function injectTitleBar() {
  // Already present and attached to DOM — skip
  if (document.getElementById('electron-titlebar')) return

  // Inject styles once
  if (!document.getElementById('electron-titlebar-style')) {
    const style = document.createElement('style')
    style.id = 'electron-titlebar-style'
    style.textContent = `
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
        color: #ffffff;
        font-size: 12px;
        padding-left: 12px;
        font-weight: 700;
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
        color: #ffffff;
        cursor: pointer;
        font-size: 16px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.1s, color 0.1s;
        padding: 0;
        line-height: 1;
        -webkit-app-region: no-drag;
        pointer-events: auto;
      }
      #electron-titlebar .etb-btn:hover { background: #1e293b; color: #ffffff; }
      #electron-titlebar .etb-btn.etb-close:hover { background: #dc2626; color: #ffffff; }

      /* Push fixed sidebar down to clear the 32px electron title bar */
      .fixed.inset-y-0.left-0 {
        top: 32px !important;
      }
      /* Push mobile backdrop down too */
      .fixed.inset-0 {
        top: 32px !important;
      }
      /* Push sticky topbar down so it sticks below the electron title bar */
      .sticky.top-0 {
        top: 32px !important;
      }
    `
    document.head.appendChild(style)
  }

  const bar = document.createElement('div')
  bar.id = 'electron-titlebar'
  bar.innerHTML = `
    <span class="etb-title">${PRODUCT_NAME}</span>
    <div class="etb-controls">
      <button class="etb-btn" id="etb-refresh" title="Refresh (F5)">&#8635;</button>
      <button class="etb-btn" id="etb-min"     title="Minimize">&#8722;</button>
      <button class="etb-btn" id="etb-max"     title="Maximize / Restore">&#9633;</button>
      <button class="etb-btn etb-close" id="etb-close" title="Close">&#215;</button>
    </div>
  `

  document.body.insertBefore(bar, document.body.firstChild)
  document.documentElement.style.paddingTop = '32px'

  document.getElementById('etb-refresh')?.addEventListener('click', () => ipcRenderer.send('window-refresh'))
  document.getElementById('etb-min')?.addEventListener('click',     () => ipcRenderer.send('window-minimize'))
  document.getElementById('etb-max')?.addEventListener('click',     () => ipcRenderer.send('window-maximize'))
  document.getElementById('etb-close')?.addEventListener('click',   () => ipcRenderer.send('window-close'))
}

window.addEventListener('DOMContentLoaded', () => {
  injectTitleBar()

  // Watch for Next.js removing our title bar during client-side navigation / hydration
  const observer = new MutationObserver(() => {
    if (!document.getElementById('electron-titlebar')) {
      injectTitleBar()
    }
    // Keep paddingTop in case Next.js resets it
    if (document.documentElement.style.paddingTop !== '32px') {
      document.documentElement.style.paddingTop = '32px'
    }
  })

  observer.observe(document.body, { childList: true, subtree: false })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
})

'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type ElectronAPI = { isDesktopApp?: boolean; startWhatsapp?: () => void; stopWhatsapp?: () => void }
function electron(): ElectronAPI | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI ?? null
}

export interface SessionGroup { id: string; title: string; canSend: boolean }
export interface SessionData { state: string; qr: string | null; groups: SessionGroup[] }

const LABEL: Record<string, { text: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  CONNECTED: { text: 'Connected', variant: 'secondary' },
  QR: { text: 'Scan the QR', variant: 'outline' },
  CONNECTING: { text: 'Connecting…', variant: 'outline' },
  DISCONNECTED: { text: 'Disconnected', variant: 'destructive' },
}

export function ConnectPanel({ onSession }: { onSession: (data: SessionData) => void }) {
  const [data, setData] = useState<SessionData>({ state: 'DISCONNECTED', qr: null, groups: [] })
  const onSessionRef = useRef(onSession)
  useEffect(() => { onSessionRef.current = onSession }, [onSession])
  const lastSigRef = useRef('')

  useEffect(() => {
    let alive = true
    const poll = () =>
      fetch('/api/whatsapp/session')
        .then((r) => r.json())
        .then((d) => {
          if (!alive || !d.success) return
          const next: SessionData = { state: d.data.state, qr: d.data.qr ?? null, groups: d.data.groups ?? [] }
          // Only re-render / notify the parent when something actually changed — the panel
          // polls every 3s and the groups array is a fresh reference each time.
          const sig = next.state + '|' + (next.qr ? '1' : '0') + '|' + JSON.stringify(next.groups)
          if (sig === lastSigRef.current) return
          lastSigRef.current = sig
          setData(next)
          onSessionRef.current(next)
        })
        .catch(() => {})
    poll()
    const id = setInterval(poll, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const s = LABEL[data.state] ?? LABEL.DISCONNECTED

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">WhatsApp connection <Badge variant={s.variant}>{s.text}</Badge></CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.state === 'CONNECTED' ? (
          <div className="space-y-2">
            <p className="text-sm text-green-700">Linked and ready — queued messages will send from this PC.</p>
            {electron()?.isDesktopApp && (
              <button
                onClick={() => electron()?.stopWhatsapp?.()}
                className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Disconnect
              </button>
            )}
          </div>
        ) : data.qr ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Scan to link the sending phone:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.qr} alt="WhatsApp QR code" className="h-56 w-56 rounded border bg-white p-2" />
            <p className="text-xs text-muted-foreground">
              On the sending phone: WhatsApp → <b>Linked devices</b> → <b>Link a device</b> → point the camera at this code.
            </p>
          </div>
        ) : electron()?.isDesktopApp ? (
          <div className="space-y-3">
            <p className="text-sm">
              Click connect, then scan the QR that appears here with the sending phone
              (WhatsApp → <b>Linked devices</b> → <b>Link a device</b>).
            </p>
            <button
              onClick={() => electron()?.startWhatsapp?.()}
              className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Connect WhatsApp
            </button>
            <p className="text-xs text-muted-foreground">
              {data.state === 'CONNECTING' ? 'Starting up… the QR will appear in a few seconds.' : 'Not linked yet.'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open the <b>Kesar Securities CRM desktop app</b> on the office PC to connect WhatsApp, then click <b>Connect</b> and scan the QR.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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
          <p className="text-sm text-green-700">Linked and ready — queued messages will send from the office PC.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Link the sending WhatsApp number by scanning the QR below. The office-PC worker must be running for a QR to appear.
            </p>
            {data.qr ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">Scan this QR (WhatsApp → Linked devices → Link a device):</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.qr} alt="WhatsApp QR code" className="h-56 w-56 rounded border bg-white p-2" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Waiting for the office-PC worker to start and emit a QR. (To link by phone number instead, use the worker&apos;s <code>linkCode</code> option — the code shows in the worker window.)
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

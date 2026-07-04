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
        ) : data.qr ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Scan to link the sending phone:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.qr} alt="WhatsApp QR code" className="h-56 w-56 rounded border bg-white p-2" />
            <p className="text-xs text-muted-foreground">
              On the sending phone: WhatsApp → <b>Linked devices</b> → <b>Link a device</b> → point the camera at this code.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">
              Sending runs from the <b>office PC</b>, not this website — WhatsApp automation can&apos;t run on the server, so
              there&apos;s no &ldquo;connect&rdquo; button here. The QR appears below once the office PC is running. To connect:
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li><span className="font-medium text-foreground">First time only:</span> on the office PC, run <code className="rounded bg-muted px-1">cd worker</code> then <code className="rounded bg-muted px-1">npm install</code>.</li>
              <li>Start the worker: <code className="rounded bg-muted px-1">npm start</code>. Leave that window open.</li>
              <li>A QR code appears here within a few seconds — keep this page open.</li>
              <li>On the sending phone: WhatsApp → <b>Linked devices</b> → <b>Link a device</b> → scan it.</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              {data.state === 'CONNECTING'
                ? 'Office PC is starting up… waiting for the QR to appear.'
                : 'Status: not linked. This badge turns green automatically once the phone is linked — no action needed here.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

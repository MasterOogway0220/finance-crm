'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export interface SessionGroup { id: string; title: string; canSend: boolean }
export interface SessionData { state: string; qr: string | null; linkCode: string | null; groups: SessionGroup[] }

const LABEL: Record<string, { text: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  CONNECTED: { text: 'Connected', variant: 'secondary' },
  QR: { text: 'Scan the QR', variant: 'outline' },
  PAIRING: { text: 'Enter the code', variant: 'outline' },
  CONNECTING: { text: 'Connecting…', variant: 'outline' },
  DISCONNECTED: { text: 'Disconnected', variant: 'destructive' },
}

export function ConnectPanel({ onSession }: { onSession: (data: SessionData) => void }) {
  const [data, setData] = useState<SessionData>({ state: 'DISCONNECTED', qr: null, linkCode: null, groups: [] })
  const [phone, setPhone] = useState('')
  const [linking, setLinking] = useState(false)
  const onSessionRef = useRef(onSession)
  onSessionRef.current = onSession

  useEffect(() => {
    let alive = true
    const poll = () =>
      fetch('/api/whatsapp/session')
        .then((r) => r.json())
        .then((d) => { if (alive && d.success) { setData(d.data); onSessionRef.current(d.data) } })
        .catch(() => {})
    poll()
    const id = setInterval(poll, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const link = async () => {
    setLinking(true)
    try {
      const d = await (await fetch('/api/whatsapp/session/link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
      })).json()
      if (d.success) { toast.success('Requested. Restart the office-PC worker if needed; the code appears here or in the worker window.'); setPhone('') }
      else toast.error(d.error || 'Failed to request link')
    } catch { toast.error('Failed to request link') } finally { setLinking(false) }
  }

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
              Link the sending WhatsApp number once. The office-PC worker must be running for a QR / code to appear.
            </p>
            {data.qr && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Scan this QR (WhatsApp → Linked devices → Link a device):</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.qr} alt="WhatsApp QR code" className="h-56 w-56 rounded border bg-white p-2" />
              </div>
            )}
            {data.linkCode && (
              <p className="text-sm">
                Or enter this code in WhatsApp → Linked devices → Link with phone number:{' '}
                <b className="font-mono tracking-widest">{data.linkCode}</b>
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Link with phone number instead</label>
                <Input className="w-56" placeholder="e.g. 9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <Button size="sm" variant="outline" onClick={link} disabled={linking || phone.trim().length === 0}>
                {linking ? 'Requesting…' : 'Request code'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

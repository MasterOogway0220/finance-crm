'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trash2, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/use-debounce'

interface OptOut { id: string; phone: string; source: 'STOP' | 'MANUAL'; reason: string | null; createdAt: string }

export function OptOutManager({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [items, setItems] = useState<OptOut[]>([])
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 400)
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    const q = search ? `?search=${encodeURIComponent(search)}` : ''
    fetch(`/api/whatsapp/opt-outs${q}`).then((r) => r.json()).then((d) => { if (d.success) setItems(d.data.optOuts) }).catch(() => {})
  }, [search])
  useEffect(() => { if (open) load() }, [open, load])

  const add = async () => {
    if (!phone.trim()) { toast.error('Enter a phone number'); return }
    setAdding(true)
    try {
      const d = await (await fetch('/api/whatsapp/opt-outs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, reason }),
      })).json()
      if (d.success) { toast.success('Added to Do-Not-Contact'); setPhone(''); setReason(''); load() }
      else toast.error(d.error || 'Failed to add')
    } catch { toast.error('Failed to add') } finally { setAdding(false) }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Remove this number from Do-Not-Contact? They may be messaged again.')) return
    setBusyId(id)
    try {
      const d = await (await fetch(`/api/whatsapp/opt-outs/${id}`, { method: 'DELETE' })).json()
      if (d.success) { toast.success('Removed'); load() } else toast.error(d.error || 'Failed to remove')
    } catch { toast.error('Failed to remove') } finally { setBusyId(null) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Do-Not-Contact list</DialogTitle>
          <DialogDescription>These numbers are never messaged. People who reply STOP are added automatically.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add a number</div>
          <div className="flex flex-wrap gap-2">
            <Input className="w-48" placeholder="Phone e.g. 9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input className="flex-1 min-w-40" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" onClick={add} disabled={adding}>{adding ? 'Adding…' : 'Add'}</Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search phone or reason…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <div className="space-y-1">
          <div className="text-sm font-medium">Numbers ({items.length})</div>
          {items.length === 0 && <p className="text-sm text-muted-foreground">No opted-out numbers.</p>}
          {items.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{o.phone}</span>
                <Badge variant={o.source === 'STOP' ? 'secondary' : 'outline'}>{o.source}</Badge>
                {o.reason && <span className="text-xs text-muted-foreground">{o.reason}</span>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(o.id)} disabled={busyId === o.id} aria-label="Remove"><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

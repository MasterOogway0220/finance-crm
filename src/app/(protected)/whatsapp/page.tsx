'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useActiveRoleStore } from '@/stores/active-role-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MessageCircle, Search, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/use-debounce'
import { parseManualRecipients } from '@/lib/whatsapp-recipients'
import { TemplatesManager } from '@/components/whatsapp/templates-manager'
import { ConnectPanel, type SessionGroup } from '@/components/whatsapp/connect-panel'

const SEGMENTS = [
  { value: 'all', label: 'All inactive' },
  { value: 'equity', label: 'Equity — not traded' },
  { value: 'mf', label: 'MF — inactive' },
  { value: 'dormant2m', label: 'Dormant 2+ months (equity)' },
]

const DEFAULT_TEMPLATE =
  `Hi {{name}}, this is Kesar Securities. We noticed it's been a while since your last activity. ` +
  `We'd love to help you get back on track with your investments — reply to this message and our team will assist you.\n\nReply STOP to opt out.`

interface AudienceClient { id: string; clientCode: string; name: string; phone: string | null; department: string }
interface CampaignSummary { campaignId: string; total: number; pending: number; sent: number; failed: number; skipped: number; createdAt: string | null }

const LIMIT = 25

export default function WhatsAppOutreachPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const activeRole = useActiveRoleStore((s) => s.activeRole)
  const hasHydrated = useActiveRoleStore((s) => s.hasHydrated)

  // Gate on the ACTIVE role (what the API enforces via getActiveRole + the sidebar
  // uses), not the raw max-privilege role — so an ADMIN acting as CA is redirected
  // instead of landing on a page whose fetches all 403. Wait for the role store to
  // hydrate first, else activeRole='' falls back to the primary role and mis-gates.
  useEffect(() => {
    if (!hasHydrated || !session?.user) return
    const effectiveRole = activeRole || session.user.role
    if (!['ADMIN', 'SUPER_ADMIN', 'MARKETING'].includes(effectiveRole)) {
      router.replace('/dashboard')
    }
  }, [hasHydrated, session, activeRole, router])

  const [status, setStatus] = useState<{ sentToday: number; pendingTotal: number; campaigns: CampaignSummary[] } | null>(null)
  const refreshStatus = useCallback(() => {
    fetch('/api/whatsapp/campaigns').then((r) => r.json()).then((d) => { if (d.success) setStatus(d.data) }).catch(() => {})
  }, [])
  useEffect(() => { refreshStatus() }, [refreshStatus])

  const [segment, setSegment] = useState('all')
  const [scope, setScope] = useState<'all' | 'inactive'>('all')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 400)
  const [clients, setClients] = useState<AudienceClient[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectingAll, setSelectingAll] = useState(false)

  useEffect(() => { setPage(1) }, [segment, search, scope])
  // Selection is scoped to the current filter (client id-sets differ per scope/segment);
  // clearing it on scope/segment change prevents queuing recipients no longer visible.
  useEffect(() => { setSelected(new Set()) }, [segment, scope])

  const reqIdRef = useRef(0)
  useEffect(() => {
    if (!hasHydrated) return
    const reqId = ++reqIdRef.current
    setLoading(true)
    const params = new URLSearchParams({ segment, scope, page: String(page), limit: String(LIMIT) })
    if (search) params.set('search', search)
    fetch(`/api/whatsapp/audience?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (reqId !== reqIdRef.current) return // a newer request superseded this one
        if (d.success) { setClients(d.data.clients); setTotal(d.data.total) }
        else { setClients([]); setTotal(0); toast.error(d.error || 'Failed to load audience') }
      })
      .catch(() => {
        if (reqId !== reqIdRef.current) return
        setClients([]); setTotal(0); toast.error('Failed to load audience')
      })
      .finally(() => { if (reqId === reqIdRef.current) setLoading(false) })
  }, [segment, search, page, scope, hasHydrated])

  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const pageAllSelected = clients.length > 0 && clients.every((c) => selected.has(c.id))
  const togglePage = () => setSelected((prev) => {
    const next = new Set(prev)
    if (pageAllSelected) clients.forEach((c) => next.delete(c.id))
    else clients.forEach((c) => next.add(c.id))
    return next
  })

  const selectAllMatching = async () => {
    setSelectingAll(true)
    const reqAtStart = reqIdRef.current
    try {
      const params = new URLSearchParams({ segment, scope, idsOnly: 'true' })
      if (search) params.set('search', search)
      const d = await (await fetch(`/api/whatsapp/audience?${params}`)).json()
      if (reqIdRef.current !== reqAtStart) return // filter changed mid-flight — ignore stale ids
      if (d.success) { setSelected(new Set<string>(d.data.ids)); toast.success(`Selected ${d.data.ids.length} matching clients`) }
      else toast.error(d.error || 'Failed to select all')
    } catch { toast.error('Failed to select all') } finally { setSelectingAll(false) }
  }

  const clearSelection = () => setSelected(new Set())

  const [message, setMessage] = useState(DEFAULT_TEMPLATE)
  const preview = message.replaceAll('{{name}}', 'Rahul')

  const [manualText, setManualText] = useState('')
  const manual = useMemo(() => parseManualRecipients(manualText), [manualText])

  const [sessionState, setSessionState] = useState('DISCONNECTED')
  const [groups, setGroups] = useState<SessionGroup[]>([])
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())

  const recipientCount = selected.size + manual.valid.length + selectedGroups.size

  const [templates, setTemplates] = useState<{ id: string; name: string; body: string }[]>([])
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const loadTemplates = useCallback(() => {
    fetch('/api/whatsapp/templates').then((r) => r.json()).then((d) => { if (d.success) setTemplates(d.data.templates) }).catch(() => {})
  }, [])
  useEffect(() => { loadTemplates() }, [loadTemplates])

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [queueing, setQueueing] = useState(false)
  const submit = async () => {
    setQueueing(true)
    try {
      const d = await (await fetch('/api/whatsapp/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientIds: [...selected], manualRecipients: manual.valid, groupIds: [...selectedGroups], message }),
      })).json()
      if (d.success) {
        const missing = d.data.skippedMissing ? `, ${d.data.skippedMissing} missing` : ''
        toast.success(`Queued ${d.data.queued} (skipped ${d.data.skippedInvalid} invalid, ${d.data.skippedDuplicate} duplicate${missing})`)
        clearSelection(); setManualText(''); setSelectedGroups(new Set()); refreshStatus()
      } else toast.error(d.error || 'Failed to queue campaign')
    } catch { toast.error('Failed to queue campaign') } finally { setQueueing(false); setConfirmOpen(false) }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-6 w-6 text-green-600" />
        <h1 className="text-2xl font-bold">WhatsApp Outreach</h1>
      </div>

      <ConnectPanel onSession={(d) => { setSessionState(d.state); setGroups(d.groups) }} />
      {sessionState !== 'CONNECTED' && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          WhatsApp isn&apos;t connected yet — you can still queue; messages send once the office-PC worker is linked and running.
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Queue status</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>Sent today: <b>{status?.sentToday ?? '—'}</b></span>
            <span>Pending in queue: <b>{status?.pendingTotal ?? '—'}</b></span>
          </div>
          <p className="text-xs text-muted-foreground">
            Messages are sent by the office-PC worker at ~30/day during office hours (10:00–16:00).
          </p>
          {status && status.campaigns.length > 0 && (
            <div className="space-y-1">
              {status.campaigns.slice(0, 5).map((c) => (
                <div key={c.campaignId} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</span>
                  <span>· {c.total} total</span>
                  <Badge variant="secondary">{c.sent} sent</Badge>
                  <Badge variant="outline">{c.pending} pending</Badge>
                  {c.failed > 0 && <Badge variant="destructive">{c.failed} failed</Badge>}
                  {c.skipped > 0 && <Badge variant="outline">{c.skipped} skipped</Badge>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Audience</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={scope} onValueChange={(v) => setScope(v as 'all' | 'inactive')}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                <SelectItem value="inactive">Inactive segments</SelectItem>
              </SelectContent>
            </Select>
            {scope === 'inactive' && (
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search code, name, phone…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{total} matching · {selected.size} selected</span>
            <Button variant="outline" size="sm" onClick={selectAllMatching} disabled={selectingAll || total === 0}>
              {selectingAll ? 'Selecting…' : `Select all ${total} matching`}
            </Button>
            {selected.size > 0 && <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>}
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={pageAllSelected} onCheckedChange={togglePage} aria-label="Select page" /></TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Dept</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                ) : clients.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No matching clients</TableCell></TableRow>
                ) : clients.map((c) => (
                  <TableRow key={c.id} data-state={selected.has(c.id) ? 'selected' : undefined}>
                    <TableCell><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} aria-label={`Select ${c.clientCode}`} /></TableCell>
                    <TableCell className="font-mono text-xs">{c.clientCode}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.phone ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline">{c.department === 'EQUITY' ? 'Equity' : 'MF'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Add numbers manually</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={4}
            placeholder={'One per line: 9876543210  or  9876543210, Rahul'}
          />
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{manual.valid.length} valid number{manual.valid.length === 1 ? '' : 's'}</span>
            {manual.invalidLines.length > 0 && (
              <span className="text-red-600">{manual.invalidLines.length} invalid: {manual.invalidLines.slice(0, 3).join('; ')}{manual.invalidLines.length > 3 ? '…' : ''}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {groups.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">WhatsApp groups</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">Send to whole groups the connected number is in — everyone in the group receives the message.</p>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedGroups.has(g.id)}
                    disabled={!g.canSend}
                    onCheckedChange={() => setSelectedGroups((prev) => {
                      const n = new Set(prev)
                      if (n.has(g.id)) n.delete(g.id)
                      else n.add(g.id)
                      return n
                    })}
                  />
                  <span>{g.title}{!g.canSend && <span className="text-muted-foreground"> (can&apos;t send)</span>}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Compose message</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value="" onValueChange={(id) => { const t = templates.find((x) => x.id === id); if (t) setMessage(t.body) }}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Load a template…" /></SelectTrigger>
              <SelectContent>
                {templates.length === 0
                  ? <SelectItem value="none" disabled>No templates yet</SelectItem>
                  : templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}>Manage templates</Button>
          </div>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} placeholder="Type your message… use {{name}} for the client's first name" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Use <code>{'{{name}}'}</code> to insert the client&apos;s first name.</span>
            <span>{message.length} chars</span>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
            <span className="text-xs text-muted-foreground block mb-1">Preview (name → Rahul):</span>
            {preview}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground">{recipientCount} recipient{recipientCount === 1 ? '' : 's'}</span>
        <Button onClick={() => setConfirmOpen(true)} disabled={recipientCount === 0 || message.trim().length === 0}>
          <Send className="h-4 w-4 mr-2" /> Queue Campaign
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Queue {recipientCount} messages?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll be sent by the office-PC worker at ~30/day during office hours (10:00–16:00). Invalid or duplicate numbers are skipped automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={queueing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); submit() }} disabled={queueing}>
              {queueing ? 'Queuing…' : 'Queue Campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TemplatesManager
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        templates={templates}
        reload={loadTemplates}
        currentMessage={message}
        onUse={(body) => setMessage(body)}
      />
    </div>
  )
}

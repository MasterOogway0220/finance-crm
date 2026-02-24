'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Search, Download, CalendarIcon, Users } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, getInitials, cn } from '@/lib/utils'
import { ClientWithOperator } from '@/types'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'TRADED', label: 'Traded' },
  { value: 'NOT_TRADED', label: 'Not Traded' },
]

const REMARK_OPTIONS = [
  { value: 'all', label: 'All Remarks' },
  { value: 'SUCCESSFULLY_TRADED', label: 'Successfully Traded' },
  { value: 'NOT_TRADED', label: 'Not Traded' },
  { value: 'NO_FUNDS_FOR_TRADING', label: 'No Funds for Trading' },
  { value: 'DID_NOT_ANSWER', label: 'Did Not Answer' },
  { value: 'SELF_TRADING', label: 'Self Trading' },
]

function StatusSelect({ clientId, value, onChange }: { clientId: string; value: string; onChange: (id: string, status: string, remark?: string) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(clientId, v, v === 'TRADED' ? 'SUCCESSFULLY_TRADED' : undefined)}>
      <SelectTrigger className={cn('h-7 text-xs w-28', value === 'TRADED' ? 'border-green-400 text-green-700' : 'border-red-300 text-red-600')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="TRADED">Traded</SelectItem>
        <SelectItem value="NOT_TRADED">Not Traded</SelectItem>
      </SelectContent>
    </Select>
  )
}

function RemarkSelect({ clientId, value, onChange }: { clientId: string; value: string; onChange: (id: string, remark: string) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(clientId, v)}>
      <SelectTrigger className="h-7 text-xs w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {REMARK_OPTIONS.slice(1).map((r) => (
          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function EquityClientsPage() {
  const [clients, setClients] = useState<ClientWithOperator[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [remark, setRemark] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const limit = 25

  const fetchClients = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    if (search) params.set('search', search)
    if (status !== 'all') params.set('status', status)
    if (remark !== 'all') params.set('remark', remark)
    fetch(`/api/clients?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) { setClients(d.data.clients); setTotal(d.data.total) }
      })
      .finally(() => setLoading(false))
  }, [search, status, remark, page])

  useEffect(() => {
    const t = setTimeout(fetchClients, 300)
    return () => clearTimeout(t)
  }, [fetchClients])

  const updateClient = async (id: string, updates: Record<string, unknown>) => {
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (data.success) {
      setClients((prev) => prev.map((c) => c.id === id ? { ...c, ...data.data } : c))
      toast.success('Client updated')
    } else {
      toast.error(data.error || 'Update failed')
    }
  }

  const handleStatusChange = (id: string, newStatus: string, autoRemark?: string) => {
    const updates: Record<string, unknown> = { status: newStatus }
    if (autoRemark) updates.remark = autoRemark
    updateClient(id, updates)
  }

  const handleRemarkChange = (id: string, newRemark: string) => {
    updateClient(id, { remark: newRemark })
  }

  const handleNotesSave = (id: string, notes: string) => {
    updateClient(id, { notes })
  }

  const handleFollowUpChange = (id: string, date: Date | undefined) => {
    updateClient(id, { followUpDate: date ? date.toISOString() : null })
  }

  const handleBulkUpdate = async (updates: Record<string, unknown>) => {
    if (selected.size === 0) return
    const res = await fetch('/api/clients/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientIds: Array.from(selected), ...updates }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success(`Updated ${selected.size} clients`)
      setSelected(new Set())
      fetchClients()
    } else {
      toast.error(data.error)
    }
  }

  const handleExport = () => {
    const params = new URLSearchParams()
    if (status !== 'all') params.set('status', status)
    if (remark !== 'all') params.set('remark', remark)
    if (search) params.set('search', search)
    window.open(`/api/clients/export?${params}`, '_blank')
  }

  const totalPages = Math.ceil(total / limit)
  const allSelected = clients.length > 0 && selected.size === clients.length

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Clients</h1>
        <p className="text-sm text-gray-500">Manage your client trading status</p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search by code, name, or phone…" className="pl-9 h-9 text-sm" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={remark} onValueChange={(v) => { setRemark(v); setPage(1) }}>
            <SelectTrigger className="w-48 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REMARK_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {selected.size > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleBulkUpdate({ status: 'TRADED', remark: 'SUCCESSFULLY_TRADED' })}>
                Mark Traded ({selected.size})
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkUpdate({ status: 'NOT_TRADED', remark: 'DID_NOT_ANSWER' })}>
                Mark Not Traded ({selected.size})
              </Button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={handleExport} className="ml-auto gap-1.5">
            <Download className="h-3.5 w-3.5" />Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => {
                    if (v) setSelected(new Set(clients.map((c) => c.id)))
                    else setSelected(new Set())
                  }}
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Code</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Contact</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Remark</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Follow-up</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide min-w-[150px]">Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
              ))
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No clients found</p>
                </td>
              </tr>
            ) : clients.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                selected={selected.has(client.id)}
                onSelect={(id, v) => setSelected((prev) => { const s = new Set(prev); v ? s.add(id) : s.delete(id); return s })}
                onStatusChange={handleStatusChange}
                onRemarkChange={handleRemarkChange}
                onNotesSave={handleNotesSave}
                onFollowUpChange={handleFollowUpChange}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>{total} clients · Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientRow({ client, selected, onSelect, onStatusChange, onRemarkChange, onNotesSave, onFollowUpChange }: {
  client: ClientWithOperator
  selected: boolean
  onSelect: (id: string, v: boolean) => void
  onStatusChange: (id: string, status: string, remark?: string) => void
  onRemarkChange: (id: string, remark: string) => void
  onNotesSave: (id: string, notes: string) => void
  onFollowUpChange: (id: string, date: Date | undefined) => void
}) {
  const [notes, setNotes] = useState(client.notes || '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [followUp, setFollowUp] = useState<Date | undefined>(
    client.followUpDate ? new Date(client.followUpDate) : undefined
  )

  const rowClass = cn(
    'border-b border-gray-100 hover:bg-blue-50 transition-colors',
    client.status === 'TRADED' ? 'bg-green-50' :
    client.remark === 'NO_FUNDS_FOR_TRADING' ? 'bg-yellow-50' : 'bg-white'
  )

  return (
    <tr className={rowClass}>
      <td className="px-4 py-3">
        <Checkbox checked={selected} onCheckedChange={(v) => onSelect(client.id, !!v)} />
      </td>
      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{client.clientCode}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
            {getInitials([client.firstName, client.lastName].join(' '))}
          </div>
          <span className="font-medium text-gray-800">{[client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ')}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-gray-600 text-xs">
        <a href={`tel:${client.phone}`} className="hover:text-blue-600">{client.phone}</a>
      </td>
      <td className="px-4 py-3">
        <StatusSelect clientId={client.id} value={client.status} onChange={onStatusChange} />
      </td>
      <td className="px-4 py-3">
        <RemarkSelect clientId={client.id} value={client.remark} onChange={onRemarkChange} />
      </td>
      <td className="px-4 py-3">
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn('flex items-center gap-1 text-xs', followUp ? 'text-blue-600 font-medium' : 'text-gray-400 hover:text-blue-500')}>
              <CalendarIcon className="h-3 w-3" />
              {followUp ? formatDate(followUp) : 'Set date'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={followUp}
              onSelect={(d) => { setFollowUp(d); onFollowUpChange(client.id, d) }}
            />
            {followUp && (
              <div className="p-2 border-t">
                <Button size="sm" variant="ghost" className="w-full text-red-500 text-xs" onClick={() => { setFollowUp(undefined); onFollowUpChange(client.id, undefined) }}>
                  Clear date
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </td>
      <td className="px-4 py-3">
        {editingNotes ? (
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => { setEditingNotes(false); if (notes !== client.notes) onNotesSave(client.id, notes) }}
            autoFocus
            className="w-full text-xs border rounded px-1.5 py-1 outline-none focus:border-blue-400"
          />
        ) : (
          <button
            onClick={() => setEditingNotes(true)}
            className="text-xs text-gray-500 hover:text-blue-600 text-left max-w-[130px] truncate block"
            title={notes}
          >
            {notes || <span className="text-gray-300 italic">Click to add</span>}
          </button>
        )}
      </td>
    </tr>
  )
}

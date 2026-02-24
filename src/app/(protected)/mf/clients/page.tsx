'use client'
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Search, Download, CalendarIcon, Users } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, cn } from '@/lib/utils'
import { ClientWithOperator } from '@/types'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

const REMARK_OPTIONS = [
  { value: 'all', label: 'All Remarks' },
  { value: 'INVESTMENT_DONE', label: 'Investment Done' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'NOT_INTERESTED', label: 'Not Interested' },
  { value: 'DID_NOT_ANSWER', label: 'Did Not Answer' },
  { value: 'FOLLOW_UP_REQUIRED', label: 'Follow-up Required' },
]

export default function MFClientsPage() {
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
    params.set('department', 'MUTUAL_FUND')
    if (search) params.set('search', search)
    if (status !== 'all') params.set('mfStatus', status)
    if (remark !== 'all') params.set('mfRemark', remark)
    fetch(`/api/clients?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) { setClients(d.data.clients); setTotal(d.data.total) } })
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

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Clients</h1>
        <p className="text-sm text-gray-500">Manage your mutual fund clients</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search clients..." className="pl-9 h-9" />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={remark} onValueChange={(v) => { setRemark(v); setPage(1) }}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{REMARK_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => window.open(`/api/clients/export?department=MUTUAL_FUND`, '_blank')} className="ml-auto gap-1.5">
          <Download className="h-3.5 w-3.5" />Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Code</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Contact</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Remark</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Follow-up</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide min-w-[150px]">Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-3 py-2"><Skeleton className="h-8 w-full" /></td></tr>
              ))
            ) : clients.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-12 text-center text-gray-400">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No clients found</p>
              </td></tr>
            ) : clients.map((client) => (
              <MFClientRow key={client.id} client={client} onUpdate={updateClient} />
            ))}
          </tbody>
        </table>
      </div>

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

function MFClientRow({ client, onUpdate }: { client: ClientWithOperator; onUpdate: (id: string, updates: Record<string, unknown>) => void }) {
  const [notes, setNotes] = useState(client.notes || '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [followUp, setFollowUp] = useState<Date | undefined>(client.followUpDate ? new Date(client.followUpDate) : undefined)

  return (
    <tr className={cn('border-b border-gray-100 hover:bg-blue-50 transition-colors', client.mfStatus === 'ACTIVE' ? 'bg-green-50' : 'bg-white')}>
      <td className="px-3 py-2 font-mono text-xs font-medium text-gray-700">{client.clientCode}</td>
      <td className="px-3 py-2 text-gray-800 font-medium">{[client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ')}</td>
      <td className="px-3 py-2 text-xs"><a href={`tel:${client.phone}`} className="hover:text-blue-600">{client.phone}</a></td>
      <td className="px-3 py-2">
        <Select value={client.mfStatus} onValueChange={(v) => onUpdate(client.id, { mfStatus: v })}>
          <SelectTrigger className={cn('h-7 text-xs w-24', client.mfStatus === 'ACTIVE' ? 'border-green-400 text-green-700' : 'border-gray-300')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        <Select value={client.mfRemark} onValueChange={(v) => onUpdate(client.id, { mfRemark: v })}>
          <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="INVESTMENT_DONE">Investment Done</SelectItem>
            <SelectItem value="INTERESTED">Interested</SelectItem>
            <SelectItem value="NOT_INTERESTED">Not Interested</SelectItem>
            <SelectItem value="DID_NOT_ANSWER">Did Not Answer</SelectItem>
            <SelectItem value="FOLLOW_UP_REQUIRED">Follow-up Required</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn('flex items-center gap-1 text-xs', followUp ? 'text-blue-600 font-medium' : 'text-gray-400 hover:text-blue-500')}>
              <CalendarIcon className="h-3 w-3" />
              {followUp ? formatDate(followUp) : 'Set date'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar mode="single" selected={followUp} onSelect={(d) => { setFollowUp(d); onUpdate(client.id, { followUpDate: d ? d.toISOString() : null }) }} />
          </PopoverContent>
        </Popover>
      </td>
      <td className="px-3 py-2">
        {editingNotes ? (
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => { setEditingNotes(false); if (notes !== client.notes) onUpdate(client.id, { notes }) }}
            autoFocus
            className="w-full text-xs border rounded px-1.5 py-1 outline-none focus:border-blue-400"
          />
        ) : (
          <button onClick={() => setEditingNotes(true)} className="text-xs text-gray-500 hover:text-blue-600 text-left max-w-[130px] truncate block" title={notes}>
            {notes || <span className="text-gray-300 italic">Click to add</span>}
          </button>
        )}
      </td>
    </tr>
  )
}

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
import { formatDate, getInitials, cn } from '@/lib/utils'
import { ClientWithOperator } from '@/types'

type DepartmentTab = 'MUTUAL_FUND' | 'EQUITY'

const MF_STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

const MF_REMARK_OPTIONS = [
  { value: 'all', label: 'All Remarks' },
  { value: 'INVESTMENT_DONE', label: 'Investment Done' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'NOT_INTERESTED', label: 'Not Interested' },
  { value: 'DID_NOT_ANSWER', label: 'Did Not Answer' },
  { value: 'FOLLOW_UP_REQUIRED', label: 'Follow-up Required' },
]

const EQUITY_STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'TRADED', label: 'Traded' },
  { value: 'NOT_TRADED', label: 'Not Traded' },
]

const EQUITY_REMARK_OPTIONS = [
  { value: 'all', label: 'All Remarks' },
  { value: 'SUCCESSFULLY_TRADED', label: 'Successfully Traded' },
  { value: 'NOT_TRADED', label: 'Not Traded' },
  { value: 'NO_FUNDS_FOR_TRADING', label: 'No Funds for Trading' },
  { value: 'DID_NOT_ANSWER', label: 'Did Not Answer' },
  { value: 'SELF_TRADING', label: 'Self Trading' },
]

interface MFProduct {
  id: string
  name: string
  investmentType: string
}

export default function MFClientsPage() {
  const [clients, setClients] = useState<ClientWithOperator[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState<DepartmentTab>('MUTUAL_FUND')
  const [status, setStatus] = useState('all')
  const [remark, setRemark] = useState('all')
  const [ageFilter, setAgeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [products, setProducts] = useState<MFProduct[]>([])
  const limit = 25

  const isMF = department === 'MUTUAL_FUND'
  const statusOptions = isMF ? MF_STATUS_OPTIONS : EQUITY_STATUS_OPTIONS
  const remarkOptions = isMF ? MF_REMARK_OPTIONS : EQUITY_REMARK_OPTIONS

  useEffect(() => {
    fetch('/api/mf-products')
      .then(r => r.json())
      .then(d => { if (d.success) setProducts(d.data) })
  }, [])

  const handleDepartmentChange = (dept: DepartmentTab) => {
    setDepartment(dept)
    setStatus('all')
    setRemark('all')
    setPage(1)
  }

  const fetchClients = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    params.set('department', department)
    if (search) params.set('search', search)
    if (status !== 'all') {
      if (isMF) params.set('mfStatus', status)
      else params.set('status', status)
    }
    if (remark !== 'all') {
      if (isMF) params.set('mfRemark', remark)
      else params.set('remark', remark)
    }
    if (ageFilter !== 'all') params.set('ageRange', ageFilter)
    fetch(`/api/clients?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) { setClients(d.data.clients); setTotal(d.data.pagination.total) } })
      .finally(() => setLoading(false))
  }, [search, status, remark, ageFilter, page, department, isMF])

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
  const colSpan = isMF ? 9 : 7

  return (
    <div className="page-container space-y-4">
      <div>
        <h1 className="page-title">My Clients</h1>
        <p className="text-sm text-gray-500">
          {isMF ? 'Manage your mutual fund clients' : 'View equity clients'}
        </p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => handleDepartmentChange('MUTUAL_FUND')}
          className={cn(
            'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
            isMF ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Mutual Fund
        </button>
        <button
          onClick={() => handleDepartmentChange('EQUITY')}
          className={cn(
            'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
            !isMF ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Equity
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search clients…" className="pl-9 h-9 text-sm" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{statusOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={remark} onValueChange={(v) => { setRemark(v); setPage(1) }}>
            <SelectTrigger className="w-48 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{remarkOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={ageFilter} onValueChange={(v) => { setAgeFilter(v); setPage(1) }}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Age Range" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ages</SelectItem>
              <SelectItem value="10-25">10–25 yrs</SelectItem>
              <SelectItem value="25-40">25–40 yrs</SelectItem>
              <SelectItem value="50-70">50–70 yrs</SelectItem>
              <SelectItem value="70-100">70–100 yrs</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => window.open(`/api/clients/export?department=${department}`, '_blank')} className="ml-auto gap-1.5">
            <Download className="h-3.5 w-3.5" />Export CSV
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Code</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Contact</th>
              {isMF && <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Product</th>}
              {isMF && <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Inv. Type</th>}
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Remark</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Follow-up</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide min-w-[150px]">Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={colSpan} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
              ))
            ) : clients.length === 0 ? (
              <tr><td colSpan={colSpan} className="px-4 py-12 text-center text-gray-400">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No clients found</p>
              </td></tr>
            ) : isMF ? clients.map((client) => (
              <MFClientRow key={client.id} client={client} products={products} onUpdate={updateClient} />
            )) : clients.map((client) => (
              <EquityClientRow key={client.id} client={client} />
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

function MFClientRow({ client, products, onUpdate }: { client: ClientWithOperator; products: MFProduct[]; onUpdate: (id: string, updates: Record<string, unknown>) => void }) {
  const [notes, setNotes] = useState(client.notes || '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [followUp, setFollowUp] = useState<Date | undefined>(client.followUpDate ? new Date(client.followUpDate) : undefined)

  const selectedProduct = products.find(p => p.name === client.mfProduct)
  const currentMfProduct = client.mfProduct || ''
  const currentMfInvestmentType = client.mfInvestmentType || ''

  // Determine investment type options based on selected product
  const hasOnlyLumpSum = selectedProduct?.investmentType?.trim() === 'Lump Sum'
  const hasSIPAndLumpSum = selectedProduct?.investmentType?.includes('SIP')

  const handleProductChange = (productName: string) => {
    const product = products.find(p => p.name === productName)
    if (product) {
      const isLumpSumOnly = product.investmentType.trim() === 'Lump Sum'
      onUpdate(client.id, {
        mfProduct: productName,
        mfInvestmentType: isLumpSumOnly ? 'Lump Sum' : '',
      })
    } else {
      onUpdate(client.id, { mfProduct: '', mfInvestmentType: '' })
    }
  }

  return (
    <tr className={cn('border-b border-gray-100 hover:bg-gray-50 transition-colors', client.mfStatus === 'ACTIVE' ? 'bg-green-50' : 'bg-white')}>
      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{client.clientCode}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
            {getInitials([client.firstName, client.lastName].join(' '))}
          </div>
          <span className="font-medium text-gray-800">{[client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ')}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs"><a href={`tel:${client.phone}`} className="text-gray-600 hover:text-blue-600">{client.phone}</a></td>
      <td className="px-4 py-3">
        <Select value={currentMfProduct || 'none'} onValueChange={(v) => handleProductChange(v === 'none' ? '' : v)}>
          <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="Select product" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">-- None --</SelectItem>
            {products.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="px-4 py-3">
        {currentMfProduct ? (
          hasOnlyLumpSum ? (
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">Lump Sum</span>
          ) : hasSIPAndLumpSum ? (
            <Select value={currentMfInvestmentType || 'none'} onValueChange={(v) => onUpdate(client.id, { mfInvestmentType: v === 'none' ? '' : v })}>
              <SelectTrigger className="h-7 text-xs w-28"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- Select --</SelectItem>
                <SelectItem value="Lump Sum">Lump Sum</SelectItem>
                <SelectItem value="SIP">SIP</SelectItem>
              </SelectContent>
            </Select>
          ) : null
        ) : (
          <span className="text-xs text-gray-300">--</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Select value={client.mfStatus} onValueChange={(v) => onUpdate(client.id, { mfStatus: v })}>
          <SelectTrigger className={cn('h-7 text-xs w-24', client.mfStatus === 'ACTIVE' ? 'border-green-400 text-green-700' : 'border-gray-300')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-4 py-3">
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
      <td className="px-4 py-3">
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
      <td className="px-4 py-3">
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

const STATUS_LABELS: Record<string, string> = {
  TRADED: 'Traded',
  NOT_TRADED: 'Not Traded',
}

const REMARK_LABELS: Record<string, string> = {
  SUCCESSFULLY_TRADED: 'Successfully Traded',
  NOT_TRADED: 'Not Traded',
  NO_FUNDS_FOR_TRADING: 'No Funds for Trading',
  DID_NOT_ANSWER: 'Did Not Answer',
  SELF_TRADING: 'Self Trading',
}

function EquityClientRow({ client }: { client: ClientWithOperator }) {
  return (
    <tr className={cn(
      'border-b border-gray-100 hover:bg-blue-50 transition-colors',
      client.status === 'TRADED' ? 'bg-green-50' :
      client.remark === 'NO_FUNDS_FOR_TRADING' ? 'bg-yellow-50' : 'bg-white'
    )}>
      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{client.clientCode}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
            {getInitials([client.firstName, client.lastName].join(' '))}
          </div>
          <span className="font-medium text-gray-800">{[client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ')}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs">
        <a href={`tel:${client.phone}`} className="text-gray-600 hover:text-blue-600">{client.phone}</a>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'text-xs px-2 py-1 rounded-full font-medium',
          client.status === 'TRADED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
        )}>
          {STATUS_LABELS[client.status] || client.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-gray-600">{REMARK_LABELS[client.remark] || client.remark}</span>
      </td>
      <td className="px-4 py-3">
        {client.followUpDate ? (
          <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
            <CalendarIcon className="h-3 w-3" />
            {formatDate(new Date(client.followUpDate))}
          </span>
        ) : (
          <span className="text-xs text-gray-300">--</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-gray-500 max-w-[130px] truncate block" title={client.notes || ''}>
          {client.notes || <span className="text-gray-300">--</span>}
        </span>
      </td>
    </tr>
  )
}

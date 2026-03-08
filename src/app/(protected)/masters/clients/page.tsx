'use client'
import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { UserPlus, Search, ArrowRightLeft, X, Pencil, Trash2, Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, getInitials } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import { ClientWithOperator } from '@/types'

interface Employee { id: string; name: string; department: string }

const EQUITY_STATUSES = [{ value: 'TRADED', label: 'Traded' }, { value: 'NOT_TRADED', label: 'Not Traded' }]
const MF_STATUSES = [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]
const EQUITY_REMARKS = [
  { value: 'SUCCESSFULLY_TRADED', label: 'Successfully Traded' },
  { value: 'NOT_TRADED', label: 'Not Traded' },
  { value: 'NO_FUNDS_FOR_TRADING', label: 'No Funds' },
  { value: 'DID_NOT_ANSWER', label: 'Did Not Answer' },
  { value: 'SELF_TRADING', label: 'Self Trading' },
]
const MF_REMARKS = [
  { value: 'INVESTMENT_DONE', label: 'Investment Done' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'NOT_INTERESTED', label: 'Not Interested' },
  { value: 'DID_NOT_ANSWER', label: 'Did Not Answer' },
  { value: 'FOLLOW_UP_REQUIRED', label: 'Follow Up Required' },
]

interface ImportPreview {
  totalRows: number
  validCount: number
  invalidCount: number
  invalidRows: { row: number; data: { clientCode: string; firstName: string; lastName: string }; errors: string[] }[]
}

export default function ClientMasterPage() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientWithOperator[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 400)
  const [dept, setDept] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [operatorFilter, setOperatorFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  // Filter operators
  const [filterOperators, setFilterOperators] = useState<Employee[]>([])

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Transfer
  const [transferClient, setTransferClient] = useState<ClientWithOperator | null>(null)
  const [transferEmployees, setTransferEmployees] = useState<Employee[]>([])
  const [newOperatorId, setNewOperatorId] = useState('')
  const [transferring, setTransferring] = useState(false)

  // Edit
  const [editClient, setEditClient] = useState<ClientWithOperator | null>(null)
  const [editForm, setEditForm] = useState({ firstName: '', middleName: '', lastName: '', phone: '', status: '', remark: '', mfStatus: '', mfRemark: '' })
  const [editSubmitting, setEditSubmitting] = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<ClientWithOperator | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteFromMF, setDeleteFromMF] = useState(false)

  // Bulk delete
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteFromMF, setBulkDeleteFromMF] = useState(false)

  // Bulk status update
  const [bulkStatusAction, setBulkStatusAction] = useState<null | 'traded' | 'not_traded'>(null)
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false)

  // Bulk swap operator
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapOperatorId, setSwapOperatorId] = useState('')
  const [swapOperators, setSwapOperators] = useState<Employee[]>([])
  const [swapping, setSwapping] = useState(false)

  // Import
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const limit = 25

  // Load operators for filter
  useEffect(() => {
    if (dept === 'all') {
      Promise.all([
        fetch('/api/employees?department=EQUITY&isActive=true').then(r => r.json()),
        fetch('/api/employees?department=MUTUAL_FUND&isActive=true').then(r => r.json()),
      ]).then(([eq, mf]) => {
        setFilterOperators([...(eq.success ? eq.data : []), ...(mf.success ? mf.data : [])])
      })
    } else {
      fetch(`/api/employees?department=${dept}&isActive=true`)
        .then(r => r.json())
        .then(d => { if (d.success) setFilterOperators(d.data) })
    }
    setOperatorFilter('all')
    setStatusFilter('all')
  }, [dept])

  const fetchClients = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page)); params.set('limit', String(limit))
    if (search) params.set('search', search)
    if (dept !== 'all') params.set('department', dept)
    if (operatorFilter !== 'all') params.set('operatorId', operatorFilter)
    if (statusFilter !== 'all') {
      if (dept === 'MUTUAL_FUND') params.set('mfStatus', statusFilter)
      else params.set('status', statusFilter)
    }
    fetch(`/api/clients?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) { setClients(d.data.clients); setTotal(d.data.pagination?.total ?? d.data.total ?? 0) } })
      .finally(() => setLoading(false))
  }, [search, dept, statusFilter, operatorFilter, page])

  useEffect(() => { fetchClients() }, [fetchClients])

  // Clear selection when filters/page change
  useEffect(() => { setSelected(new Set()) }, [searchInput, dept, statusFilter, operatorFilter, page])

  const hasActiveFilters = dept !== 'all' || statusFilter !== 'all' || operatorFilter !== 'all' || searchInput !== ''

  const clearFilters = () => { setSearchInput(''); setDept('all'); setStatusFilter('all'); setOperatorFilter('all'); setPage(1) }

  // Selection
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    if (selected.size === clients.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(clients.map(c => c.id)))
    }
  }

  // Transfer
  const openTransfer = (client: ClientWithOperator) => {
    setTransferClient(client); setNewOperatorId('')
    fetch(`/api/employees?department=${client.department}&isActive=true`)
      .then(r => r.json()).then(d => { if (d.success) setTransferEmployees(d.data) })
  }
  const handleTransfer = async () => {
    if (!transferClient || !newOperatorId) return
    setTransferring(true)
    const res = await fetch(`/api/clients/${transferClient.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorId: newOperatorId }),
    })
    const data = await res.json()
    if (data.success) { toast.success('Client transferred'); setTransferClient(null); fetchClients() }
    else toast.error(data.error || 'Transfer failed')
    setTransferring(false)
  }

  // Edit
  const openEdit = (client: ClientWithOperator) => {
    setEditClient(client)
    setEditForm({
      firstName: client.firstName,
      middleName: client.middleName ?? '',
      lastName: client.lastName,
      phone: client.phone,
      status: client.status,
      remark: client.remark,
      mfStatus: client.mfStatus,
      mfRemark: client.mfRemark,
    })
  }
  const handleEdit = async () => {
    if (!editClient) return
    setEditSubmitting(true)
    const body: Record<string, string> = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      phone: editForm.phone,
    }
    if (editForm.middleName !== undefined) body.middleName = editForm.middleName
    if (editClient.department === 'EQUITY') {
      body.status = editForm.status
      body.remark = editForm.remark
    } else {
      body.mfStatus = editForm.mfStatus
      body.mfRemark = editForm.mfRemark
    }
    const res = await fetch(`/api/clients/${editClient.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.success) { toast.success('Client updated'); setEditClient(null); fetchClients() }
    else toast.error(data.error || 'Update failed')
    setEditSubmitting(false)
  }

  // Single Delete
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const params = deleteFromMF ? '?deleteFromMF=true' : ''
    const res = await fetch(`/api/clients/${deleteTarget.id}${params}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) { toast.success(deleteFromMF ? 'Client deleted from both masters' : 'Client deleted'); setDeleteTarget(null); setDeleteFromMF(false); setSelected(prev => { const n = new Set(prev); n.delete(deleteTarget.id); return n }); fetchClients() }
    else toast.error(data.error || 'Delete failed')
    setDeleting(false)
  }

  // Bulk Delete
  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const res = await fetch('/api/clients/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientIds: Array.from(selected), deleteFromMF: bulkDeleteFromMF }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success(bulkDeleteFromMF ? `${data.data.deletedCount} clients deleted from both masters` : `${data.data.deletedCount} clients deleted`)
      setBulkDeleteOpen(false)
      setBulkDeleteFromMF(false)
      setSelected(new Set())
      fetchClients()
    } else {
      toast.error(data.error || 'Bulk delete failed')
    }
    setBulkDeleting(false)
  }

  // Bulk status update
  const handleBulkStatusUpdate = async () => {
    setBulkStatusUpdating(true)
    const updates = bulkStatusAction === 'traded'
      ? { status: 'TRADED', remark: 'SUCCESSFULLY_TRADED' }
      : { status: 'NOT_TRADED', remark: 'DID_NOT_ANSWER' }
    const res = await fetch('/api/clients/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientIds: Array.from(selected), ...updates }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success(`Updated ${data.data.updatedCount} clients`)
      setBulkStatusAction(null)
      setSelected(new Set())
      fetchClients()
    } else {
      toast.error(data.error || 'Update failed')
    }
    setBulkStatusUpdating(false)
  }

  // Bulk swap operator
  const openSwapOperator = () => {
    setSwapOpen(true)
    setSwapOperatorId('')
    // Load all active equity + MF operators
    Promise.all([
      fetch('/api/employees?department=EQUITY&isActive=true').then(r => r.json()),
      fetch('/api/employees?department=MUTUAL_FUND&isActive=true').then(r => r.json()),
    ]).then(([eq, mf]) => {
      setSwapOperators([...(eq.success ? eq.data : []), ...(mf.success ? mf.data : [])])
    })
  }

  const handleSwapOperator = async () => {
    if (!swapOperatorId) return
    setSwapping(true)
    const res = await fetch('/api/clients/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientIds: Array.from(selected), operatorId: swapOperatorId }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success(`Transferred ${data.data.updatedCount} clients`)
      setSwapOpen(false)
      setSelected(new Set())
      fetchClients()
    } else {
      toast.error(data.error || 'Transfer failed')
    }
    setSwapping(false)
  }

  // Import
  const handleFileSelect = async (file: File) => {
    setImportFile(file)
    setImportPreview(null)
    setImportLoading(true)

    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/clients/import', { method: 'POST', body: formData })
    const data = await res.json()
    setImportLoading(false)

    if (data.success && data.data.preview) {
      setImportPreview(data.data)
    } else {
      toast.error(data.error || 'Failed to preview file')
    }
  }

  const handleImportConfirm = async () => {
    if (!importFile) return
    setImporting(true)

    const formData = new FormData()
    formData.append('file', importFile)
    formData.append('confirm', 'true')
    const res = await fetch('/api/clients/import', { method: 'POST', body: formData })
    const data = await res.json()
    setImporting(false)

    if (data.success) {
      toast.success(`Imported ${data.data.importedCount} clients${data.data.invalidCount > 0 ? ` (${data.data.invalidCount} skipped)` : ''}`)
      setImportOpen(false)
      setImportFile(null)
      setImportPreview(null)
      fetchClients()
    } else {
      toast.error(data.error || 'Import failed')
    }
  }

  const closeImport = () => {
    setImportOpen(false)
    setImportFile(null)
    setImportPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const totalPages = Math.ceil(total / limit)
  const statusOptions = dept === 'MUTUAL_FUND' ? MF_STATUSES : EQUITY_STATUSES

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Master</h1>
          <p className="text-sm text-gray-500">{total > 0 ? `${total} clients` : 'Manage all clients across departments'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />Bulk Import
          </Button>
          <Button variant="outline" onClick={() => router.push('/masters/clients/new')} className="gap-2">
            <UserPlus className="h-4 w-4" />Add Client
          </Button>
        </div>
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-blue-800">{selected.size} client{selected.size > 1 ? 's' : ''} selected</span>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50" onClick={() => setBulkStatusAction('traded')}>
              Mark Traded ({selected.size})
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => setBulkStatusAction('not_traded')}>
              Mark Not Traded ({selected.size})
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50" onClick={openSwapOperator}>
              <ArrowRightLeft className="h-3.5 w-3.5" />Swap Operator ({selected.size})
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} className="h-8 text-xs gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />Delete ({selected.size})
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="h-8 text-xs text-blue-700 hover:bg-blue-100">
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1) }} placeholder="Name, code or phone…" className="pl-9 h-9 text-sm" />
          </div>
          <Select value={dept} onValueChange={(v) => { setDept(v); setPage(1) }}>
            <SelectTrigger className="w-38 h-9 text-sm"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="EQUITY">Equity</SelectItem>
              <SelectItem value="MUTUAL_FUND">Mutual Fund</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={operatorFilter} onValueChange={(v) => { setOperatorFilter(v); setPage(1) }}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Operator" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Operators</SelectItem>
              {filterOperators.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5 text-gray-500 hover:text-gray-800">
              <X className="h-3.5 w-3.5" />Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={clients.length > 0 && selected.size === clients.length}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                />
              </th>
              {['Code', 'Name', 'Phone', 'Department', 'Operator', 'Status', 'Added', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={9} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
                ))
              : clients.length === 0
              ? <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">No clients found{hasActiveFilters ? ' for the selected filters' : ''}</td></tr>
              : clients.map(c => (
                  <tr key={c.id} className={`border-b border-gray-100 hover:bg-gray-50 ${selected.has(c.id) ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{c.clientCode}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white ${c.department === 'EQUITY' ? 'bg-blue-600' : 'bg-green-600'}`}>
                          {getInitials([c.firstName, c.lastName].join(' '))}
                        </div>
                        <span className="font-medium text-gray-800">{[c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.phone}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.department === 'EQUITY' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {c.department === 'EQUITY' ? 'Equity' : 'Mutual Fund'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.operator.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        c.department === 'EQUITY'
                          ? c.status === 'TRADED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          : c.mfStatus === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {c.department === 'EQUITY' ? c.status.replace('_', ' ') : c.mfStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => openEdit(c)} className="h-7 text-xs gap-1">
                          <Pencil className="h-3 w-3" />Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openTransfer(c)} className="h-7 text-xs gap-1 text-gray-600 hover:bg-gray-100">
                          <ArrowRightLeft className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(c)} className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
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

      {/* Edit Dialog */}
      <Dialog open={!!editClient} onOpenChange={() => setEditClient(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
          {editClient && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">First Name</Label>
                  <Input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Middle Name</Label>
                  <Input value={editForm.middleName} onChange={e => setEditForm(f => ({ ...f, middleName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Last Name</Label>
                  <Input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Phone</Label>
                <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} maxLength={10} />
              </div>

              {editClient.department === 'EQUITY' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Status</Label>
                    <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{EQUITY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">Remark</Label>
                    <Select value={editForm.remark} onValueChange={v => setEditForm(f => ({ ...f, remark: v }))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{EQUITY_REMARKS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">MF Status</Label>
                    <Select value={editForm.mfStatus} onValueChange={v => setEditForm(f => ({ ...f, mfStatus: v }))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{MF_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500">MF Remark</Label>
                    <Select value={editForm.mfRemark} onValueChange={v => setEditForm(f => ({ ...f, mfRemark: v }))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{MF_REMARKS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setEditClient(null)}>Cancel</Button>
                <Button className="flex-1" onClick={handleEdit} disabled={editSubmitting}>
                  {editSubmitting ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={!!transferClient} onOpenChange={() => setTransferClient(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Transfer Client</DialogTitle></DialogHeader>
          {transferClient && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Transfer <strong>{transferClient.firstName} {transferClient.lastName}</strong> to a new operator</p>
              <div className="space-y-1.5">
                <Label>New Operator</Label>
                <Select value={newOperatorId} onValueChange={setNewOperatorId}>
                  <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
                  <SelectContent>
                    {transferEmployees.filter(e => e.id !== transferClient.operatorId).map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setTransferClient(null)}>Cancel</Button>
                <Button className="flex-1" onClick={handleTransfer} disabled={!newOperatorId || transferring}>
                  {transferring ? 'Transferring…' : 'Confirm Transfer'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); setDeleteFromMF(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Client</DialogTitle></DialogHeader>
          {deleteTarget && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to permanently delete <strong>{deleteTarget.firstName} {deleteTarget.lastName}</strong> ({deleteTarget.clientCode})?
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                This will permanently delete the client. Historical brokerage records will be preserved.
              </p>
              {deleteTarget.department === 'EQUITY' && (
                <label className="flex items-center gap-2 cursor-pointer bg-blue-50 border border-blue-200 rounded px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={deleteFromMF}
                    onChange={(e) => setDeleteFromMF(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-blue-800">Also delete from Mutual Fund Master?</span>
                </label>
              )}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => { setDeleteTarget(null); setDeleteFromMF(false) }}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirm Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={(open) => { setBulkDeleteOpen(open); if (!open) setBulkDeleteFromMF(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete {selected.size} Client{selected.size > 1 ? 's' : ''}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to permanently delete <strong>{selected.size}</strong> selected client{selected.size > 1 ? 's' : ''}?
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              This action cannot be undone. Historical brokerage records will be preserved.
            </p>
            <label className="flex items-center gap-2 cursor-pointer bg-blue-50 border border-blue-200 rounded px-3 py-2.5">
              <input
                type="checkbox"
                checked={bulkDeleteFromMF}
                onChange={(e) => setBulkDeleteFromMF(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-blue-800">Also delete from Mutual Fund Master?</span>
            </label>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setBulkDeleteOpen(false); setBulkDeleteFromMF(false) }}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} Client${selected.size > 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Update Confirmation */}
      <AlertDialog open={!!bulkStatusAction} onOpenChange={(open) => { if (!open) setBulkStatusAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkStatusAction === 'traded' ? 'Mark as Traded?' : 'Mark as Not Traded?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkStatusAction === 'traded'
                ? `This will mark ${selected.size} selected client(s) as Traded with remark "Successfully Traded".`
                : `This will mark ${selected.size} selected client(s) as Not Traded with remark "Did Not Answer".`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={bulkStatusAction === 'not_traded' ? 'bg-red-600 hover:bg-red-700' : ''}
              onClick={handleBulkStatusUpdate}
              disabled={bulkStatusUpdating}
            >
              {bulkStatusUpdating ? 'Updating…' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Swap Operator Dialog */}
      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Swap Operator</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Transfer <strong>{selected.size}</strong> selected client{selected.size > 1 ? 's' : ''} to a new operator.
            </p>
            <div className="space-y-1.5">
              <Label>New Operator</Label>
              <Select value={swapOperatorId} onValueChange={setSwapOperatorId}>
                <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
                <SelectContent>
                  {swapOperators.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setSwapOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSwapOperator} disabled={!swapOperatorId || swapping}>
                {swapping ? 'Transferring…' : 'Confirm Transfer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={closeImport}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Bulk Import Clients</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Format info */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-700 mb-1.5">Expected columns:</p>
              <p className="text-xs text-gray-600">Client Code, Name of client (full), Phone number, Department, Assigned Operator</p>
              <p className="text-xs text-gray-500 mt-1">Accepts .xlsx, .xls, and .csv files. Status defaults to Not Traded.</p>
            </div>

            {/* File upload */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFileSelect(f)
                }}
              />
              {!importFile ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 hover:bg-gray-50 transition-colors"
                >
                  <FileSpreadsheet className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-700">Click to upload Excel or CSV</p>
                  <p className="text-xs text-gray-500 mt-1">.xlsx, .xls, .csv</p>
                </button>
              ) : (
                <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-200">
                  <FileSpreadsheet className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{importFile.name}</p>
                    <p className="text-xs text-gray-500">{(importFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => { setImportFile(null); setImportPreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }} className="h-7 text-xs text-gray-500">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Loading */}
            {importLoading && (
              <div className="text-center py-4">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                <p className="text-sm text-gray-500 mt-2">Validating file...</p>
              </div>
            )}

            {/* Preview */}
            {importPreview && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center border border-gray-200">
                    <p className="text-lg font-bold text-gray-800">{importPreview.totalRows}</p>
                    <p className="text-xs text-gray-500">Total Rows</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2.5 text-center border border-green-200">
                    <p className="text-lg font-bold text-green-700">{importPreview.validCount}</p>
                    <p className="text-xs text-green-600">Valid</p>
                  </div>
                  <div className={`rounded-lg p-2.5 text-center border ${importPreview.invalidCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className={`text-lg font-bold ${importPreview.invalidCount > 0 ? 'text-red-700' : 'text-gray-800'}`}>{importPreview.invalidCount}</p>
                    <p className={`text-xs ${importPreview.invalidCount > 0 ? 'text-red-600' : 'text-gray-500'}`}>Invalid</p>
                  </div>
                </div>

                {/* Show invalid rows */}
                {importPreview.invalidCount > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-red-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left text-red-700 font-semibold">Row</th>
                          <th className="px-2 py-1.5 text-left text-red-700 font-semibold">Code</th>
                          <th className="px-2 py-1.5 text-left text-red-700 font-semibold">Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.invalidRows.map((r, i) => (
                          <tr key={i} className="border-t border-red-100">
                            <td className="px-2 py-1.5 text-gray-600">{r.row}</td>
                            <td className="px-2 py-1.5 font-mono text-gray-700">{r.data.clientCode || '—'}</td>
                            <td className="px-2 py-1.5 text-red-600">{r.errors.join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Confirm button */}
                {importPreview.validCount > 0 && (
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1" onClick={closeImport}>Cancel</Button>
                    <Button className="flex-1 gap-1.5" onClick={handleImportConfirm} disabled={importing}>
                      {importing ? 'Importing…' : `Import ${importPreview.validCount} Clients`}
                    </Button>
                  </div>
                )}

                {importPreview.validCount === 0 && (
                  <p className="text-sm text-center text-red-600 font-medium">No valid rows to import. Please fix errors and try again.</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

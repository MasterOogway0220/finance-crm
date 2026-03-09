'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Search, X, Pencil, Trash2, Upload, FileSpreadsheet, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, getInitials } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import { ClientWithOperator } from '@/types'

interface Employee { id: string; name: string; department: string }

const MF_STATUSES = [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]
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

export default function MFClientMasterPage() {
  const [clients, setClients] = useState<ClientWithOperator[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 400)
  const [statusFilter, setStatusFilter] = useState('all')
  const [operatorFilter, setOperatorFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [filterOperators, setFilterOperators] = useState<Employee[]>([])

  // Selection — persists across filter changes
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectingAll, setSelectingAll] = useState(false)

  // Transfer
  const [transferClient, setTransferClient] = useState<ClientWithOperator | null>(null)
  const [transferEmployees, setTransferEmployees] = useState<Employee[]>([])
  const [newOperatorId, setNewOperatorId] = useState('')
  const [transferring, setTransferring] = useState(false)

  // Edit
  const [editClient, setEditClient] = useState<ClientWithOperator | null>(null)
  const [editForm, setEditForm] = useState({ firstName: '', middleName: '', lastName: '', phone: '', mfStatus: '', mfRemark: '' })
  const [editSubmitting, setEditSubmitting] = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<ClientWithOperator | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteFromEquity, setDeleteFromEquity] = useState(false)

  // Bulk delete
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Import
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const limit = 25

  useEffect(() => {
    fetch('/api/employees?department=MUTUAL_FUND&isActive=true')
      .then(r => r.json())
      .then(d => { if (d.success) setFilterOperators(d.data) })
  }, [])

  const buildParams = useCallback(() => {
    const params = new URLSearchParams()
    params.set('department', 'MUTUAL_FUND')
    if (search) params.set('search', search)
    if (operatorFilter !== 'all') params.set('operatorId', operatorFilter)
    if (statusFilter !== 'all') params.set('mfStatus', statusFilter)
    return params
  }, [search, operatorFilter, statusFilter])

  const fetchClients = useCallback(() => {
    setLoading(true)
    const params = buildParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    fetch(`/api/clients?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) { setClients(d.data.clients); setTotal(d.data.pagination?.total ?? 0) } })
      .finally(() => setLoading(false))
  }, [buildParams, page])

  useEffect(() => { fetchClients() }, [fetchClients])
  useEffect(() => { setPage(1) }, [search, statusFilter, operatorFilter])

  const hasActiveFilters = statusFilter !== 'all' || operatorFilter !== 'all' || searchInput !== ''
  const clearFilters = () => { setSearchInput(''); setStatusFilter('all'); setOperatorFilter('all'); setPage(1) }

  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const toggleAll = async () => {
    const allCurrentSelected = clients.length > 0 && clients.every(c => selected.has(c.id))
    if (allCurrentSelected && selected.size === clients.length) { setSelected(new Set()); return }
    setSelectingAll(true)
    try {
      const params = buildParams()
      params.set('idsOnly', 'true')
      const r = await fetch(`/api/clients?${params}`)
      const d = await r.json()
      if (d.success) setSelected(new Set(d.data.ids as string[]))
    } catch { /* ignore */ }
    finally { setSelectingAll(false) }
  }

  // Transfer
  const openTransfer = (client: ClientWithOperator) => {
    setTransferClient(client); setNewOperatorId('')
    fetch('/api/employees?department=MUTUAL_FUND&isActive=true').then(r => r.json()).then(d => { if (d.success) setTransferEmployees(d.data) })
  }
  const handleTransfer = async () => {
    if (!transferClient || !newOperatorId) return
    setTransferring(true)
    const res = await fetch(`/api/clients/${transferClient.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operatorId: newOperatorId }) })
    const data = await res.json()
    if (data.success) { toast.success('Client transferred'); setTransferClient(null); fetchClients() }
    else toast.error(data.error || 'Transfer failed')
    setTransferring(false)
  }

  // Edit
  const openEdit = (client: ClientWithOperator) => {
    setEditClient(client)
    setEditForm({ firstName: client.firstName, middleName: client.middleName ?? '', lastName: client.lastName, phone: client.phone, mfStatus: client.mfStatus, mfRemark: client.mfRemark })
  }
  const handleEdit = async () => {
    if (!editClient) return
    setEditSubmitting(true)
    const res = await fetch(`/api/clients/${editClient.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: editForm.firstName, middleName: editForm.middleName || undefined, lastName: editForm.lastName, phone: editForm.phone, mfStatus: editForm.mfStatus, mfRemark: editForm.mfRemark }),
    })
    const data = await res.json()
    if (data.success) { toast.success('Client updated'); setEditClient(null); fetchClients() }
    else toast.error(data.error || 'Update failed')
    setEditSubmitting(false)
  }

  // Delete single — when deleting from MF, offer to also delete from equity
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    // Delete this MF client
    const res = await fetch(`/api/clients/${deleteTarget.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) {
      // If user chose to also delete from equity master
      if (deleteFromEquity) {
        const equityRes = await fetch(`/api/clients?department=EQUITY&search=${deleteTarget.clientCode}&idsOnly=true`)
        const equityData = await equityRes.json()
        if (equityData.success && equityData.data.ids.length > 0) {
          await fetch(`/api/clients/${equityData.data.ids[0]}`, { method: 'DELETE' })
        }
      }
      toast.success(deleteFromEquity ? 'Deleted from both masters' : 'Client deleted from MF master')
      setDeleteTarget(null); setDeleteFromEquity(false)
      setSelected(prev => { const n = new Set(prev); n.delete(deleteTarget.id); return n })
      fetchClients()
    } else toast.error(data.error || 'Delete failed')
    setDeleting(false)
  }

  // Bulk Delete
  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const res = await fetch('/api/clients/bulk', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientIds: Array.from(selected) }),
    })
    const data = await res.json()
    if (data.success) { toast.success(`${data.data.deletedCount} clients deleted`); setBulkDeleteOpen(false); setSelected(new Set()); fetchClients() }
    else toast.error(data.error || 'Bulk delete failed')
    setBulkDeleting(false)
  }

  // Import
  const handleFileSelect = async (file: File) => {
    setImportFile(file); setImportPreview(null); setImportLoading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('defaultDepartment', 'MUTUAL_FUND')
    const res = await fetch('/api/clients/import', { method: 'POST', body: formData })
    const data = await res.json()
    setImportLoading(false)
    if (data.success && data.data.preview) setImportPreview(data.data)
    else toast.error(data.error || 'Failed to preview file')
  }
  const handleImportConfirm = async () => {
    if (!importFile) return
    setImporting(true)
    const formData = new FormData()
    formData.append('file', importFile)
    formData.append('confirm', 'true')
    formData.append('defaultDepartment', 'MUTUAL_FUND')
    const res = await fetch('/api/clients/import', { method: 'POST', body: formData })
    const data = await res.json()
    setImporting(false)
    if (data.success) { toast.success(`Imported ${data.data.importedCount} MF clients`); closeImport(); fetchClients() }
    else toast.error(data.error || 'Import failed')
  }
  const closeImport = () => { setImportOpen(false); setImportFile(null); setImportPreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }

  const totalPages = Math.ceil(total / limit)
  const allCurrentPageSelected = clients.length > 0 && clients.every(c => selected.has(c.id))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mutual Fund Client Master</h1>
          <p className="text-sm text-gray-500">{total > 0 ? `${total} MF clients` : 'Manage mutual fund department clients'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="h-4 w-4" />Bulk Import</Button>
        </div>
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-green-800">{selected.size} client{selected.size > 1 ? 's' : ''} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} className="h-8 text-xs gap-1.5"><Trash2 className="h-3.5 w-3.5" />Delete ({selected.size})</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="h-8 text-xs text-green-700 hover:bg-green-100">Clear</Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Name, code or phone…" className="pl-9 h-9 text-sm" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {MF_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={operatorFilter} onValueChange={setOperatorFilter}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Operator" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Operators</SelectItem>
              {filterOperators.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1.5 text-gray-500 hover:text-gray-800"><X className="h-3.5 w-3.5" />Clear</Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 w-10">
                <input type="checkbox" checked={allCurrentPageSelected} onChange={toggleAll} disabled={selectingAll} title="Select all matching clients" className="rounded border-gray-300 cursor-pointer" />
              </th>
              {['Code', 'Name', 'Phone', 'Operator', 'MF Status', 'Added', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={8} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>)
              : clients.length === 0
              ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">No clients found{hasActiveFilters ? ' for the selected filters' : ''}</td></tr>
              : clients.map(c => (
                  <tr key={c.id} className={`border-b border-gray-100 hover:bg-gray-50 ${selected.has(c.id) ? 'bg-green-50/50' : ''}`}>
                    <td className="px-3 py-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded border-gray-300" /></td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{c.clientCode}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white bg-green-600">{getInitials([c.firstName, c.lastName].join(' '))}</div>
                        <span className="font-medium text-gray-800">{[c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.phone === '0000000000' ? '—' : c.phone}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.operator.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.mfStatus === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{c.mfStatus}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => openEdit(c)} className="h-7 text-xs gap-1"><Pencil className="h-3 w-3" />Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => openTransfer(c)} className="h-7 text-xs gap-1 text-gray-600 hover:bg-gray-100"><ArrowRightLeft className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(c)} className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" /></Button>
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
          <p>{total} clients · Page {page} of {totalPages}{selected.size > 0 ? ` · ${selected.size} selected` : ''}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editClient} onOpenChange={() => setEditClient(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit MF Client</DialogTitle></DialogHeader>
          {editClient && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs text-gray-500">First Name</Label><Input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs text-gray-500">Middle Name</Label><Input value={editForm.middleName} onChange={e => setEditForm(f => ({ ...f, middleName: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs text-gray-500">Last Name</Label><Input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs text-gray-500">Phone</Label><Input value={editForm.phone === '0000000000' ? '' : editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit phone" maxLength={10} /></div>
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
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setEditClient(null)}>Cancel</Button>
                <Button className="flex-1" onClick={handleEdit} disabled={editSubmitting}>{editSubmitting ? 'Saving…' : 'Save Changes'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={!!transferClient} onOpenChange={() => setTransferClient(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Transfer MF Client</DialogTitle></DialogHeader>
          {transferClient && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Transfer <strong>{transferClient.firstName} {transferClient.lastName}</strong> to a new MF operator</p>
              <div className="space-y-1.5">
                <Label>New Operator</Label>
                <Select value={newOperatorId} onValueChange={setNewOperatorId}>
                  <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
                  <SelectContent>{transferEmployees.filter(e => e.id !== transferClient.operatorId).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setTransferClient(null)}>Cancel</Button>
                <Button className="flex-1" onClick={handleTransfer} disabled={!newOperatorId || transferring}>{transferring ? 'Transferring…' : 'Confirm Transfer'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); setDeleteFromEquity(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete MF Client</DialogTitle></DialogHeader>
          {deleteTarget && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Delete <strong>{deleteTarget.firstName} {deleteTarget.lastName}</strong> ({deleteTarget.clientCode}) from MF master?</p>
              <label className="flex items-center gap-2 cursor-pointer bg-orange-50 border border-orange-200 rounded px-3 py-2.5">
                <input type="checkbox" checked={deleteFromEquity} onChange={(e) => setDeleteFromEquity(e.target.checked)} className="rounded border-gray-300" />
                <span className="text-sm text-orange-800">Also delete from Equity Master?</span>
              </label>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => { setDeleteTarget(null); setDeleteFromEquity(false) }}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete {selected.size} MF Client{selected.size > 1 ? 's' : ''}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Permanently delete <strong>{selected.size}</strong> selected client{selected.size > 1 ? 's' : ''} from MF master?</p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={handleBulkDelete} disabled={bulkDeleting}>{bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={closeImport}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Bulk Import MF Clients</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-700 mb-1.5">Expected columns:</p>
              <p className="text-xs text-gray-600">Client Code, Name of Client (full)</p>
              <p className="text-xs text-gray-500 mt-1">Phone and operator are optional — operator will be auto-assigned to MF dealers. Accepts .csv, .xlsx, .xls.</p>
            </div>
            <div>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
              {!importFile ? (
                <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 hover:bg-gray-50 transition-colors">
                  <FileSpreadsheet className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-700">Click to upload CSV or Excel</p>
                </button>
              ) : (
                <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 border">
                  <FileSpreadsheet className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{importFile.name}</p></div>
                  <Button size="sm" variant="ghost" onClick={() => { setImportFile(null); setImportPreview(null) }} className="h-7"><X className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
            {importLoading && <div className="text-center py-4"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-green-600" /><p className="text-sm text-gray-500 mt-2">Validating...</p></div>}
            {importPreview && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center border"><p className="text-lg font-bold">{importPreview.totalRows}</p><p className="text-xs text-gray-500">Total</p></div>
                  <div className="bg-green-50 rounded-lg p-2.5 text-center border border-green-200"><p className="text-lg font-bold text-green-700">{importPreview.validCount}</p><p className="text-xs text-green-600">Valid</p></div>
                  <div className={`rounded-lg p-2.5 text-center border ${importPreview.invalidCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50'}`}><p className={`text-lg font-bold ${importPreview.invalidCount > 0 ? 'text-red-700' : 'text-gray-800'}`}>{importPreview.invalidCount}</p><p className="text-xs text-gray-500">Invalid</p></div>
                </div>
                {importPreview.validCount > 0 && (
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1" onClick={closeImport}>Cancel</Button>
                    <Button className="flex-1" onClick={handleImportConfirm} disabled={importing}>{importing ? 'Importing…' : `Import ${importPreview.validCount} Clients`}</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

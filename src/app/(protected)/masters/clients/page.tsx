'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { UserPlus, Search, ArrowRightLeft, X, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, getInitials } from '@/lib/utils'
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

export default function ClientMasterPage() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientWithOperator[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [operatorFilter, setOperatorFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  // Filter operators
  const [filterOperators, setFilterOperators] = useState<Employee[]>([])

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

  useEffect(() => { const t = setTimeout(fetchClients, 300); return () => clearTimeout(t) }, [fetchClients])

  const hasActiveFilters = dept !== 'all' || statusFilter !== 'all' || operatorFilter !== 'all' || search !== ''

  const clearFilters = () => { setSearch(''); setDept('all'); setStatusFilter('all'); setOperatorFilter('all'); setPage(1) }

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

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await fetch(`/api/clients/${deleteTarget.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) { toast.success('Client deleted'); setDeleteTarget(null); fetchClients() }
    else toast.error(data.error || 'Delete failed')
    setDeleting(false)
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
        <Button variant="outline" onClick={() => router.push('/masters/clients/new')} className="gap-2">
          <UserPlus className="h-4 w-4" />Add Client
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Name, code or phone…" className="pl-9 h-9 text-sm" />
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
              {['Code', 'Name', 'Phone', 'Department', 'Operator', 'Status', 'Added', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
                ))
              : clients.length === 0
              ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">No clients found{hasActiveFilters ? ' for the selected filters' : ''}</td></tr>
              : clients.map(c => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
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

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Client</DialogTitle></DialogHeader>
          {deleteTarget && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to permanently delete <strong>{deleteTarget.firstName} {deleteTarget.lastName}</strong> ({deleteTarget.clientCode})?
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Clients with brokerage history cannot be deleted.
              </p>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { UserPlus, Search, ArrowRightLeft, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'
import { ClientWithOperator } from '@/types'

interface Employee { id: string; name: string; department: string }

export default function ClientMasterPage() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientWithOperator[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [transferClient, setTransferClient] = useState<ClientWithOperator | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [newOperatorId, setNewOperatorId] = useState('')
  const [transferring, setTransferring] = useState(false)
  const limit = 25

  const fetchClients = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page)); params.set('limit', String(limit))
    if (search) params.set('search', search)
    if (dept !== 'all') params.set('department', dept)
    fetch(`/api/clients?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) { setClients(d.data.clients); setTotal(d.data.total) } })
      .finally(() => setLoading(false))
  }, [search, dept, page])

  useEffect(() => { const t = setTimeout(fetchClients, 300); return () => clearTimeout(t) }, [fetchClients])

  const openTransfer = (client: ClientWithOperator) => {
    setTransferClient(client)
    setNewOperatorId('')
    fetch(`/api/employees?department=${client.department}&isActive=true`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmployees(d.data) })
  }

  const handleTransfer = async () => {
    if (!transferClient || !newOperatorId) return
    setTransferring(true)
    const res = await fetch(`/api/clients/${transferClient.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorId: newOperatorId }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success('Client transferred successfully')
      setTransferClient(null)
      fetchClients()
    } else {
      toast.error(data.error || 'Transfer failed')
    }
    setTransferring(false)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Master</h1>
          <p className="text-sm text-gray-500">Manage all clients across departments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/masters/clients/new')} className="gap-2">
            <UserPlus className="h-4 w-4" />Add Client
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search clients..." className="pl-9 h-9" />
        </div>
        <Select value={dept} onValueChange={(v) => { setDept(v); setPage(1) }}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            <SelectItem value="EQUITY">Equity</SelectItem>
            <SelectItem value="MUTUAL_FUND">Mutual Fund</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Code', 'Name', 'Phone', 'Department', 'Operator', 'Status', 'Added', 'Actions'].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-semibold text-gray-600 text-xs uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}><td colSpan={8} className="px-3 py-2"><Skeleton className="h-8 w-full" /></td></tr>
            )) : clients.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2.5 font-mono text-xs font-medium text-gray-700">{c.clientCode}</td>
                <td className="px-3 py-2.5 font-medium text-gray-800">{[c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ')}</td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{c.phone}</td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className={c.department === 'EQUITY' ? 'border-blue-300 text-blue-700' : 'border-green-300 text-green-700'}>
                    {c.department === 'EQUITY' ? 'Equity' : 'MF'}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{c.operator.name}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === 'TRADED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.department === 'EQUITY' ? c.status.replace('_', ' ') : c.mfStatus}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-500 text-xs">{formatDate(c.createdAt)}</td>
                <td className="px-3 py-2.5">
                  <Button size="sm" variant="ghost" onClick={() => openTransfer(c)} className="h-7 text-xs gap-1">
                    <ArrowRightLeft className="h-3 w-3" />Transfer
                  </Button>
                </td>
              </tr>
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

      {/* Transfer Dialog */}
      <Dialog open={!!transferClient} onOpenChange={() => setTransferClient(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transfer Client</DialogTitle>
          </DialogHeader>
          {transferClient && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Transfer <strong>{transferClient.firstName} {transferClient.lastName}</strong> to a new operator
              </p>
              <div className="space-y-1.5">
                <Label>New Operator</Label>
                <Select value={newOperatorId} onValueChange={setNewOperatorId}>
                  <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
                  <SelectContent>
                    {employees.filter((e) => e.id !== transferClient.operatorId).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setTransferClient(null)}>Cancel</Button>
                <Button className="flex-1" onClick={handleTransfer} disabled={!newOperatorId || transferring}>
                  {transferring ? 'Transferring...' : 'Confirm Transfer'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Users, UserPlus } from 'lucide-react'
import { formatDate, getInitials, cn } from '@/lib/utils'
import { ClientWithOperator } from '@/types'
import Link from 'next/link'

export default function AllClientsPage() {
  const [clients, setClients] = useState<ClientWithOperator[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('all')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25

  const fetchClients = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    if (search) params.set('search', search)
    if (dept !== 'all') params.set('department', dept)
    if (status !== 'all') params.set('status', status)
    fetch(`/api/clients?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) { setClients(d.data.clients); setTotal(d.data.total) } })
      .finally(() => setLoading(false))
  }, [search, dept, status, page])

  useEffect(() => { const t = setTimeout(fetchClients, 300); return () => clearTimeout(t) }, [fetchClients])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Clients</h1>
          <p className="text-sm text-gray-500">All clients across all operators</p>
        </div>
        <Link href="/masters/clients/new">
          <Button className="gap-2">
            <UserPlus className="h-4 w-4" />New Client
          </Button>
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search clients…" className="pl-9 h-9 text-sm" />
          </div>
          <Select value={dept} onValueChange={(v) => { setDept(v); setPage(1) }}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="EQUITY">Equity</SelectItem>
              <SelectItem value="MUTUAL_FUND">Mutual Fund</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="TRADED">Traded</SelectItem>
              <SelectItem value="NOT_TRADED">Not Traded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Code', 'Name', 'Phone', 'Department', 'Operator', 'Status', 'Remark', 'Added'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
              ))
            ) : clients.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No clients found</p>
              </td></tr>
            ) : clients.map((c) => (
              <tr key={c.id} className={cn('border-b border-gray-100 hover:bg-gray-50', c.status === 'TRADED' ? 'bg-green-50' : 'bg-white')}>
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
                  <span className={cn('text-xs px-2 py-1 rounded-full font-medium', c.status === 'TRADED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                    {c.department === 'EQUITY' ? c.status.replace('_', ' ') : c.mfStatus.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {c.department === 'EQUITY' ? c.remark.replace(/_/g, ' ') : c.mfRemark.replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(c.createdAt)}</td>
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
    </div>
  )
}

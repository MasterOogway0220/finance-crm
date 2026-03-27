'use client'
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, X } from 'lucide-react'
import { formatDate, getInitials } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'

interface ClosedClient {
  id: string
  clientCode: string
  firstName: string
  middleName: string | null
  lastName: string
  phone: string | null
  email: string | null
  dob: string | null
  pan: string | null
  closedAt: string
}

export default function ClosedAccountMasterPage() {
  const [clients, setClients] = useState<ClosedClient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 400)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25

  const fetchClients = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    if (search) params.set('search', search)
    fetch(`/api/clients/closed?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) { setClients(d.data.clients); setTotal(d.data.pagination.total) } })
      .finally(() => setLoading(false))
  }, [search, page])

  useEffect(() => { fetchClients() }, [fetchClients])
  useEffect(() => { setPage(1) }, [search])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="page-container space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Closed Account Master</h1>
          <p className="text-sm text-gray-500">{total > 0 ? `${total} closed accounts` : 'Clients removed from all active masters'}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Name, code, PAN or phone…" className="pl-9 h-9 text-sm" />
          </div>
          {searchInput && (
            <Button variant="ghost" size="sm" onClick={() => setSearchInput('')} className="h-9 gap-1.5 text-gray-500 hover:text-gray-800">
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
              {['Code', 'Name', 'Phone', 'Email', 'DOB', 'PAN', 'Closed On'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
                ))
              : clients.length === 0
              ? <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">No closed accounts found{search ? ' for this search' : ''}</td></tr>
              : clients.map(c => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{c.clientCode}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white bg-gray-500">
                          {getInitials([c.firstName, c.lastName].join(' '))}
                        </div>
                        <span className="font-medium text-gray-800">{[c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.phone && c.phone !== '0000000000' ? c.phone : '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.dob ? formatDate(c.dob) : '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{c.pan || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(c.closedAt)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>{total} records · Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}

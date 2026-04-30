'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Search, Download, ArrowLeft, AlertTriangle, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn, getInitials } from '@/lib/utils'
import { getEffectiveRole } from '@/lib/roles'
import { useDebounce } from '@/hooks/use-debounce'
import Link from 'next/link'

interface Operator { id: string; name: string }

interface DormantClient {
  id: string
  clientCode: string
  firstName: string
  middleName: string | null
  lastName: string
  phone: string
  operator: Operator
  lastBrokerageDate: string | null
  daysInactive: number
  dismissedAt: string | null
  dismissedBy: Operator | null
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function NoBusinessPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const role = session?.user ? getEffectiveRole(session.user) : undefined

  // Redirect non-admins
  useEffect(() => {
    if (session && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      router.replace('/reports')
    }
  }, [session, role, router])

  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 400)
  const [operatorId, setOperatorId] = useState('all')
  const [operators, setOperators] = useState<Operator[]>([])
  const [clients, setClients] = useState<DormantClient[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 25

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    if (search) params.set('search', search)
    if (operatorId !== 'all') params.set('operator', operatorId)

    fetch(`/api/reports/no-business?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setClients(d.data.clients)
          setTotal(d.data.pagination.total)
          setOperators(d.data.operators)
        }
      })
      .finally(() => setLoading(false))
  }, [search, operatorId, page])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDismiss = async (clientId: string) => {
    const res = await fetch('/api/reports/no-business/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success('Client dismissed from list')
      setClients((prev) => prev.filter((c) => c.id !== clientId))
      setTotal((t) => t - 1)
    } else {
      toast.error(data.error || 'Dismiss failed')
    }
  }

  const handleExport = () => {
    const params = new URLSearchParams({ export: 'true' })
    if (search) params.set('search', search)
    if (operatorId !== 'all') params.set('operator', operatorId)
    window.open(`/api/reports/no-business?${params}`, '_blank')
  }

  const totalPages = Math.ceil(total / limit)

  if (session && role !== 'SUPER_ADMIN' && role !== 'ADMIN') return null

  return (
    <div className="page-container space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/reports">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="page-title">No Business — Equity Clients</h1>
          <p className="text-sm text-gray-500">Equity clients with no brokerage for more than 2 months</p>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
        <p className="text-sm font-medium text-orange-800">
          {loading ? 'Loading…' : `${total} client${total === 1 ? '' : 's'} currently on this list`}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(1) }}
              placeholder="Search by code or name…"
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={operatorId} onValueChange={(v) => { setOperatorId(v); setPage(1) }}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="All Operators" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Operators</SelectItem>
              {operators.map((op) => (
                <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Code</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Phone</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Operator</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Last Brokerage</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Days Inactive</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-2">
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ))
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No dormant clients — all equity clients have recent brokerage activity</p>
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <ClientRow key={client.id} client={client} onDismiss={handleDismiss} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>{total} clients · Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientRow({ client, onDismiss }: { client: DormantClient; onDismiss: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const fullName = [client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ')

  const handleConfirmDismiss = async () => {
    setDismissing(true)
    await onDismiss(client.id)
    setDismissing(false)
    setOpen(false)
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-orange-50 transition-colors bg-white">
      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{client.clientCode}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
            {getInitials(fullName)}
          </div>
          <span className="font-medium text-gray-800">{fullName}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-gray-600 text-xs">
        <a href={`tel:${client.phone}`} className="hover:text-blue-600">{client.phone}</a>
      </td>
      <td className="px-4 py-3 text-gray-600 text-xs">{client.operator.name}</td>
      <td className="px-4 py-3 text-xs">
        {client.lastBrokerageDate ? (
          <span className="text-gray-600">{formatDateShort(client.lastBrokerageDate)}</span>
        ) : (
          <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-xs font-medium">Never</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'text-xs font-semibold px-2 py-0.5 rounded-full',
          client.daysInactive > 90
            ? 'bg-amber-100 text-amber-700'
            : 'bg-orange-100 text-orange-700'
        )}>
          {client.daysInactive} days
        </span>
      </td>
      <td className="px-4 py-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              Dismiss
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <p className="text-sm font-medium text-gray-800 mb-1">Dismiss this client?</p>
            <p className="text-xs text-gray-500 mb-3">
              They will be removed from this list. They will re-appear automatically if they remain inactive.
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleConfirmDismiss}
                disabled={dismissing}
              >
                {dismissing ? 'Dismissing…' : 'Confirm'}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </td>
    </tr>
  )
}

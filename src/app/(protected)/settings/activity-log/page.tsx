'use client'
import { useState, useEffect, useCallback } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { Activity } from 'lucide-react'

const MODULE_COLORS: Record<string, string> = {
  tasks: 'bg-blue-100 text-blue-700',
  clients: 'bg-green-100 text-green-700',
  brokerage: 'bg-yellow-100 text-yellow-700',
  employees: 'bg-purple-100 text-purple-700',
  auth: 'bg-gray-100 text-gray-700',
}

interface LogEntry {
  id: string
  createdAt: Date
  user: { name: string }
  action: string
  module: string
  details?: string | null
  ipAddress?: string | null
}

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [module, setModule] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 50

  const fetchLogs = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    if (module !== 'all') params.set('module', module)
    fetch(`/api/settings/activity-log?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) { setLogs(d.data.logs); setTotal(d.data.total) } })
      .finally(() => setLoading(false))
  }, [module, page])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <p className="text-sm text-gray-500">System-wide audit trail</p>
      </div>

      <div className="flex gap-2">
        <Select value={module} onValueChange={(v) => { setModule(v); setPage(1) }}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            {['tasks', 'clients', 'brokerage', 'employees', 'auth'].map((m) => (
              <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Timestamp', 'User', 'Action', 'Module', 'Details'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-2"><Skeleton className="h-6 w-full" /></td></tr>
              ))
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No activity logs found</p>
              </td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                <td className="px-4 py-2.5 font-medium text-gray-800">{log.user.name}</td>
                <td className="px-4 py-2.5 text-gray-700">{log.action}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODULE_COLORS[log.module] || 'bg-gray-100 text-gray-600'}`}>
                    {log.module}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">{log.details || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>{total} entries · Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}

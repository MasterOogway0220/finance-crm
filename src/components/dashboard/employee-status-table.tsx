'use client'

import { useEffect, useState, useCallback } from 'react'
import { Wifi, WifiOff, Clock, LogIn, LogOut, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmployeeStatus {
  id: string
  name: string
  department: string
  designation: string
  isOnline: boolean
  lastSeenAt: string | null
  firstLoginToday: string | null
  lastLogoutToday: string | null
  todaySessionCount: number
}

interface LoginHistoryEntry {
  id: string
  loginAt: string
  logoutAt: string | null
  employee: { id: string; name: string; department: string; designation: string }
}

const DEPT_LABELS: Record<string, string> = {
  EQUITY: 'Equity',
  MUTUAL_FUND: 'Mutual Fund',
  BACK_OFFICE: 'Back Office',
  ADMIN: 'Admin',
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function EmployeeStatusTable() {
  const [employees, setEmployees] = useState<EmployeeStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<LoginHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyDate, setHistoryDate] = useState(() => new Date().toISOString().slice(0, 10))

  const fetchStatus = useCallback(() => {
    fetch('/api/admin/employee-status')
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmployees(d.data) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchStatus()
    // Refresh every minute
    const id = setInterval(fetchStatus, 60_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  const fetchHistory = useCallback((date: string) => {
    setHistoryLoading(true)
    fetch(`/api/admin/login-history?date=${date}&limit=100`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setHistory(d.data) })
      .finally(() => setHistoryLoading(false))
  }, [])

  useEffect(() => {
    if (showHistory) fetchHistory(historyDate)
  }, [showHistory, historyDate, fetchHistory])

  const onlineCount = employees.filter((e) => e.isOnline).length
  const offlineCount = employees.length - onlineCount

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse">
        <div className="h-4 w-48 bg-gray-200 rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 border-b px-6 py-4">
        <h2 className="font-semibold text-gray-900 flex-1">Employee Status</h2>
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          {onlineCount} Online
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
          <span className="h-2 w-2 rounded-full bg-gray-300" />
          {offlineCount} Offline
        </span>
      </div>

      {/* Status Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3 text-left">Employee</th>
              <th className="px-6 py-3 text-left">Department</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Login (Today)</th>
              <th className="px-6 py-3 text-left">Logout (Today)</th>
              <th className="px-6 py-3 text-left">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-gray-50">
                <td className="px-6 py-3">
                  <p className="font-medium text-gray-900">{emp.name}</p>
                  <p className="text-xs text-gray-400">{emp.designation}</p>
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {DEPT_LABELS[emp.department] ?? emp.department}
                </td>
                <td className="px-6 py-3">
                  {emp.isOnline ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                      <Wifi className="h-3 w-3" />
                      Online
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                      <WifiOff className="h-3 w-3" />
                      Offline
                    </span>
                  )}
                </td>
                <td className="px-6 py-3">
                  {emp.firstLoginToday ? (
                    <span className="inline-flex items-center gap-1 text-gray-700">
                      <LogIn className="h-3.5 w-3.5 text-blue-500" />
                      {formatTime(emp.firstLoginToday)}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not logged in</span>
                  )}
                </td>
                <td className="px-6 py-3">
                  {emp.lastLogoutToday ? (
                    <span className="inline-flex items-center gap-1 text-gray-700">
                      <LogOut className="h-3.5 w-3.5 text-orange-500" />
                      {formatTime(emp.lastLogoutToday)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-3">
                  <span className={cn('text-xs', emp.isOnline ? 'text-green-600' : 'text-gray-400')}>
                    <Clock className="inline h-3 w-3 mr-1" />
                    {timeAgo(emp.lastSeenAt)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Toggle history */}
      <div className="border-t px-6 py-3">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
        >
          {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {showHistory ? 'Hide' : 'View'} Login/Logout History
        </button>

        {showHistory && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-600">Date:</label>
              <input
                type="date"
                className="rounded border border-gray-300 px-2 py-1 text-sm"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
              />
            </div>

            {historyLoading ? (
              <p className="text-sm text-gray-400">Loading history...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-400">No login activity on this date.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2 text-left">Employee</th>
                      <th className="px-4 py-2 text-left">Department</th>
                      <th className="px-4 py-2 text-left">Login Time</th>
                      <th className="px-4 py-2 text-left">Logout Time</th>
                      <th className="px-4 py-2 text-left">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((log) => {
                      const durationMs = log.logoutAt
                        ? new Date(log.logoutAt).getTime() - new Date(log.loginAt).getTime()
                        : null
                      const durationStr = durationMs
                        ? `${Math.floor(durationMs / 3600000)}h ${Math.floor((durationMs % 3600000) / 60000)}m`
                        : '—'
                      return (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-900">{log.employee.name}</td>
                          <td className="px-4 py-2 text-gray-600">
                            {DEPT_LABELS[log.employee.department] ?? log.employee.department}
                          </td>
                          <td className="px-4 py-2 text-gray-700">{formatDateTime(log.loginAt)}</td>
                          <td className="px-4 py-2 text-gray-700">{formatDateTime(log.logoutAt)}</td>
                          <td className="px-4 py-2 text-gray-500">{durationStr}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

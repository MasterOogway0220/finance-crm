'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { Wifi, WifiOff, Clock, LogIn, LogOut, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface TodaySession {
  id: string
  loginAt: string
  logoutAt: string | null
}

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
  todaySessions: TodaySession[]
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

const HISTORY_LIMIT = 50

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

function durationStr(loginAt: string, logoutAt: string | null): string {
  if (!logoutAt) return '—'
  const ms = new Date(logoutAt).getTime() - new Date(loginAt).getTime()
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

function totalActiveStr(sessions: TodaySession[]): string {
  const ms = sessions.reduce((acc, s) => {
    if (!s.logoutAt) return acc
    return acc + (new Date(s.logoutAt).getTime() - new Date(s.loginAt).getTime())
  }, 0)
  if (ms === 0) return null as unknown as string
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function exportHistoryCSV(history: LoginHistoryEntry[], date: string) {
  const rows = [
    ['Employee', 'Department', 'Designation', 'Login Time', 'Logout Time', 'Duration'],
    ...history.map((log) => [
      log.employee.name,
      DEPT_LABELS[log.employee.department] ?? log.employee.department,
      log.employee.designation,
      formatDateTime(log.loginAt),
      formatDateTime(log.logoutAt),
      durationStr(log.loginAt, log.logoutAt),
    ]),
  ]
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `login-history-${date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function EmployeeStatusTable() {
  const [employees, setEmployees] = useState<EmployeeStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<LoginHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyDate, setHistoryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [historyEmployee, setHistoryEmployee] = useState('all')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)

  const fetchStatus = useCallback(() => {
    fetch('/api/admin/employee-status')
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmployees(d.data) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 60_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  const fetchHistory = useCallback((date: string, employeeId: string, page: number) => {
    setHistoryLoading(true)
    const params = new URLSearchParams({ date, page: String(page), limit: String(HISTORY_LIMIT) })
    if (employeeId !== 'all') params.set('employeeId', employeeId)
    fetch(`/api/admin/login-history?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setHistory(d.data)
          setHistoryTotal(d.pagination.total)
        }
      })
      .finally(() => setHistoryLoading(false))
  }, [])

  useEffect(() => {
    if (showHistory) fetchHistory(historyDate, historyEmployee, historyPage)
  }, [showHistory, historyDate, historyEmployee, historyPage, fetchHistory])

  // Reset page when filters change
  const handleDateChange = (date: string) => { setHistoryDate(date); setHistoryPage(1) }
  const handleEmployeeChange = (emp: string) => { setHistoryEmployee(emp); setHistoryPage(1) }

  const toggleRow = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const onlineCount = employees.filter((e) => e.isOnline).length
  const offlineCount = employees.length - onlineCount
  const historyTotalPages = Math.ceil(historyTotal / HISTORY_LIMIT)

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm animate-pulse">
        <div className="h-4 w-48 skeleton mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 skeleton" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border px-6 py-4">
        <h2 className="font-semibold text-foreground flex-1">Employee Status</h2>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          {onlineCount} Online
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
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
            {employees.map((emp) => {
              const isExpanded = expandedRows.has(emp.id)
              const hasSessions = emp.todaySessions.length > 0
              const totalActive = hasSessions ? totalActiveStr(emp.todaySessions) : null

              return (
                <Fragment key={emp.id}>
                  <tr className={cn('hover:bg-gray-50', isExpanded && 'bg-blue-50/40')}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium text-gray-900">{emp.name}</p>
                          <p className="text-xs text-gray-400">{emp.designation}</p>
                        </div>
                        {hasSessions && (
                          <button
                            type="button"
                            onClick={() => toggleRow(emp.id)}
                            title={isExpanded ? 'Collapse sessions' : `${emp.todaySessionCount} session${emp.todaySessionCount > 1 ? 's' : ''} today`}
                            className={cn(
                              'ml-1 rounded p-0.5 transition-colors',
                              isExpanded ? 'text-blue-600 hover:bg-blue-100' : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100',
                            )}
                          >
                            <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', isExpanded && 'rotate-180')} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {DEPT_LABELS[emp.department] ?? emp.department}
                    </td>
                    <td className="px-6 py-3">
                      {emp.isOnline ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                          <Wifi className="h-3 w-3" />Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                          <WifiOff className="h-3 w-3" />Offline
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

                  {/* Expanded session timeline */}
                  {isExpanded && (
                    <tr className="bg-blue-50/20">
                      <td colSpan={6} className="px-8 py-3">
                        <div className="flex items-start gap-6">
                          <div className="flex-1 space-y-1.5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                              Today&apos;s Sessions
                            </p>
                            {emp.todaySessions.map((session, idx) => {
                              const isActive = !session.logoutAt
                              return (
                                <div
                                  key={session.id}
                                  className={cn(
                                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                                    isActive ? 'bg-green-50 border border-green-200' : 'bg-white border border-gray-200',
                                  )}
                                >
                                  <span className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                                    <LogIn className="h-3.5 w-3.5 text-blue-500" />
                                    {formatTime(session.loginAt)}
                                  </span>
                                  <span className="text-gray-400">→</span>
                                  {isActive ? (
                                    <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                      Active now
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-orange-700 font-medium">
                                      <LogOut className="h-3.5 w-3.5 text-orange-500" />
                                      {formatTime(session.logoutAt)}
                                    </span>
                                  )}
                                  {!isActive && (
                                    <span className="ml-auto text-xs text-gray-400 font-medium">
                                      {durationStr(session.loginAt, session.logoutAt)}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* Total active time summary */}
                          {totalActive && (
                            <div className="shrink-0 rounded-xl bg-white border border-gray-200 px-4 py-3 text-center min-w-[100px]">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Total Active</p>
                              <p className="text-lg font-bold text-gray-800 mt-0.5">{totalActive}</p>
                              <p className="text-[10px] text-gray-400">{emp.todaySessionCount} session{emp.todaySessionCount > 1 ? 's' : ''}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
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
            {/* Filters + Export */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">Date:</label>
                <input
                  type="date"
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                  value={historyDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                />
              </div>
              <Select value={historyEmployee} onValueChange={handleEmployeeChange}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto gap-1.5 h-8 text-xs"
                disabled={history.length === 0}
                onClick={() => exportHistoryCSV(history, historyDate)}
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>

            {historyLoading ? (
              <p className="text-sm text-gray-400">Loading history...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-400">No login activity found.</p>
            ) : (
              <>
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
                      {history.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-900">{log.employee.name}</td>
                          <td className="px-4 py-2 text-gray-600">
                            {DEPT_LABELS[log.employee.department] ?? log.employee.department}
                          </td>
                          <td className="px-4 py-2 text-gray-700">{formatDateTime(log.loginAt)}</td>
                          <td className="px-4 py-2 text-gray-700">{formatDateTime(log.logoutAt)}</td>
                          <td className="px-4 py-2 text-gray-500">{durationStr(log.loginAt, log.logoutAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {historyTotalPages > 1 && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{historyTotal} records · Page {historyPage} of {historyTotalPages}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={historyPage === 1} onClick={() => setHistoryPage((p) => p - 1)}>
                        Previous
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={historyPage === historyTotalPages} onClick={() => setHistoryPage((p) => p + 1)}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { Wifi, WifiOff, Clock, LogIn, LogOut, ChevronDown } from 'lucide-react'
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

export function EmployeeStatusTable() {
  const [employees, setEmployees] = useState<EmployeeStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

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

  const toggleRow = (id: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const onlineCount = employees.filter((e) => e.isOnline).length
  const offlineCount = employees.length - onlineCount

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

    </div>
  )
}

'use client'

import { useEffect, useState, useCallback, useMemo, Fragment } from 'react'
import { Clock, LogIn, LogOut, Download, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface Session {
  id: string
  loginAt: string
  logoutAt: string | null
}

interface AttendanceEntry {
  date: string
  employeeId: string
  employeeName: string
  department: string
  designation: string
  firstLogin: string
  lastLogout: string | null
  totalDurationMs: number
  sessions: Session[]
}

interface Employee {
  id: string
  name: string
}

const DEPT_LABELS: Record<string, string> = {
  EQUITY: 'Equity',
  MUTUAL_FUND: 'Mutual Fund',
  BACK_OFFICE: 'Back Office',
  ADMIN: 'Admin',
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: new Date(0, i).toLocaleString('default', { month: 'long' }),
}))

const YEARS = ['2024', '2025', '2026', '2027'].map((y) => ({ value: y, label: y }))

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

function durationStr(ms: number): string {
  if (ms <= 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function sessionDuration(loginAt: string, logoutAt: string | null): string {
  if (!logoutAt) return '—'
  const ms = new Date(logoutAt).getTime() - new Date(loginAt).getTime()
  return durationStr(ms)
}

function exportCSV(data: AttendanceEntry[], detailed: boolean) {
  if (detailed) {
    const rows = [
      ['Employee', 'Department', 'Date', 'Session #', 'Login Time', 'Logout Time', 'Duration'],
      ...data.flatMap((entry) =>
        entry.sessions.map((s, idx) => [
          entry.employeeName,
          DEPT_LABELS[entry.department] ?? entry.department,
          entry.date,
          String(idx + 1),
          formatTime(s.loginAt),
          formatTime(s.logoutAt),
          sessionDuration(s.loginAt, s.logoutAt),
        ]),
      ),
    ]
    downloadCSV(rows, 'login-history-detailed')
  } else {
    const rows = [
      ['Employee', 'Department', 'Date', 'First Login', 'Last Logout', 'Total Work Time'],
      ...data.map((entry) => [
        entry.employeeName,
        DEPT_LABELS[entry.department] ?? entry.department,
        entry.date,
        formatTime(entry.firstLogin),
        formatTime(entry.lastLogout),
        durationStr(entry.totalDurationMs),
      ]),
    ]
    downloadCSV(rows, 'login-history-summary')
  }
}

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function LoginHistoryPage() {
  const today = new Date()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [data, setData] = useState<AttendanceEntry[]>([])
  const [loading, setLoading] = useState(false)

  // Filters
  const [filterEmployee, setFilterEmployee] = useState('all')
  const [filterType, setFilterType] = useState<'month' | 'date'>('month')
  const [filterMonth, setFilterMonth] = useState(String(today.getMonth() + 1).padStart(2, '0'))
  const [filterYear, setFilterYear] = useState(String(today.getFullYear()))
  const [filterDate, setFilterDate] = useState(today.toISOString().slice(0, 10))

  // View toggles
  const [detailed, setDetailed] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterType === 'date') {
      params.set('date', filterDate)
    } else {
      params.set('month', `${filterYear}-${filterMonth}`)
    }
    if (filterEmployee !== 'all') params.set('employeeId', filterEmployee)

    fetch(`/api/admin/attendance?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setData(d.data)
          if (d.employees) setEmployees(d.employees)
        }
      })
      .finally(() => setLoading(false))
  }, [filterType, filterDate, filterYear, filterMonth, filterEmployee])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleRow = (key: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // When detailed is unchecked, collapse all
  useEffect(() => {
    if (!detailed) setExpandedRows(new Set())
  }, [detailed])

  const filterLabel = useMemo(() => {
    if (filterType === 'date') return formatDate(filterDate)
    const monthName = MONTHS.find((m) => m.value === filterMonth)?.label ?? ''
    return `${monthName} ${filterYear}`
  }, [filterType, filterDate, filterMonth, filterYear])

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Login / Logoff History</h1>
        <p className="text-sm text-gray-500 mt-0.5">Track employee attendance and working hours</p>
      </div>

      {/* Filters Card */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-4">
          {/* Employee */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</label>
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger className="w-48 h-9 text-sm">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filter Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">View By</label>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as 'month' | 'date')}>
              <SelectTrigger className="w-32 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Month + Year or Date */}
          {filterType === 'month' ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Month</label>
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="w-36 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Year</label>
                <Select value={filterYear} onValueChange={setFilterYear}>
                  <SelectTrigger className="w-24 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
              <input
                type="date"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm h-9"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>
          )}

          {/* Detailed checkbox */}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="checkbox"
              id="detailed-toggle"
              checked={detailed}
              onChange={(e) => setDetailed(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="detailed-toggle" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
              Detailed
            </label>
          </div>

          {/* Export */}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-9 text-sm"
            disabled={data.length === 0}
            onClick={() => exportCSV(data, detailed)}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Showing {data.length} record{data.length !== 1 ? 's' : ''} for {filterLabel}
          {filterEmployee !== 'all' && employees.length > 0 && ` — ${employees.find((e) => e.id === filterEmployee)?.name}`}
        </p>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No login activity found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting the filters above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3 text-left">Employee</th>
                  <th className="px-5 py-3 text-left">Department</th>
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-left">First Login</th>
                  <th className="px-5 py-3 text-left">Last Logout</th>
                  <th className="px-5 py-3 text-left">Total Work Time</th>
                  {detailed && <th className="px-5 py-3 text-left w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((entry) => {
                  const rowKey = `${entry.employeeId}_${entry.date}`
                  const isExpanded = expandedRows.has(rowKey)

                  return (
                    <Fragment key={rowKey}>
                      <tr className={cn('hover:bg-gray-50 transition-colors', isExpanded && 'bg-blue-50/40')}>
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-900">{entry.employeeName}</p>
                          <p className="text-xs text-gray-400">{entry.designation}</p>
                        </td>
                        <td className="px-5 py-3 text-gray-600">
                          {DEPT_LABELS[entry.department] ?? entry.department}
                        </td>
                        <td className="px-5 py-3 text-gray-700 font-medium">
                          {formatDate(entry.date)}
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1 text-gray-700">
                            <LogIn className="h-3.5 w-3.5 text-blue-500" />
                            {formatTime(entry.firstLogin)}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {entry.lastLogout ? (
                            <span className="inline-flex items-center gap-1 text-gray-700">
                              <LogOut className="h-3.5 w-3.5 text-orange-500" />
                              {formatTime(entry.lastLogout)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            <Clock className="h-3 w-3" />
                            {entry.lastLogout === null && entry.totalDurationMs === 0
                              ? 'In progress'
                              : durationStr(entry.totalDurationMs)}
                          </span>
                        </td>
                        {detailed && (
                          <td className="px-5 py-3">
                            <button
                              type="button"
                              onClick={() => toggleRow(rowKey)}
                              className={cn(
                                'rounded p-1 transition-colors',
                                isExpanded ? 'text-blue-600 hover:bg-blue-100' : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100',
                              )}
                              title={`${entry.sessions.length} session${entry.sessions.length > 1 ? 's' : ''}`}
                            >
                              <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', isExpanded && 'rotate-180')} />
                            </button>
                          </td>
                        )}
                      </tr>

                      {/* Detailed sessions */}
                      {detailed && isExpanded && (
                        <tr className="bg-blue-50/20">
                          <td colSpan={7} className="px-8 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                              Sessions ({entry.sessions.length})
                            </p>
                            <div className="space-y-1.5">
                              {entry.sessions.map((session, idx) => {
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
                                    <span className="text-gray-400">&rarr;</span>
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
                                        {sessionDuration(session.loginAt, session.logoutAt)}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
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
        )}
      </div>
    </div>
  )
}

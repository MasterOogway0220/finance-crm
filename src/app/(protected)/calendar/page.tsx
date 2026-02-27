'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { format, parseISO, eachDayOfInterval, isWeekend } from 'date-fns'
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Users,
  Plus,
  X,
  ClipboardList,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useActiveRoleStore } from '@/stores/active-role-store'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HolidayEntry {
  date: string
  name: string
  type: 'market' | 'bank'
}

interface LeaveBalance {
  totalLeaves: number
  takenLeaves: number
  pendingLeaves: number
  year: number
}

interface LeaveApplication {
  id: string
  employeeId: string
  reason: string
  fromDate: string
  toDate: string
  days: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  reviewNote?: string | null
  createdAt: string
  employee: { id: string; name: string; department: string; designation: string }
  reviewedBy?: { id: string; name: string } | null
}

interface Employee {
  id: string
  name: string
  department: string
  designation: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEPARTMENTS = ['EQUITY', 'MUTUAL_FUND', 'BACK_OFFICE', 'ADMIN']
const DEPT_LABELS: Record<string, string> = {
  EQUITY: 'Equity',
  MUTUAL_FUND: 'Mutual Fund',
  BACK_OFFICE: 'Back Office',
  ADMIN: 'Admin',
}

function calcWorkingDays(from: Date, to: Date, holidays: string[]): number {
  const holidaySet = new Set(holidays)
  let count = 0
  const days = eachDayOfInterval({ start: from, end: to })
  for (const d of days) {
    const dateStr = format(d, 'yyyy-MM-dd')
    if (!isWeekend(d) && !holidaySet.has(dateStr)) count++
  }
  return count
}

function statusBadge(status: LeaveApplication['status']) {
  switch (status) {
    case 'APPROVED':
      return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"><CheckCircle2 className="h-3 w-3" />Approved</span>
    case 'PENDING':
      return <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700"><Clock className="h-3 w-3" />Pending</span>
    case 'REJECTED':
      return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"><XCircle className="h-3 w-3" />Rejected</span>
    case 'CANCELLED':
      return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"><X className="h-3 w-3" />Cancelled</span>
  }
}

// ---------------------------------------------------------------------------
// Apply Leave Dialog
// ---------------------------------------------------------------------------

interface ApplyLeaveDialogProps {
  onClose: () => void
  onSuccess: () => void
  allHolidays: string[]
  isAdmin: boolean
  defaultEmployeeId: string
  defaultDepartment: string
}

function ApplyLeaveDialog({
  onClose,
  onSuccess,
  allHolidays,
  isAdmin,
  defaultEmployeeId,
  defaultDepartment,
}: ApplyLeaveDialogProps) {
  const [department, setDepartment] = useState(defaultDepartment)
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [reason, setReason] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [days, setDays] = useState(0)
  const [loading, setLoading] = useState(false)

  // Fetch employees for selected department
  useEffect(() => {
    if (!department) return
    fetch(`/api/employees?department=${department}&isActive=true`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setEmployees(d.data)
      })
  }, [department])

  // Auto-calc working days when dates change
  useEffect(() => {
    if (!fromDate || !toDate) { setDays(0); return }
    const from = new Date(fromDate)
    const to = new Date(toDate)
    if (from > to) { setDays(0); return }
    setDays(calcWorkingDays(from, to, allHolidays))
  }, [fromDate, toDate, allHolidays])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!employeeId || !reason.trim() || !fromDate || !toDate || days < 1) {
      toast.error('Please fill all fields. Ensure from/to dates result in at least 1 working day.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, reason, fromDate, toDate, days }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Leave application submitted successfully.')
        onSuccess()
        onClose()
      } else {
        toast.error(data.error || 'Failed to submit leave application.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Apply for Leave</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* Department */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
              value={department}
              onChange={(e) => { setDepartment(e.target.value); setEmployeeId('') }}
              disabled={!isAdmin}
            >
              <option value="">Select department</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{DEPT_LABELS[d]}</option>
              ))}
            </select>
          </div>

          {/* Employee */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Employee Name</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={!isAdmin || !department}
            >
              <option value="">Select employee</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name} — {emp.designation}</option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              rows={3}
              placeholder="Briefly mention the reason for leave..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {/* From – To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">From Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">To Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          {/* Working days */}
          <div className="rounded-lg bg-blue-50 px-4 py-2.5">
            <p className="text-sm text-blue-700">
              Working days:{' '}
              <span className="font-bold text-blue-900">{days}</span>
              {days > 0 && ' (excluding weekends & holidays)'}
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={loading || days < 1}>
              {loading ? 'Submitting...' : 'Submit Application'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mark Leave Dialog (Admin only)
// ---------------------------------------------------------------------------

interface MarkLeaveDialogProps {
  onClose: () => void
  onSuccess: () => void
}

function MarkLeaveDialog({ onClose, onSuccess }: MarkLeaveDialogProps) {
  const [department, setDepartment] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [date, setDate] = useState('')
  const [days, setDays] = useState(1)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!department) return
    fetch(`/api/employees?department=${department}&isActive=true`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmployees(d.data) })
  }, [department])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!employeeId || !date || days < 1) {
      toast.error('Please fill all required fields.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/leaves/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, date, days, note }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Leave marked successfully.')
        onSuccess()
        onClose()
      } else {
        toast.error(data.error || 'Failed to mark leave.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Mark Employee Absence</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <p className="text-sm text-gray-500">
            Use this to record an emergency absence (e.g., via WhatsApp) directly as an approved leave.
          </p>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              value={department}
              onChange={(e) => { setDepartment(e.target.value); setEmployeeId('') }}
            >
              <option value="">Select department</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{DEPT_LABELS[d]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Employee</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={!department}
            >
              <option value="">Select employee</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name} — {emp.designation}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Date of Absence</label>
              <input
                type="date"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">No. of Days</label>
              <input
                type="number"
                min={1}
                max={30}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                value={days}
                onChange={(e) => setDays(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Note (optional)</label>
            <input
              type="text"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="e.g. Informed via WhatsApp"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-700" disabled={loading}>
              {loading ? 'Marking...' : 'Mark Absence'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const { data: session } = useSession()
  const { activeRole } = useActiveRoleStore()

  const effectiveRole = activeRole || session?.user?.role || ''
  const isAdmin = effectiveRole === 'SUPER_ADMIN' || effectiveRole === 'ADMIN'

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const year = currentMonth.getFullYear()

  const [holidays, setHolidays] = useState<HolidayEntry[]>([])
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null)
  const [applications, setApplications] = useState<LeaveApplication[]>([])
  const [todayLeaves, setTodayLeaves] = useState<LeaveApplication[]>([])
  const [showApplyDialog, setShowApplyDialog] = useState(false)
  const [showMarkDialog, setShowMarkDialog] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState<{ id: string; note: string } | null>(null)

  // Fetch holidays when year changes
  useEffect(() => {
    fetch(`/api/calendar/holidays?year=${year}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setHolidays(d.data) })
  }, [year])

  // Also fetch adjacent year if near December
  useEffect(() => {
    if (currentMonth.getMonth() >= 10) {
      fetch(`/api/calendar/holidays?year=${year + 1}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setHolidays((prev) => {
            const existing = new Set(prev.map((h) => h.date))
            const newOnes = (d.data as HolidayEntry[]).filter((h) => !existing.has(h.date))
            return [...prev, ...newOnes]
          })
        })
    }
  }, [currentMonth, year])

  const fetchApplications = useCallback(() => {
    fetch('/api/leaves')
      .then((r) => r.json())
      .then((d) => { if (d.success) setApplications(d.data) })
  }, [])

  useEffect(() => {
    fetchApplications()
  }, [fetchApplications])

  useEffect(() => {
    if (!isAdmin) {
      fetch('/api/leaves/balance')
        .then((r) => r.json())
        .then((d) => { if (d.success) setLeaveBalance(d.data) })
    }
  }, [isAdmin, applications]) // refetch when applications change

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/leaves/today')
        .then((r) => r.json())
        .then((d) => { if (d.success) setTodayLeaves(d.data) })
    }
  }, [isAdmin, applications])

  // Prepare calendar data
  const marketHolidayDates: Date[] = holidays
    .filter((h) => h.type === 'market')
    .map((h) => parseISO(h.date))

  const bankHolidayDates: Date[] = holidays
    .filter((h) => h.type === 'bank')
    .map((h) => parseISO(h.date))

  // All approved leave date ranges → individual days
  const approvedLeaveDates: Date[] = applications
    .filter((a) => a.status === 'APPROVED')
    .flatMap((a) =>
      eachDayOfInterval({ start: parseISO(a.fromDate), end: parseISO(a.toDate) })
    )

  const allHolidayStrings = holidays.map((h) => h.date)

  // Holiday name lookup for footer
  const holidayMap = new Map(holidays.map((h) => [h.date, h]))

  async function handleAction(id: string, action: 'APPROVED' | 'REJECTED' | 'CANCELLED', note?: string) {
    setActionLoading(id + action)
    try {
      const res = await fetch(`/api/leaves/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewNote: note }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(
          action === 'APPROVED' ? 'Leave approved.' :
          action === 'REJECTED' ? 'Leave rejected.' : 'Leave cancelled.'
        )
        fetchApplications()
        setRejectNote(null)
      } else {
        toast.error(data.error || 'Action failed.')
      }
    } finally {
      setActionLoading(null)
    }
  }

  const [selectedDay, setSelectedDay] = useState<Date | undefined>()
  const selectedDateStr = selectedDay ? format(selectedDay, 'yyyy-MM-dd') : null
  const selectedHoliday = selectedDateStr ? holidayMap.get(selectedDateStr) : null
  const selectedLeaves = selectedDateStr
    ? applications.filter(
        (a) =>
          a.status === 'APPROVED' &&
          format(parseISO(a.fromDate), 'yyyy-MM-dd') <= selectedDateStr &&
          format(parseISO(a.toDate), 'yyyy-MM-dd') >= selectedDateStr
      )
    : []

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar &amp; Leave</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {isAdmin ? 'Manage leave applications and view team availability.' : 'View holidays and manage your leave.'}
          </p>
        </div>
        {!isAdmin && (
          <Button onClick={() => setShowApplyDialog(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Apply for Leave
          </Button>
        )}
        {isAdmin && (
          <Button
            onClick={() => setShowMarkDialog(true)}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700"
          >
            <ClipboardList className="h-4 w-4" />
            Mark Leave
          </Button>
        )}
      </div>

      {/* --- Employee stats cards --- */}
      {!isAdmin && leaveBalance && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <CalendarDays className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Leaves</p>
                <p className="text-2xl font-bold text-gray-900">{leaveBalance.totalLeaves}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">Allocated for {leaveBalance.year}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
                <CheckCircle2 className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Leaves Taken</p>
                <p className="text-2xl font-bold text-gray-900">{leaveBalance.takenLeaves}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">Approved this year</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <Clock className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Leaves Remaining</p>
                <p className="text-2xl font-bold text-gray-900">{leaveBalance.pendingLeaves}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">Available to use</p>
          </div>
        </div>
      )}

      {/* --- Admin: Who's on leave today --- */}
      {isAdmin && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b px-6 py-4">
            <Users className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">On Leave Today</h2>
            <span className="ml-auto rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {todayLeaves.length}
            </span>
          </div>
          <div className="px-6 py-4">
            {todayLeaves.length === 0 ? (
              <p className="text-sm text-gray-500">No employees on approved leave today.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {todayLeaves.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-200 text-xs font-semibold text-green-800">
                      {l.employee.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{l.employee.name}</p>
                      <p className="text-xs text-gray-500">{DEPT_LABELS[l.employee.department] ?? l.employee.department}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Calendar + Day Detail --- */}
      <div className="flex gap-6">
        {/* Calendar card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold text-gray-900">Calendar</h2>
          </div>
          <div className="px-4 py-2">
            <style>{`
              .rdp-day_button { width: 36px; height: 36px; font-size: 13px; }
              .rdp-month_caption { font-size: 15px; font-weight: 600; }
              .day-market-holiday { background-color: #fef3c7 !important; color: #92400e !important; border-radius: 50%; font-weight: 600; }
              .day-bank-holiday { background-color: #dbeafe !important; color: #1e40af !important; border-radius: 50%; }
              .day-on-leave { background-color: #dcfce7 !important; color: #166534 !important; border-radius: 50%; }
              .day-weekend { color: #ef4444 !important; }
              .day-selected { background-color: #1d4ed8 !important; color: white !important; border-radius: 50%; }
            `}</style>
            <DayPicker
              mode="single"
              selected={selectedDay}
              onSelect={setSelectedDay}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              components={{
                PreviousMonthButton: ({ ...props }) => (
                  <button {...props} className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                ),
                NextMonthButton: ({ ...props }) => (
                  <button {...props} className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ),
              }}
              modifiers={{
                marketHoliday: marketHolidayDates,
                bankHoliday: bankHolidayDates,
                onLeave: approvedLeaveDates,
                weekend: (date: Date) => [0, 6].includes(date.getDay()),
              }}
              modifiersClassNames={{
                marketHoliday: 'day-market-holiday',
                bankHoliday: 'day-bank-holiday',
                onLeave: 'day-on-leave',
                weekend: 'day-weekend',
                selected: 'day-selected',
              }}
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="h-3 w-3 rounded-full bg-amber-200 border border-amber-400" />
              NSE Holiday
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="h-3 w-3 rounded-full bg-blue-200 border border-blue-400" />
              Bank Holiday
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="h-3 w-3 rounded-full bg-green-200 border border-green-400" />
              Approved Leave
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="h-3 w-3 rounded-full bg-white border border-gray-300 text-red-500 text-[9px] flex items-center justify-center font-bold leading-none">W</span>
              Weekend
            </span>
          </div>
        </div>

        {/* Day info panel */}
        <div className="flex-1">
          {selectedDay ? (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b px-6 py-4">
                <h2 className="font-semibold text-gray-900">
                  {format(selectedDay, 'EEEE, d MMMM yyyy')}
                </h2>
              </div>
              <div className="space-y-3 px-6 py-4">
                {isWeekend(selectedDay) && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
                    <p className="text-sm font-medium text-red-700">Weekend — Market closed</p>
                  </div>
                )}
                {selectedHoliday && (
                  <div className={cn(
                    'rounded-lg border px-4 py-2.5',
                    selectedHoliday.type === 'market'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-blue-50 border-blue-200'
                  )}>
                    <p className={cn(
                      'text-sm font-medium',
                      selectedHoliday.type === 'market' ? 'text-amber-800' : 'text-blue-800'
                    )}>
                      {selectedHoliday.type === 'market' ? '🏦 NSE/BSE Holiday' : '🏛 Bank Holiday'}
                    </p>
                    <p className={cn(
                      'text-sm',
                      selectedHoliday.type === 'market' ? 'text-amber-700' : 'text-blue-700'
                    )}>
                      {selectedHoliday.name}
                    </p>
                  </div>
                )}
                {selectedLeaves.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-700">On Leave:</p>
                    <div className="space-y-1.5">
                      {selectedLeaves.map((l) => (
                        <div key={l.id} className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-200 text-xs font-semibold text-green-800">
                            {l.employee.name.charAt(0)}
                          </div>
                          <span className="text-sm text-gray-900">{l.employee.name}</span>
                          <span className="ml-auto text-xs text-gray-500">{DEPT_LABELS[l.employee.department] ?? l.employee.department}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isWeekend(selectedDay) && !selectedHoliday && selectedLeaves.length === 0 && (
                  <p className="text-sm text-gray-500">Working day — no holidays or approved leaves.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8">
              <div className="text-center">
                <CalendarDays className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-400">Click a date to see details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- Admin: All Leave Applications --- */}
      {isAdmin && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold text-gray-900">Leave Applications</h2>
          </div>
          <div className="overflow-x-auto">
            {applications.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-500">No leave applications found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-6 py-3 text-left">Employee</th>
                    <th className="px-6 py-3 text-left">Department</th>
                    <th className="px-6 py-3 text-left">Period</th>
                    <th className="px-6 py-3 text-left">Days</th>
                    <th className="px-6 py-3 text-left">Reason</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {applications.map((app) => (
                    <tr key={app.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">{app.employee.name}</td>
                      <td className="px-6 py-4 text-gray-600">{DEPT_LABELS[app.employee.department] ?? app.employee.department}</td>
                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                        {format(parseISO(app.fromDate), 'dd MMM')} – {format(parseISO(app.toDate), 'dd MMM yyyy')}
                      </td>
                      <td className="px-6 py-4 text-gray-600">{app.days}</td>
                      <td className="max-w-xs px-6 py-4 text-gray-600">
                        <span className="line-clamp-2">{app.reason}</span>
                      </td>
                      <td className="px-6 py-4">{statusBadge(app.status)}</td>
                      <td className="px-6 py-4">
                        {app.status === 'PENDING' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 h-7 px-3 text-xs"
                              disabled={actionLoading === app.id + 'APPROVED'}
                              onClick={() => handleAction(app.id, 'APPROVED')}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-300 text-red-600 hover:bg-red-50 h-7 px-3 text-xs"
                              disabled={actionLoading === app.id + 'REJECTED'}
                              onClick={() => setRejectNote({ id: app.id, note: '' })}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                        {app.status !== 'PENDING' && app.reviewedBy && (
                          <span className="text-xs text-gray-400">by {app.reviewedBy.name}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* --- Employee: My Leave Applications --- */}
      {!isAdmin && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold text-gray-900">My Leave Applications</h2>
          </div>
          <div className="overflow-x-auto">
            {applications.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-500">You have not applied for any leave yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-6 py-3 text-left">Period</th>
                    <th className="px-6 py-3 text-left">Days</th>
                    <th className="px-6 py-3 text-left">Reason</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Note</th>
                    <th className="px-6 py-3 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {applications.map((app) => (
                    <tr key={app.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-700 whitespace-nowrap">
                        {format(parseISO(app.fromDate), 'dd MMM')} – {format(parseISO(app.toDate), 'dd MMM yyyy')}
                      </td>
                      <td className="px-6 py-4 text-gray-600">{app.days}</td>
                      <td className="max-w-xs px-6 py-4 text-gray-600">
                        <span className="line-clamp-2">{app.reason}</span>
                      </td>
                      <td className="px-6 py-4">{statusBadge(app.status)}</td>
                      <td className="px-6 py-4 text-gray-500 text-xs">{app.reviewNote ?? '—'}</td>
                      <td className="px-6 py-4">
                        {app.status === 'PENDING' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-300 text-gray-600 hover:bg-gray-50 h-7 px-3 text-xs"
                            disabled={actionLoading === app.id + 'CANCELLED'}
                            onClick={() => handleAction(app.id, 'CANCELLED')}
                          >
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Reject note dialog */}
      {rejectNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Reject Leave Application</h3>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              rows={3}
              placeholder="Reason for rejection (optional)..."
              value={rejectNote.note}
              onChange={(e) => setRejectNote({ ...rejectNote, note: e.target.value })}
            />
            <div className="flex gap-3 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setRejectNote(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={actionLoading === rejectNote.id + 'REJECTED'}
                onClick={() => handleAction(rejectNote.id, 'REJECTED', rejectNote.note)}
              >
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Apply Leave Dialog */}
      {showApplyDialog && session?.user && (
        <ApplyLeaveDialog
          onClose={() => setShowApplyDialog(false)}
          onSuccess={fetchApplications}
          allHolidays={allHolidayStrings}
          isAdmin={isAdmin}
          defaultEmployeeId={session.user.id}
          defaultDepartment={session.user.department ?? ''}
        />
      )}

      {/* Mark Leave Dialog (admin) */}
      {showMarkDialog && (
        <MarkLeaveDialog
          onClose={() => setShowMarkDialog(false)}
          onSuccess={fetchApplications}
        />
      )}
    </div>
  )
}

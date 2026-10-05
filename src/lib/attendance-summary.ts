import { istDateKey } from '@/lib/work-hours'

export interface AttendanceDay {
  date: string // YYYY-MM-DD (IST)
  employeeId: string
  employeeName: string
  firstLogin: string | null // null on a day with only approved extra time
  lastLogout: string | null
  totalDurationMs: number
}

export interface AttendanceSummaryRow {
  employeeId: string
  employeeName: string
  workingDays: number
  loggedInDays: number
  avgWorkMs: number | null
  avgLoginMin: number | null
  avgLogoutMin: number | null
}

const IST_OFFSET_MIN = 330

const isWeekday = (y: number, m: number, d: number) => {
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return dow !== 0 && dow !== 6
}

// Mon–Fri in the month; the current month counts only up to today, a future month is 0.
export function countWorkingDays(year: number, month: number, today: Date): number {
  const ym = year * 12 + month
  const todayYm = today.getFullYear() * 12 + today.getMonth() + 1
  if (ym > todayYm) return 0
  const lastDay = ym === todayYm ? today.getDate() : new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= lastDay; d++) if (isWeekday(year, month, d)) count++
  return count
}

// ponytail: a logout after IST midnight wraps to early-morning minutes and skews the average.
const istMinutes = (iso: string) => {
  const t = new Date(iso)
  return (t.getUTCHours() * 60 + t.getUTCMinutes() + IST_OFFSET_MIN) % 1440
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

// Per-employee month summary over weekday days. Days still open (no logout)
// count as logged in but are left out of the work-time and logoff averages;
// days with only approved extra time count toward work time only.
// Roster employees with no weekday login get a zero row.
export function summarizeAttendance(
  entries: AttendanceDay[],
  workingDays: number,
  roster: { id: string; name: string }[] = [],
): AttendanceSummaryRow[] {
  const byEmployee = new Map<string, AttendanceDay[]>()
  for (const e of entries) {
    const [y, m, d] = e.date.split('-').map(Number)
    if (!isWeekday(y, m, d)) continue
    const days = byEmployee.get(e.employeeId)
    if (days) days.push(e)
    else byEmployee.set(e.employeeId, [e])
  }

  const rows: AttendanceSummaryRow[] = [...byEmployee.values()].map((days) => {
    const closed = days.filter((d) => d.lastLogout)
    // A day with only extra time has no logout but its time is final.
    const finished = days.filter((d) => d.lastLogout || !d.firstLogin)
    return {
      employeeId: days[0].employeeId,
      employeeName: days[0].employeeName,
      workingDays,
      loggedInDays: new Set(days.map((d) => d.date)).size,
      avgWorkMs: avg(finished.map((d) => d.totalDurationMs)),
      avgLoginMin: avg(days.filter((d) => d.firstLogin).map((d) => istMinutes(d.firstLogin!))),
      avgLogoutMin: avg(closed.map((d) => istMinutes(d.lastLogout!))),
    }
  })
  for (const emp of roster) {
    if (byEmployee.has(emp.id)) continue
    rows.push({
      employeeId: emp.id, employeeName: emp.name, workingDays, loggedInDays: 0,
      avgWorkMs: null, avgLoginMin: null, avgLogoutMin: null,
    })
  }
  return rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName))
}

interface EmployeeRef { id: string; name: string; department: string; designation: string }

export interface AttendanceSession {
  id: string
  loginAt: string
  logoutAt: string | null
  logoutType: string | null
}

export interface AttendanceEntry extends AttendanceDay {
  department: string
  designation: string
  lastLogoutType: string | null
  extraMs: number // approved extra time, already included in totalDurationMs
  sessions: AttendanceSession[]
}

// Groups login logs and approved extra-time windows by employee and IST date.
// Open sessions add no time; a day with an open session has lastLogout null.
export function groupAttendance(
  logs: { id: string; employeeId: string; loginAt: Date; logoutAt: Date | null; logoutType: string | null; employee: EmployeeRef }[],
  extras: { employeeId: string; startAt: Date; endAt: Date; employee: EmployeeRef }[],
): AttendanceEntry[] {
  const grouped = new Map<string, AttendanceEntry & { hasOpen: boolean }>()
  const entryFor = (employee: EmployeeRef, at: Date) => {
    const date = istDateKey(at)
    const key = `${employee.id}_${date}`
    let entry = grouped.get(key)
    if (!entry) {
      entry = {
        date, employeeId: employee.id, employeeName: employee.name,
        department: employee.department, designation: employee.designation,
        firstLogin: null, lastLogout: null, lastLogoutType: null,
        totalDurationMs: 0, extraMs: 0, sessions: [], hasOpen: false,
      }
      grouped.set(key, entry)
    }
    return entry
  }

  for (const log of [...logs].sort((a, b) => a.loginAt.getTime() - b.loginAt.getTime())) {
    const entry = entryFor(log.employee, log.loginAt)
    entry.firstLogin ??= log.loginAt.toISOString()
    if (log.logoutAt) {
      entry.totalDurationMs += log.logoutAt.getTime() - log.loginAt.getTime()
      if (!entry.lastLogout || log.logoutAt.toISOString() > entry.lastLogout) {
        entry.lastLogout = log.logoutAt.toISOString()
        entry.lastLogoutType = log.logoutType
      }
    } else {
      entry.hasOpen = true
    }
    entry.sessions.push({
      id: log.id,
      loginAt: log.loginAt.toISOString(),
      logoutAt: log.logoutAt?.toISOString() ?? null,
      logoutType: log.logoutType,
    })
  }

  for (const x of extras) {
    const entry = entryFor(x.employee, x.startAt)
    const ms = x.endAt.getTime() - x.startAt.getTime()
    entry.extraMs += ms
    entry.totalDurationMs += ms
  }

  return [...grouped.values()]
    .map(({ hasOpen, ...entry }) => (hasOpen ? { ...entry, lastLogout: null, lastLogoutType: null } : entry))
    .sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName))
}

export function formatMinutes(min: number | null): string {
  if (min === null) return '—'
  const total = Math.round(min)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

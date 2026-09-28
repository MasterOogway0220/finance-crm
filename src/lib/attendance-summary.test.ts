import { describe, it, expect } from 'vitest'
import { countWorkingDays, summarizeAttendance, formatMinutes } from './attendance-summary'

const TODAY = new Date(2026, 8, 28) // Mon 28 Sep 2026

describe('countWorkingDays', () => {
  it('counts every Mon–Fri of a past month', () => {
    expect(countWorkingDays(2026, 8, TODAY)).toBe(21) // Aug 2026
  })

  it('counts only up to today for the current month', () => {
    expect(countWorkingDays(2026, 9, TODAY)).toBe(20) // 1–28 Sep 2026
  })

  it('is 0 for a future month', () => {
    expect(countWorkingDays(2026, 10, TODAY)).toBe(0)
  })
})

const day = (date: string, firstLogin: string, lastLogout: string | null, totalDurationMs: number) => ({
  date, employeeId: 'e1', employeeName: 'Asha', firstLogin, lastLogout, totalDurationMs,
})
const H = 3600000

describe('summarizeAttendance', () => {
  it('averages IST login/logoff times and work time over weekday days', () => {
    const rows = summarizeAttendance([
      day('2026-09-01', '2026-09-01T04:00:00Z', '2026-09-01T12:30:00Z', 8 * H), // 09:30 → 18:00 IST
      day('2026-09-02', '2026-09-02T04:30:00Z', '2026-09-02T13:30:00Z', 9 * H), // 10:00 → 19:00 IST
    ], 20)
    expect(rows).toEqual([{
      employeeId: 'e1', employeeName: 'Asha', workingDays: 20, loggedInDays: 2,
      avgWorkMs: 8.5 * H, avgLoginMin: 585, avgLogoutMin: 1110,
    }])
  })

  it('ignores weekend days entirely', () => {
    const [row] = summarizeAttendance([
      day('2026-09-01', '2026-09-01T04:00:00Z', '2026-09-01T12:30:00Z', 8 * H),
      day('2026-09-05', '2026-09-05T08:00:00Z', '2026-09-05T09:00:00Z', 1 * H), // Saturday
    ], 20)
    expect(row.loggedInDays).toBe(1)
    expect(row.avgWorkMs).toBe(8 * H)
    expect(row.avgLoginMin).toBe(570)
  })

  it('leaves still-open days out of work-time and logoff averages but counts the login', () => {
    const [row] = summarizeAttendance([
      day('2026-09-01', '2026-09-01T04:00:00Z', '2026-09-01T12:30:00Z', 8 * H),
      day('2026-09-02', '2026-09-02T04:30:00Z', null, 0),
    ], 20)
    expect(row.loggedInDays).toBe(2)
    expect(row.avgLoginMin).toBe(585)
    expect(row.avgWorkMs).toBe(8 * H)
    expect(row.avgLogoutMin).toBe(1080)
  })

  it('adds a zero row for rostered employees with no weekday login', () => {
    const rows = summarizeAttendance(
      [day('2026-09-01', '2026-09-01T04:00:00Z', '2026-09-01T12:30:00Z', 8 * H)],
      20,
      [{ id: 'e1', name: 'Asha' }, { id: 'e2', name: 'Bharat' }],
    )
    expect(rows.map((r) => [r.employeeName, r.loggedInDays])).toEqual([['Asha', 1], ['Bharat', 0]])
    expect(rows[1]).toMatchObject({ workingDays: 20, avgWorkMs: null, avgLoginMin: null, avgLogoutMin: null })
  })

  it('returns null averages when no day has a logout', () => {
    const [row] = summarizeAttendance([day('2026-09-01', '2026-09-01T04:00:00Z', null, 0)], 20)
    expect(row.avgWorkMs).toBeNull()
    expect(row.avgLogoutMin).toBeNull()
  })
})

describe('formatMinutes', () => {
  it('formats minutes-of-day as 12h time', () => {
    expect(formatMinutes(585)).toBe('09:45 AM')
    expect(formatMinutes(1110)).toBe('06:30 PM')
    expect(formatMinutes(0)).toBe('12:00 AM')
    expect(formatMinutes(null)).toBe('—')
  })
})

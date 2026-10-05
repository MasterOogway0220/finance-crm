import { describe, it, expect } from 'vitest'
import { countWorkingDays, summarizeAttendance, formatMinutes, groupAttendance } from './attendance-summary'

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

const day = (date: string, firstLogin: string | null, lastLogout: string | null, totalDurationMs: number) => ({
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

  it('leaves extra-time-only days (no recorded login) out of the login average', () => {
    const [row] = summarizeAttendance([
      day('2026-09-01', '2026-09-01T04:00:00Z', '2026-09-01T12:30:00Z', 8 * H),
      day('2026-09-02', null, null, 1 * H),
    ], 20)
    expect(row.loggedInDays).toBe(2)
    expect(row.avgLoginMin).toBe(570)
    expect(row.avgWorkMs).toBe(4.5 * H) // (8h + 1h extra) / 2
    expect(row.avgLogoutMin).toBe(1080)
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

const emp = { id: 'e1', name: 'Asha', department: 'EQUITY', designation: 'Dealer' }
const log = (id: string, loginAt: string, logoutAt: string | null, logoutType: string | null = 'SELF') => ({
  id, employeeId: 'e1', loginAt: new Date(loginAt), logoutAt: logoutAt ? new Date(logoutAt) : null, logoutType, employee: emp,
})
const extra = (startAt: string, endAt: string) => ({
  employeeId: 'e1', startAt: new Date(startAt), endAt: new Date(endAt), employee: emp,
})

describe('groupAttendance', () => {
  it('sums closed sessions of one IST day', () => {
    const [d] = groupAttendance([
      log('a', '2026-10-05T04:00:00Z', '2026-10-05T07:00:00Z'), // 3h
      log('b', '2026-10-05T08:00:00Z', '2026-10-05T12:30:00Z', 'AUTO'), // 4.5h
    ], [])
    expect(d).toMatchObject({
      date: '2026-10-05', firstLogin: '2026-10-05T04:00:00.000Z', lastLogout: '2026-10-05T12:30:00.000Z',
      lastLogoutType: 'AUTO', totalDurationMs: 7.5 * H, extraMs: 0,
    })
    expect(d.sessions.map((s) => s.logoutType)).toEqual(['SELF', 'AUTO'])
  })

  it('groups by IST date', () => {
    const [d] = groupAttendance([log('a', '2026-10-04T20:00:00Z', '2026-10-04T21:00:00Z')], []) // 01:30 IST 5 Oct
    expect(d.date).toBe('2026-10-05')
  })

  it('keeps an open session out of the total and leaves lastLogout null', () => {
    const [d] = groupAttendance([
      log('a', '2026-10-05T04:00:00Z', '2026-10-05T06:00:00Z'),
      log('b', '2026-10-05T07:00:00Z', null, null),
    ], [])
    expect(d.lastLogout).toBeNull()
    expect(d.totalDurationMs).toBe(2 * H)
  })

  it('adds approved extra time to the day total', () => {
    const [d] = groupAttendance(
      [log('a', '2026-10-05T04:00:00Z', '2026-10-05T12:30:00Z', 'AUTO')], // 8.5h
      [extra('2026-10-05T12:30:00Z', '2026-10-05T14:00:00Z')], // 18:00–19:30 IST
    )
    expect(d.extraMs).toBe(1.5 * H)
    expect(d.totalDurationMs).toBe(10 * H)
  })

  it('creates a day for extra time with no recorded login', () => {
    const [d] = groupAttendance([], [extra('2026-10-05T13:30:00Z', '2026-10-05T14:30:00Z')])
    expect(d).toMatchObject({
      date: '2026-10-05', employeeName: 'Asha', firstLogin: null, lastLogout: null,
      totalDurationMs: H, extraMs: H, sessions: [],
    })
  })

  it('sorts by date desc then employee name', () => {
    const other = { ...emp, id: 'e2', name: 'Bharat' }
    const rows = groupAttendance([
      { ...log('a', '2026-10-05T04:00:00Z', '2026-10-05T05:00:00Z'), employeeId: 'e2', employee: other },
      log('b', '2026-10-05T04:00:00Z', '2026-10-05T05:00:00Z'),
      log('c', '2026-10-06T04:00:00Z', '2026-10-06T05:00:00Z'),
    ], [])
    expect(rows.map((r) => `${r.date} ${r.employeeName}`)).toEqual([
      '2026-10-06 Asha', '2026-10-05 Asha', '2026-10-05 Bharat',
    ])
  })
})

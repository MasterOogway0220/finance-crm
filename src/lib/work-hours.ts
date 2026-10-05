// Working-hours rules, all in IST (UTC+5:30, no DST):
// a login before 6 PM is recorded and that session ends at 6 PM; a login from
// 6 PM to midnight is allowed but not recorded and ends at the next midnight.
// Time after 6 PM only counts through an approved extra-time request.

import type { LogoutType } from '@prisma/client'

const IST_OFFSET_MS = 330 * 60 * 1000
const CUTOFF_HOUR = 18

/** YYYY-MM-DD of the IST calendar day containing `d`. */
export function istDateKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** The instant of `hour:minute` IST on `dateKey` (hour 24 = next midnight). */
export function istTime(dateKey: string, hour: number, minute = 0): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MS)
}

/** True when a login at `at` falls before the 6 PM IST cut-off and is recorded. */
export function isRecordedLogin(at: Date): boolean {
  return at < istTime(istDateKey(at), CUTOFF_HOUR)
}

/** When a session started at `loginAt` must end. */
export function sessionEndsAt(loginAt: Date): Date {
  const day = istDateKey(loginAt)
  return istTime(day, isRecordedLogin(loginAt) ? CUTOFF_HOUR : 24)
}

/** How to close a login log: at `now`, or at the cut-off (marked AUTO) once it has passed. */
export function closeLogout(
  loginAt: Date,
  now: Date,
  type: 'SELF' | 'IDLE',
): { logoutAt: Date; logoutType: LogoutType } {
  const end = sessionEndsAt(loginAt)
  return now >= end ? { logoutAt: end, logoutType: 'AUTO' } : { logoutAt: now, logoutType: type }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Validates an extra-time window: one IST date, within 6 PM–midnight, already finished. */
export function parseExtraTime(
  input: { date: string; from: string; to: string },
  now: Date,
): { startAt: Date; endAt: Date } | { error: string } {
  const from = TIME_RE.exec(input.from)
  const to = TIME_RE.exec(input.to)
  if (!DATE_RE.test(input.date) || !from || !to) return { error: 'Invalid date or time' }

  const startMin = Number(from[1]) * 60 + Number(from[2])
  const endMin = input.to === '00:00' ? 24 * 60 : Number(to[1]) * 60 + Number(to[2])
  if (startMin < CUTOFF_HOUR * 60) return { error: 'Extra time must start at or after 6:00 PM' }
  if (endMin <= startMin) return { error: 'End time must be after start time' }

  const startAt = istTime(input.date, 0, startMin)
  const endAt = istTime(input.date, 0, endMin)
  if (endAt > now) return { error: 'Extra time can only be requested after it has been worked' }
  return { startAt, endAt }
}

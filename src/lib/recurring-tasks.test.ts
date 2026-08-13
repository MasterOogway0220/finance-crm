import { describe, it, expect } from 'vitest'
import { computeMonthlyDates, nextRunGuard } from './recurring-tasks'

describe('computeMonthlyDates', () => {
  it('keeps weekday dates unchanged', () => {
    // Aug 2026: 3rd is Monday, 6th is Thursday
    const { assignDate, dueDate } = computeMonthlyDates(3, 6, new Date(2026, 7, 15))
    expect(assignDate).toEqual(new Date(2026, 7, 3))
    expect(dueDate).toEqual(new Date(2026, 7, 6))
  })

  it('skips a weekend assignment day and shifts the due date by the same span', () => {
    // Spec example: 1 Aug 2026 is Saturday → assign Mon 3rd; span 1→4 puts due on the 6th
    const { assignDate, dueDate } = computeMonthlyDates(1, 4, new Date(2026, 7, 1))
    expect(assignDate).toEqual(new Date(2026, 7, 3))
    expect(dueDate).toEqual(new Date(2026, 7, 6))
  })

  it('pushes a due date landing on a weekend to Monday', () => {
    // Assign Mon 3 Aug 2026; due 8th is Saturday → Monday 10th
    const { assignDate, dueDate } = computeMonthlyDates(3, 8, new Date(2026, 7, 1))
    expect(assignDate).toEqual(new Date(2026, 7, 3))
    expect(dueDate).toEqual(new Date(2026, 7, 10))
  })

  it('clamps days beyond the month length and never shifts assignment into the next month', () => {
    // Feb 2026 has 28 days; 31st clamps to Sat 28th. Monday would be 2 Mar —
    // unreachable for the heartbeat — so it falls back to Friday 27 Feb.
    const { assignDate, dueDate } = computeMonthlyDates(31, 31, new Date(2026, 1, 10))
    expect(assignDate).toEqual(new Date(2026, 1, 27))
    expect(dueDate).toEqual(new Date(2026, 1, 27))
  })

  it('keeps a month-end weekend assignment in its month while the due date may cross', () => {
    // May 2026: 30th is Saturday, Monday would be 1 Jun → assign falls back to Fri 29 May;
    // due = 29th + 1 day span = Sat 30th → skips forward to Mon 1 Jun
    const { assignDate, dueDate } = computeMonthlyDates(30, 31, new Date(2026, 4, 10))
    expect(assignDate).toEqual(new Date(2026, 4, 29))
    expect(dueDate).toEqual(new Date(2026, 5, 1))
  })
})

describe('nextRunGuard', () => {
  const now = new Date(2026, 7, 13) // Thu 13 Aug 2026

  it('keeps the current value when the assignment day is still ahead', () => {
    expect(nextRunGuard(20, 24, null, now)).toBeNull() // fires this month
    expect(nextRunGuard(20, 24, '2026-08', now)).toBe('2026-08') // already ran — no double fire
  })

  it('stamps the current period when the assignment day already passed', () => {
    expect(nextRunGuard(1, 4, null, now)).toBe('2026-08') // starts next month
  })

  it('treats today as still assignable', () => {
    expect(nextRunGuard(13, 14, null, now)).toBeNull()
  })
})

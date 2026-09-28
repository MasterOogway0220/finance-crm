import { describe, it, expect } from 'vitest'
import { monthlyLeaveDays } from './leave-report'

describe('monthlyLeaveDays', () => {
  it('buckets leave days into the month of fromDate', () => {
    const monthly = monthlyLeaveDays([
      { fromDate: new Date(2026, 0, 30), days: 4 }, // spans into Feb, counted in Jan
      { fromDate: new Date(2026, 0, 5), days: 1 },
      { fromDate: new Date(2026, 11, 24), days: 2 },
    ])
    expect(monthly).toEqual([5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2])
  })

  it('uses the stored UTC date, whatever the server timezone', () => {
    // leaves API stores fromDate as UTC midnight
    const monthly = monthlyLeaveDays([{ fromDate: new Date('2026-03-01T00:00:00.000Z'), days: 1 }])
    expect(monthly[2]).toBe(1)
  })
})

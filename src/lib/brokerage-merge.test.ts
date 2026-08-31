import { describe, it, expect } from 'vitest'
import { mergeBrokerageDetails, type DetailRow } from './brokerage-merge'

const clients = new Map([
  ['18S442', { id: 'c-442', operatorId: 'op-a' }],
  ['18V212', { id: 'c-212', operatorId: 'op-b' }],
  ['18A276', { id: 'c-276', operatorId: 'op-a' }],
])

// The day's cash-segment rows, already active.
const cash: DetailRow[] = [
  { clientCode: '18S442', clientId: 'c-442', operatorId: 'op-a', amount: 60 },
  { clientCode: '18V212', clientId: 'c-212', operatorId: 'op-b', amount: 22.86 },
]

describe('mergeBrokerageDetails', () => {
  it('replaces the day when no previous rows are passed', () => {
    const r = mergeBrokerageDetails([], new Map([['18S442', 100]]), clients)
    expect(r.details).toEqual([{ clientCode: '18S442', clientId: 'c-442', operatorId: 'op-a', amount: 100 }])
    expect(r.carriedAmount).toBe(0)
  })

  it('sums the F&O file into codes already on the day and appends new ones', () => {
    const fno = new Map([['18S442', 40], ['18A276', 15]])
    const r = mergeBrokerageDetails(cash, fno, clients)

    expect(r.details.find((d) => d.clientCode === '18S442')?.amount).toBe(100)
    expect(r.details.find((d) => d.clientCode === '18A276')).toEqual({
      clientCode: '18A276', clientId: 'c-276', operatorId: 'op-a', amount: 15,
    })
    // The cash-only client survives — the regression that made options uploads wipe the day.
    expect(r.details.find((d) => d.clientCode === '18V212')?.amount).toBe(22.86)
    expect(r.details).toHaveLength(3)
    expect(r.addedAmount).toBe(55)
    expect(r.carriedAmount).toBeCloseTo(82.86)
  })

  it('keeps the settled operator snapshot when a code is transferred mid-day', () => {
    const moved = new Map([['18S442', { id: 'c-442', operatorId: 'op-NEW' }]])
    const r = mergeBrokerageDetails(cash, new Map([['18S442', 40]]), moved)
    expect(r.details[0].operatorId).toBe('op-a')
  })

  it('skips codes missing from Client master without dropping the rest', () => {
    const r = mergeBrokerageDetails(cash, new Map([['NOPE', 10], ['18S442', 40]]), clients)
    expect(r.unmappedCodes).toEqual(['NOPE'])
    expect(r.mappedFromFile).toBe(1)
    expect(r.addedAmount).toBe(40)
  })

  it('reports zero mapped rows when the whole file is unmapped, even with prior rows', () => {
    const r = mergeBrokerageDetails(cash, new Map([['NOPE', 10]]), clients)
    expect(r.mappedFromFile).toBe(0)
    expect(r.details).toHaveLength(2)
  })

  it('does not mutate the previous rows it was handed', () => {
    const prev: DetailRow[] = [{ clientCode: '18S442', clientId: 'c-442', operatorId: 'op-a', amount: 60 }]
    mergeBrokerageDetails(prev, new Map([['18S442', 40]]), clients)
    expect(prev[0].amount).toBe(60)
  })
})

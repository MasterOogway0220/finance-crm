import { describe, it, expect } from 'vitest'
import { buildVersionDetails, reactivationTarget, type DetailRow } from './brokerage-merge'

const clients = new Map([
  ['18S442', { id: 'c-442', operatorId: 'op-a' }],
  ['18V212', { id: 'c-212', operatorId: 'op-b' }],
  ['18A276', { id: 'c-276', operatorId: 'op-a' }],
])

// The day's cash-segment rows, already active.
const cash: DetailRow[] = [
  { clientCode: '18S442', clientId: 'c-442', operatorId: 'op-a', amount: 60, segment: 'CASH' },
  { clientCode: '18V212', clientId: 'c-212', operatorId: 'op-b', amount: 22.86, segment: 'CASH' },
]

const sum = (rows: DetailRow[]) => rows.reduce((s, d) => s + d.amount, 0)

describe('buildVersionDetails', () => {
  it('writes the file as-is when the day is empty', () => {
    const r = buildVersionDetails([], 'CASH', new Map([['18S442', 100]]), clients)
    expect(r.details).toEqual([
      { clientCode: '18S442', clientId: 'c-442', operatorId: 'op-a', amount: 100, segment: 'CASH' },
    ])
    expect(r.carriedAmount).toBe(0)
  })

  it('adds the F&O file without disturbing the cash rows', () => {
    const r = buildVersionDetails(cash, 'FNO', new Map([['18S442', 40], ['18A276', 15]]), clients)

    // The regression that started all this: cash rows must survive an options upload.
    expect(r.details.filter((d) => d.segment === 'CASH')).toEqual(cash)
    expect(r.details.filter((d) => d.segment === 'FNO')).toHaveLength(2)
    expect(r.segmentAmount).toBe(55)
    expect(r.carriedAmount).toBeCloseTo(82.86)
    expect(sum(r.details)).toBeCloseTo(137.86)
  })

  it('gives a client who traded both segments one row per segment', () => {
    const r = buildVersionDetails(cash, 'FNO', new Map([['18S442', 40]]), clients)
    const rows = r.details.filter((d) => d.clientCode === '18S442')
    expect(rows.map((d) => [d.segment, d.amount])).toEqual([['CASH', 60], ['FNO', 40]])
  })

  it('is idempotent — re-uploading the same F&O file replaces, never doubles', () => {
    const fno = new Map([['18S442', 40], ['18A276', 15]])
    const once = buildVersionDetails(cash, 'FNO', fno, clients)
    const twice = buildVersionDetails(once.details, 'FNO', fno, clients)
    expect(sum(twice.details)).toBeCloseTo(sum(once.details))
    expect(twice.details).toHaveLength(once.details.length)
  })

  it('replaces cash on a corrected re-upload while options survive', () => {
    const withFno = buildVersionDetails(cash, 'FNO', new Map([['18A276', 15]]), clients).details
    const corrected = buildVersionDetails(withFno, 'CASH', new Map([['18S442', 99]]), clients)

    expect(corrected.details.filter((d) => d.segment === 'FNO')).toHaveLength(1)
    expect(corrected.details.filter((d) => d.segment === 'CASH')).toEqual([
      { clientCode: '18S442', clientId: 'c-442', operatorId: 'op-a', amount: 99, segment: 'CASH' },
    ])
    // 18V212's stale cash row is gone, as a replacement of that segment should do.
    expect(corrected.details.some((d) => d.clientCode === '18V212')).toBe(false)
  })

  it('keeps the settled operator snapshot on carried rows after a transfer', () => {
    const moved = new Map([['18S442', { id: 'c-442', operatorId: 'op-NEW' }]])
    const r = buildVersionDetails(cash, 'FNO', new Map([['18S442', 40]]), moved)
    expect(r.details.find((d) => d.segment === 'CASH')?.operatorId).toBe('op-a')
    expect(r.details.find((d) => d.segment === 'FNO')?.operatorId).toBe('op-NEW')
  })

  it('skips codes missing from Client master without dropping the rest', () => {
    const r = buildVersionDetails(cash, 'FNO', new Map([['NOPE', 10], ['18S442', 40]]), clients)
    expect(r.unmappedCodes).toEqual(['NOPE'])
    expect(r.mappedFromFile).toBe(1)
    expect(r.segmentAmount).toBe(40)
  })

  it('reports zero mapped rows when the whole file is unmapped, even with prior rows', () => {
    const r = buildVersionDetails(cash, 'FNO', new Map([['NOPE', 10]]), clients)
    expect(r.mappedFromFile).toBe(0)
    expect(r.details).toHaveLength(2)
  })

  it('does not mutate the rows it was handed', () => {
    const prev: DetailRow[] = [{ clientCode: '18S442', clientId: 'c-442', operatorId: 'op-a', amount: 60, segment: 'CASH' }]
    buildVersionDetails(prev, 'FNO', new Map([['18S442', 40]]), clients)
    expect(prev[0].amount).toBe(60)
  })
})

describe('reactivationTarget', () => {
  it('activates the highest-version survivor when none is active', () => {
    const id = reactivationTarget([
      { id: 'a', version: 1, isActive: false },
      { id: 'b', version: 2, isActive: false },
    ])
    expect(id).toBe('b')
  })
  it('does nothing when a version is still active', () => {
    expect(reactivationTarget([
      { id: 'a', version: 1, isActive: false },
      { id: 'b', version: 2, isActive: true },
    ])).toBeNull()
  })
  it('does nothing when no versions survive', () => {
    expect(reactivationTarget([])).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { partitionByTradedStatus } from './brokerage-status'

describe('partitionByTradedStatus', () => {
  it('splits candidates into traded vs not-traded by the active set', () => {
    const { toTrade, toReset } = partitionByTradedStatus(['a', 'b', 'c'], ['a', 'c'])
    expect(toTrade.sort()).toEqual(['a', 'c'])
    expect(toReset).toEqual(['b'])
  })

  it('drops null / undefined / empty client ids on both sides (unmapped brokerage rows)', () => {
    const { toTrade, toReset } = partitionByTradedStatus(
      ['a', null, undefined, '', 'b'],
      ['a', null, undefined, ''],
    )
    expect(toTrade).toEqual(['a'])
    expect(toReset).toEqual(['b'])
  })

  it('de-duplicates repeated client ids', () => {
    const { toTrade, toReset } = partitionByTradedStatus(['a', 'a', 'b', 'b'], ['a'])
    expect(toTrade).toEqual(['a'])
    expect(toReset).toEqual(['b'])
  })

  it('handles an empty candidate list', () => {
    expect(partitionByTradedStatus([], ['a'])).toEqual({ toTrade: [], toReset: [] })
  })

  it('resets everyone when nothing is traded', () => {
    const { toTrade, toReset } = partitionByTradedStatus(['a', 'b'], [])
    expect(toTrade).toEqual([])
    expect(toReset.sort()).toEqual(['a', 'b'])
  })
})

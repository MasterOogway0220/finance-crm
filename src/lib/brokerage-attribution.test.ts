import { describe, it, expect } from 'vitest'
import { brokerageOperatorFilter } from './brokerage-attribution'

const now = new Date()
const curMonth = now.getMonth() + 1
const curYear = now.getFullYear()

describe('brokerageOperatorFilter', () => {
  it('past month attributes by snapshot operatorId', () => {
    expect(brokerageOperatorFilter('op1', 1, 2020)).toEqual({ operatorId: 'op1' })
    expect(brokerageOperatorFilter(['op1', 'op2'], 1, 2020)).toEqual({ operatorId: { in: ['op1', 'op2'] } })
  })

  it('current month uses current owner but keeps closed-client rows via snapshot', () => {
    expect(brokerageOperatorFilter('op1', curMonth, curYear)).toEqual({
      OR: [{ client: { operatorId: 'op1' } }, { clientId: null, operatorId: 'op1' }],
    })
    expect(brokerageOperatorFilter(['op1'], curMonth, curYear)).toEqual({
      OR: [{ client: { operatorId: { in: ['op1'] } } }, { clientId: null, operatorId: { in: ['op1'] } }],
    })
  })

  it('no scope means no operator restriction', () => {
    expect(brokerageOperatorFilter(null, curMonth, curYear)).toEqual({})
  })
})

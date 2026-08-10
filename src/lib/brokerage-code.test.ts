import { describe, expect, it } from 'vitest'
import { extractClientCodeFromNarration } from './brokerage-code'

describe('extractClientCodeFromNarration', () => {
  it('takes the last token of the spaced form', () => {
    expect(extractClientCodeFromNarration('F/58581903 18S442')).toBe('18S442')
    expect(extractClientCodeFromNarration('F/58874492 18M045')).toBe('18M045')
    expect(extractClientCodeFromNarration('F/58599999 411E015')).toBe('411E015')
    expect(extractClientCodeFromNarration('F/58600002 99985077')).toBe('99985077')
  })

  it('strips the glued F marker so it maps to the same client', () => {
    expect(extractClientCodeFromNarration('F18S479')).toBe('18S479')
    expect(extractClientCodeFromNarration('F18S442')).toBe('18S442')
    expect(extractClientCodeFromNarration('F411E015')).toBe('411E015')
    expect(extractClientCodeFromNarration('f18v212')).toBe('18V212')
  })

  it('leaves a voucher-only narration alone rather than inventing a code', () => {
    expect(extractClientCodeFromNarration('F/58581903')).toBe('F/58581903')
  })

  it('trims surrounding whitespace', () => {
    expect(extractClientCodeFromNarration('  F/58581903 18V212  ')).toBe('18V212')
  })
})

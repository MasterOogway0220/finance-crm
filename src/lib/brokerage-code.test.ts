import { describe, expect, it } from 'vitest'
import { extractClientCodeFromNarration, parseCellDateKey } from './brokerage-code'

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

describe('parseCellDateKey', () => {
  it('reads a real Date (SheetJS cellDates) as a UTC day key', () => {
    expect(parseCellDateKey(new Date('2026-08-04T00:00:00.000Z'))).toBe('2026-08-04')
  })
  it('reads the broker text format d-Mon-yy and d-Mon-yyyy', () => {
    expect(parseCellDateKey('4-Aug-26')).toBe('2026-08-04')
    expect(parseCellDateKey('15-Dec-2026')).toBe('2026-12-15')
  })
  it('reads ISO and Indian day-first strings', () => {
    expect(parseCellDateKey('2026-08-04')).toBe('2026-08-04')
    expect(parseCellDateKey('04/08/2026')).toBe('2026-08-04')
    expect(parseCellDateKey('4-8-2026')).toBe('2026-08-04')
  })
  it('reads an Excel serial number', () => {
    // 4-Aug-2026 == serial 46238
    expect(parseCellDateKey(46238)).toBe('2026-08-04')
    expect(parseCellDateKey('46238')).toBe('2026-08-04')
  })
  it('returns null for blank or unrecognised values (caller falls back, never drops)', () => {
    expect(parseCellDateKey('')).toBeNull()
    expect(parseCellDateKey(null)).toBeNull()
    expect(parseCellDateKey('Opening Balance')).toBeNull()
    expect(parseCellDateKey('4-Xyz-26')).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { normalizeWhatsappPhone, personalizeMessage, dedupeAudienceByPhone } from './whatsapp-outreach'

describe('normalizeWhatsappPhone', () => {
  it('prefixes 91 to a bare 10-digit number', () => {
    expect(normalizeWhatsappPhone('9876543210')).toBe('919876543210')
  })
  it('keeps an already 91-prefixed 12-digit number', () => {
    expect(normalizeWhatsappPhone('919876543210')).toBe('919876543210')
  })
  it('strips spaces, dashes and +', () => {
    expect(normalizeWhatsappPhone('+91 98765-43210')).toBe('919876543210')
  })
  it('rejects the placeholder numbers', () => {
    expect(normalizeWhatsappPhone('0000000000')).toBeNull()
    expect(normalizeWhatsappPhone('910000000000')).toBeNull()
  })
  it('rejects wrong-length / empty / null / undefined', () => {
    expect(normalizeWhatsappPhone('12345')).toBeNull()
    expect(normalizeWhatsappPhone('')).toBeNull()
    expect(normalizeWhatsappPhone(null)).toBeNull()
    expect(normalizeWhatsappPhone(undefined)).toBeNull()
  })
})

describe('personalizeMessage', () => {
  it('replaces every {{name}} token', () => {
    expect(personalizeMessage('Hi {{name}}, welcome {{name}}', 'Rahul')).toBe('Hi Rahul, welcome Rahul')
  })
  it('leaves a template without tokens unchanged', () => {
    expect(personalizeMessage('Hello there', 'Rahul')).toBe('Hello there')
  })
})

describe('dedupeAudienceByPhone', () => {
  it('drops invalid phones', () => {
    expect(dedupeAudienceByPhone([{ id: '1', phone: '0000000000', department: 'EQUITY' }])).toEqual([])
  })
  it('prefers the EQUITY record over MF for the same phone', () => {
    const out = dedupeAudienceByPhone([
      { id: 'mf1', phone: '9876543210', department: 'MUTUAL_FUND' },
      { id: 'eq1', phone: '9876543210', department: 'EQUITY' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('eq1')
  })
  it('keeps distinct phones', () => {
    const out = dedupeAudienceByPhone([
      { id: 'a', phone: '9876543210', department: 'EQUITY' },
      { id: 'b', phone: '9811111111', department: 'MUTUAL_FUND' },
    ])
    expect(out).toHaveLength(2)
  })
})

import { isOptOutMessage, filterOptedOut } from './whatsapp-outreach'

describe('isOptOutMessage', () => {
  it('matches opt-out keywords, case/space-insensitive', () => {
    expect(isOptOutMessage('STOP')).toBe(true)
    expect(isOptOutMessage('  stop ')).toBe(true)
    expect(isOptOutMessage('Unsubscribe')).toBe(true)
    expect(isOptOutMessage('please REMOVE me')).toBe(true)
    expect(isOptOutMessage('opt out')).toBe(true)
  })
  it('does not match normal messages', () => {
    expect(isOptOutMessage('hello, I want to invest')).toBe(false)
    expect(isOptOutMessage('')).toBe(false)
    expect(isOptOutMessage('stopwatch')).toBe(false)
  })
})

describe('filterOptedOut', () => {
  const rows = [
    { phone: '9876543210', targetType: 'CONTACT' as const },
    { phone: '9811111111', targetType: 'CONTACT' as const },
    { phone: '', targetType: 'GROUP' as const },
  ]
  it('drops CONTACT rows whose normalized phone is opted out; keeps groups', () => {
    const r = filterOptedOut(rows, new Set(['919876543210']))
    expect(r.skippedOptedOut).toBe(1)
    expect(r.kept.map((x) => x.phone)).toEqual(['9811111111', ''])
  })
  it('keeps everything when the set is empty', () => {
    const r = filterOptedOut(rows, new Set())
    expect(r.skippedOptedOut).toBe(0)
    expect(r.kept).toHaveLength(3)
  })
})

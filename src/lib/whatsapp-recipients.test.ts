import { describe, it, expect } from 'vitest'
import { parseManualRecipients } from './whatsapp-recipients'

describe('parseManualRecipients', () => {
  it('parses bare numbers and normalizes them', () => {
    const r = parseManualRecipients('9876543210\n919811111111')
    expect(r.valid).toEqual([{ phone: '919876543210' }, { phone: '919811111111' }])
    expect(r.invalidLines).toEqual([])
  })
  it('parses "number,Name" and keeps the name', () => {
    const r = parseManualRecipients('9876543210, Rahul Sharma')
    expect(r.valid).toEqual([{ phone: '919876543210', name: 'Rahul Sharma' }])
  })
  it('collects invalid lines and skips blanks', () => {
    const r = parseManualRecipients('9876543210\n\n12345\n0000000000')
    expect(r.valid).toEqual([{ phone: '919876543210' }])
    expect(r.invalidLines).toEqual(['12345', '0000000000'])
  })
  it('handles a name containing commas', () => {
    const r = parseManualRecipients('9876543210, Sharma, Rahul')
    expect(r.valid).toEqual([{ phone: '919876543210', name: 'Sharma, Rahul' }])
  })
})

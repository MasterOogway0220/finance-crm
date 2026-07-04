import { describe, it, expect } from 'vitest'
import {
  LEASE_TTL_MS,
  canAcquireLease,
  nextExpiry,
  isSendingStale,
  messageStatusLabel,
} from '@/lib/whatsapp-sender-lease'

const T0 = new Date('2026-07-04T10:00:00.000Z')

describe('canAcquireLease', () => {
  it('acquires when no lease row exists', () => {
    expect(canAcquireLease(null, 'me', T0)).toBe(true)
  })
  it('acquires when holder is empty', () => {
    expect(canAcquireLease({ holderId: null, expiresAt: null }, 'me', T0)).toBe(true)
  })
  it('renews when we already hold it (even if unexpired)', () => {
    const future = new Date(T0.getTime() + 20_000)
    expect(canAcquireLease({ holderId: 'me', expiresAt: future }, 'me', T0)).toBe(true)
  })
  it('refuses when another holder has an unexpired lease', () => {
    const future = new Date(T0.getTime() + 20_000)
    expect(canAcquireLease({ holderId: 'other', expiresAt: future }, 'me', T0)).toBe(false)
  })
  it('takes over when another holder lease is expired', () => {
    const past = new Date(T0.getTime() - 1)
    expect(canAcquireLease({ holderId: 'other', expiresAt: past }, 'me', T0)).toBe(true)
  })
  it('takes over when another holder has no expiry set', () => {
    expect(canAcquireLease({ holderId: 'other', expiresAt: null }, 'me', T0)).toBe(true)
  })
})

describe('nextExpiry', () => {
  it('adds the TTL to now', () => {
    expect(nextExpiry(T0).getTime()).toBe(T0.getTime() + LEASE_TTL_MS)
  })
})

describe('isSendingStale', () => {
  it('is false just under the threshold', () => {
    const updated = new Date(T0.getTime() - 599_000)
    expect(isSendingStale(updated, T0)).toBe(false)
  })
  it('is true at/over the threshold', () => {
    const updated = new Date(T0.getTime() - 600_000)
    expect(isSendingStale(updated, T0)).toBe(true)
  })
})

describe('messageStatusLabel', () => {
  it('maps SENDING within threshold to "sending"', () => {
    const updated = new Date(T0.getTime() - 1000)
    expect(messageStatusLabel('SENDING', updated, T0)).toBe('sending')
  })
  it('maps stale SENDING to "needs-review"', () => {
    const updated = new Date(T0.getTime() - 700_000)
    expect(messageStatusLabel('SENDING', updated, T0)).toBe('needs-review')
  })
  it('passes through terminal statuses', () => {
    expect(messageStatusLabel('SENT', T0, T0)).toBe('sent')
    expect(messageStatusLabel('FAILED', T0, T0)).toBe('failed')
    expect(messageStatusLabel('SKIPPED', T0, T0)).toBe('skipped')
    expect(messageStatusLabel('PENDING', T0, T0)).toBe('pending')
  })
})

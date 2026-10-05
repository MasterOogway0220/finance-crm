import { describe, it, expect } from 'vitest'
import { istDateKey, isRecordedLogin, sessionEndsAt, closeLogout, parseExtraTime } from './work-hours'

// IST = UTC+5:30, so 18:00 IST on 5 Oct 2026 = 12:30Z.
const CUTOFF_5_OCT = new Date('2026-10-05T12:30:00Z')

describe('istDateKey', () => {
  it('uses the IST calendar date, not the UTC one', () => {
    expect(istDateKey(new Date('2026-10-04T19:00:00Z'))).toBe('2026-10-05') // 00:30 IST
  })
})

describe('sessionEndsAt', () => {
  it('ends a daytime login at 6 PM IST the same day', () => {
    expect(sessionEndsAt(new Date('2026-10-05T04:30:00Z'))).toEqual(CUTOFF_5_OCT) // 10:00 IST
  })

  it('ends an early-morning login at 6 PM IST the same IST day', () => {
    expect(sessionEndsAt(new Date('2026-10-05T01:30:00Z'))).toEqual(CUTOFF_5_OCT) // 07:00 IST
    expect(sessionEndsAt(new Date('2026-10-04T19:00:00Z'))).toEqual(CUTOFF_5_OCT) // 00:30 IST
  })

  it('ends an after-6-PM login at the next IST midnight', () => {
    expect(sessionEndsAt(new Date('2026-10-05T13:30:00Z'))) // 19:00 IST
      .toEqual(new Date('2026-10-05T18:30:00Z'))            // 00:00 IST 6 Oct
  })
})

describe('isRecordedLogin', () => {
  it('records logins before 6 PM IST only', () => {
    expect(isRecordedLogin(new Date('2026-10-05T12:29:00Z'))).toBe(true)  // 17:59 IST
    expect(isRecordedLogin(new Date('2026-10-05T12:30:00Z'))).toBe(false) // 18:00 IST
  })
})

describe('closeLogout', () => {
  const login = new Date('2026-10-05T04:30:00Z') // 10:00 IST

  it('closes at now with the given type before the cut-off', () => {
    const now = new Date('2026-10-05T10:00:00Z')
    expect(closeLogout(login, now, 'SELF')).toEqual({ logoutAt: now, logoutType: 'SELF' })
    expect(closeLogout(login, now, 'IDLE')).toEqual({ logoutAt: now, logoutType: 'IDLE' })
  })

  it('caps at 6 PM and marks AUTO once the cut-off has passed', () => {
    const nextDay = new Date('2026-10-06T05:00:00Z')
    expect(closeLogout(login, nextDay, 'SELF')).toEqual({ logoutAt: CUTOFF_5_OCT, logoutType: 'AUTO' })
  })
})

describe('parseExtraTime', () => {
  const now = new Date('2026-10-06T05:00:00Z')

  it('accepts a window after 6 PM IST', () => {
    expect(parseExtraTime({ date: '2026-10-05', from: '18:00', to: '19:30' }, now)).toEqual({
      startAt: CUTOFF_5_OCT,
      endAt: new Date('2026-10-05T14:00:00Z'),
    })
  })

  it('treats a 00:00 end as midnight', () => {
    expect(parseExtraTime({ date: '2026-10-05', from: '22:00', to: '00:00' }, now)).toEqual({
      startAt: new Date('2026-10-05T16:30:00Z'),
      endAt: new Date('2026-10-05T18:30:00Z'),
    })
  })

  it('rejects a start before 6 PM', () => {
    expect(parseExtraTime({ date: '2026-10-05', from: '17:30', to: '19:00' }, now)).toHaveProperty('error')
  })

  it('rejects an end at or before the start', () => {
    expect(parseExtraTime({ date: '2026-10-05', from: '19:00', to: '19:00' }, now)).toHaveProperty('error')
  })

  it('rejects a window that has not finished yet', () => {
    const early = new Date('2026-10-05T13:00:00Z') // 18:30 IST
    expect(parseExtraTime({ date: '2026-10-05', from: '18:00', to: '19:00' }, early)).toHaveProperty('error')
  })

  it('rejects malformed input', () => {
    expect(parseExtraTime({ date: '5-10-2026', from: '18:00', to: '19:00' }, now)).toHaveProperty('error')
    expect(parseExtraTime({ date: '2026-10-05', from: '6pm', to: '19:00' }, now)).toHaveProperty('error')
  })
})

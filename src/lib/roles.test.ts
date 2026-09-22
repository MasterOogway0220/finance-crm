import { describe, it, expect } from 'vitest'
import { isManager, canViewAdmin, isReadOnly, shouldBlockMutation, isHrViewer, canSendWhatsapp, isIdleLogoutExempt, resolveSecondaryRoleUpdate } from './roles'

describe('isIdleLogoutExempt', () => {
  it('exempts the one carved-out login, case-insensitively', () => {
    expect(isIdleLogoutExempt('kedaroak_13@rediffmail.com')).toBe(true)
    expect(isIdleLogoutExempt('KedarOak_13@Rediffmail.com')).toBe(true)
  })
  it('does not exempt anyone else', () => {
    expect(isIdleLogoutExempt('pradipmahadik1982@gmail.com')).toBe(false)
    expect(isIdleLogoutExempt('kedaroak_13@gmail.com')).toBe(false)
    expect(isIdleLogoutExempt(null)).toBe(false)
    expect(isIdleLogoutExempt(undefined)).toBe(false)
    expect(isIdleLogoutExempt('')).toBe(false)
  })
})

describe('isManager (write capability)', () => {
  it('is true for admins', () => {
    expect(isManager('SUPER_ADMIN')).toBe(true)
    expect(isManager('ADMIN')).toBe(true)
  })
  it('is false for the CA and dealers', () => {
    expect(isManager('CHARTERED_ACCOUNTANT')).toBe(false)
    expect(isManager('EQUITY_DEALER')).toBe(false)
    expect(isManager(null)).toBe(false)
    expect(isManager(undefined)).toBe(false)
  })
})

describe('canViewAdmin (read capability)', () => {
  it('includes admins and the CA', () => {
    expect(canViewAdmin('SUPER_ADMIN')).toBe(true)
    expect(canViewAdmin('ADMIN')).toBe(true)
    expect(canViewAdmin('CHARTERED_ACCOUNTANT')).toBe(true)
  })
  it('excludes dealers and back office', () => {
    expect(canViewAdmin('EQUITY_DEALER')).toBe(false)
    expect(canViewAdmin('BACK_OFFICE')).toBe(false)
    expect(canViewAdmin(undefined)).toBe(false)
  })
})

describe('isReadOnly', () => {
  it('is true only for the CA', () => {
    expect(isReadOnly('CHARTERED_ACCOUNTANT')).toBe(true)
    expect(isReadOnly('ADMIN')).toBe(false)
  })
})

describe('isHrViewer', () => {
  it('is true for a designated HR viewer email', () => {
    expect(isHrViewer('pradipmahadik1982@gmail.com')).toBe(true)
  })
  it('is false for any other email or a missing email', () => {
    expect(isHrViewer('someone.else@gmail.com')).toBe(false)
    expect(isHrViewer('')).toBe(false)
    expect(isHrViewer(null)).toBe(false)
    expect(isHrViewer(undefined)).toBe(false)
  })
})

describe('shouldBlockMutation', () => {
  it('blocks state-changing methods for the CA', () => {
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'POST', '/api/clients')).toBe(true)
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'DELETE', '/api/clients/1')).toBe(true)
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'PATCH', '/api/leaves/1')).toBe(true)
  })
  it('allows safe methods for the CA', () => {
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'GET', '/api/dashboard/admin')).toBe(false)
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'HEAD', '/dashboard')).toBe(false)
  })
  it('always allows NextAuth endpoints so the CA can log out', () => {
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'POST', '/api/auth/signout')).toBe(false)
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'POST', '/api/auth/session')).toBe(false)
  })
  it('allows the report export endpoint (read-only POST) for the CA', () => {
    expect(shouldBlockMutation('CHARTERED_ACCOUNTANT', 'POST', '/api/reports/export')).toBe(false)
  })
  it('never blocks non-CA roles', () => {
    expect(shouldBlockMutation('ADMIN', 'POST', '/api/clients')).toBe(false)
    expect(shouldBlockMutation('EQUITY_DEALER', 'DELETE', '/api/clients/1')).toBe(false)
    expect(shouldBlockMutation(undefined, 'POST', '/api/clients')).toBe(false)
  })
})

describe('canSendWhatsapp', () => {
  it('allows admins and marketing; rejects CA, dealers, null', () => {
    expect(canSendWhatsapp('SUPER_ADMIN')).toBe(true)
    expect(canSendWhatsapp('ADMIN')).toBe(true)
    expect(canSendWhatsapp('MARKETING')).toBe(true)
    expect(canSendWhatsapp('CHARTERED_ACCOUNTANT')).toBe(false)
    expect(canSendWhatsapp('EQUITY_DEALER')).toBe(false)
    expect(canSendWhatsapp(null)).toBe(false)
    expect(canSendWhatsapp(undefined)).toBe(false)
  })
})

describe('resolveSecondaryRoleUpdate', () => {
  const bo = { role: 'BACK_OFFICE', secondaryRole: null }
  const boAdmin = { role: 'BACK_OFFICE', secondaryRole: 'ADMIN' }

  it('rejects a new secondary equal to the stored primary (change-secondary-only)', () => {
    expect(() => resolveSecondaryRoleUpdate(bo, { secondaryRole: 'BACK_OFFICE' }, true)).toThrow(/differ/)
  })
  it('rejects a new primary equal to the stored secondary (change-primary-only)', () => {
    expect(() => resolveSecondaryRoleUpdate(boAdmin, { role: 'ADMIN' }, false)).toThrow(/differ/)
  })
  it('rejects when both change to the same role', () => {
    expect(() => resolveSecondaryRoleUpdate(bo, { role: 'ADMIN', secondaryRole: 'ADMIN' }, true)).toThrow(/differ/)
  })
  it('allows a distinct secondary and returns it', () => {
    expect(resolveSecondaryRoleUpdate(bo, { secondaryRole: 'ADMIN' }, true)).toBe('ADMIN')
  })
  it('clears the secondary when explicitly set to null', () => {
    expect(resolveSecondaryRoleUpdate(boAdmin, { secondaryRole: null }, true)).toBe(null)
  })
  it('keeps the stored secondary when the field is untouched', () => {
    expect(resolveSecondaryRoleUpdate(boAdmin, { role: 'EQUITY_DEALER' }, false)).toBe('ADMIN')
  })
  it('treats a fresh create (existing secondary null, provided true) correctly', () => {
    expect(resolveSecondaryRoleUpdate({ role: 'BACK_OFFICE', secondaryRole: null }, { secondaryRole: 'ADMIN' }, true)).toBe('ADMIN')
    expect(() => resolveSecondaryRoleUpdate({ role: 'ADMIN', secondaryRole: null }, { secondaryRole: 'ADMIN' }, true)).toThrow(/differ/)
  })
})

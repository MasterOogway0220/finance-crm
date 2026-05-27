import { describe, it, expect } from 'vitest'
import { isManager, canViewAdmin, isReadOnly, shouldBlockMutation } from './roles'

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

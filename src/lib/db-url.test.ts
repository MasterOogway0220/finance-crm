import { describe, it, expect } from 'vitest'
import { withServerlessPool } from './db-url'

const BASE = 'mysql://user:p%40ss@145.79.212.111:3306/u150393620_crm'

describe('withServerlessPool', () => {
  it('overrides an existing high connection_limit', () => {
    const out = withServerlessPool(`${BASE}?connection_limit=10`)
    expect(out).toContain('connection_limit=1')
    expect(out).not.toContain('connection_limit=10')
  })

  it('appends connection_limit when absent', () => {
    const out = withServerlessPool(BASE)
    expect(out).toContain('connection_limit=1')
  })

  it('adds a pool_timeout when absent', () => {
    const out = withServerlessPool(`${BASE}?connection_limit=10`)
    expect(out).toContain('pool_timeout=20')
  })

  it('does not clobber an explicitly-set pool_timeout', () => {
    const out = withServerlessPool(`${BASE}?pool_timeout=5`)
    expect(out).toContain('pool_timeout=5')
    expect(out).not.toContain('pool_timeout=20')
  })

  it('preserves other query params (e.g. sslaccept)', () => {
    const out = withServerlessPool(`${BASE}?sslaccept=strict&connection_limit=10`)
    expect(out).toContain('sslaccept=strict')
    expect(out).toContain('connection_limit=1')
  })

  it('leaves the credentials/host/db portion untouched', () => {
    const out = withServerlessPool(`${BASE}?connection_limit=10`)
    expect(out?.startsWith(`${BASE}?`)).toBe(true)
  })

  it('respects a custom connection limit and timeout', () => {
    const out = withServerlessPool(BASE, 3, 30)
    expect(out).toContain('connection_limit=3')
    expect(out).toContain('pool_timeout=30')
  })

  it('returns undefined for undefined input', () => {
    expect(withServerlessPool(undefined)).toBeUndefined()
  })
})

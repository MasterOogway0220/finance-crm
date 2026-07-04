/**
 * Pure decision helpers for the single-sender lease and per-message claim.
 *
 * The lease and claim are ATOMICALLY enforced in the database (updateMany with a
 * conditional WHERE); these functions mirror those conditions so they can be unit
 * tested and reused for UI hints. `worker/send.js` mirrors this logic in CommonJS.
 */
export const LEASE_TTL_MS = 30_000
export const LEASE_RENEW_MS = 10_000
export const STALE_SENDING_MS = 600_000

export function canAcquireLease(
  lease: { holderId: string | null; expiresAt: Date | null } | null,
  me: string,
  now: Date,
): boolean {
  if (!lease) return true
  if (!lease.holderId) return true
  if (lease.holderId === me) return true
  if (!lease.expiresAt) return true
  return lease.expiresAt.getTime() < now.getTime()
}

export function nextExpiry(now: Date, ttlMs: number = LEASE_TTL_MS): Date {
  return new Date(now.getTime() + ttlMs)
}

export function isSendingStale(
  updatedAt: Date,
  now: Date,
  thresholdMs: number = STALE_SENDING_MS,
): boolean {
  return now.getTime() - updatedAt.getTime() >= thresholdMs
}

export type MessageStatusLabel =
  | 'pending' | 'sending' | 'needs-review' | 'sent' | 'failed' | 'skipped'

export function messageStatusLabel(status: string, updatedAt: Date, now: Date): MessageStatusLabel {
  switch (status) {
    case 'SENDING': return isSendingStale(updatedAt, now) ? 'needs-review' : 'sending'
    case 'SENT': return 'sent'
    case 'FAILED': return 'failed'
    case 'SKIPPED': return 'skipped'
    default: return 'pending'
  }
}

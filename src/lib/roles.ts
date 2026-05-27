import { Role } from '@prisma/client'

const ROLE_PRIORITY: Record<string, number> = {
  SUPER_ADMIN: 5,
  ADMIN: 4,
  CHARTERED_ACCOUNTANT: 4,
  EQUITY_DEALER: 3,
  MF_DEALER: 3,
  BACK_OFFICE: 2,
}

/** Returns the highest-privilege role between primary and secondary. */
export function getEffectiveRole(user: { role: Role; secondaryRole?: Role | null }): Role {
  if (!user.secondaryRole) return user.role
  const primaryPriority = ROLE_PRIORITY[user.role] ?? 0
  const secondaryPriority = ROLE_PRIORITY[user.secondaryRole] ?? 0
  return secondaryPriority > primaryPriority ? user.secondaryRole : user.role
}

/** WRITE capability: only real admins can mutate. The CA is excluded. */
export function isManager(role?: string | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

/** READ capability: admins plus the read-only Chartered Accountant. */
export function canViewAdmin(role?: string | null): boolean {
  return isManager(role) || role === 'CHARTERED_ACCOUNTANT'
}

/** True for the read-only Chartered Accountant role. */
export function isReadOnly(role?: string | null): boolean {
  return role === 'CHARTERED_ACCOUNTANT'
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Authoritative write boundary for the read-only role. Returns true when a
 * request must be rejected: a read-only user using a state-changing HTTP
 * method against anything other than the exempt endpoints (NextAuth, needed
 * for logout; and report export, a read-only POST).
 */
export function shouldBlockMutation(
  role: string | null | undefined,
  method: string,
  pathname: string,
): boolean {
  if (!isReadOnly(role)) return false
  if (SAFE_METHODS.has(method.toUpperCase())) return false
  // Exempt non-GET endpoints that are safe for a read-only user: NextAuth
  // (login/logout) and the report export endpoint, which is POST only because
  // its body carries filters/columns — it reads data to build a file, never writes.
  if (pathname.startsWith('/api/auth')) return false
  if (pathname.startsWith('/api/reports/export')) return false
  return true
}

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

/**
 * Back-office staff who, despite not being admins, are granted read-only access
 * to specific HR modules (Login/Logoff History and the Employee Leave Report).
 * Keyed by email so the carve-out lives in exactly one place — add an address
 * here to grant another HR person the same view-only access.
 */
const HR_VIEWER_EMAILS = new Set<string>(['pradipmahadik1982@gmail.com'])

/** True for a designated HR viewer (read-only access to the HR modules). */
export function isHrViewer(email?: string | null): boolean {
  return !!email && HR_VIEWER_EMAILS.has(email)
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

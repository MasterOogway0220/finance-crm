import { Role } from '@prisma/client'

const ROLE_PRIORITY: Record<string, number> = {
  SUPER_ADMIN: 5,
  ADMIN: 4,
  CHARTERED_ACCOUNTANT: 4,
  EQUITY_DEALER: 3,
  MF_DEALER: 3,
  BACK_OFFICE: 2,
  MARKETING: 2,
}

/**
 * Merges a (possibly partial) role update onto an employee's stored values and
 * returns the secondaryRole to persist. Throws if the effective secondary equals
 * the effective primary — a secondary equal to the primary is not a dual role and
 * renders as two identical login-picker cards (duplicate React keys, no real
 * second choice), so we reject it at the write boundary.
 *
 * `secondaryProvided` distinguishes an explicit clear (`patch.secondaryRole`
 * `null` → returns null) from an untouched field (returns the stored value). Pass
 * `true` with `existing.secondaryRole: null` for a fresh create.
 */
export function resolveSecondaryRoleUpdate(
  existing: { role: string; secondaryRole: string | null },
  patch: { role?: string | null; secondaryRole?: string | null },
  secondaryProvided: boolean,
): string | null {
  const effectiveRole = patch.role ?? existing.role
  const effectiveSecondary = secondaryProvided ? (patch.secondaryRole ?? null) : existing.secondaryRole
  if (effectiveSecondary && effectiveSecondary === effectiveRole) {
    throw new Error('Secondary role must differ from the primary role')
  }
  return effectiveSecondary
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

/** Can operate the WhatsApp sender: real admins plus the Marketing role (CA excluded). */
export function canSendWhatsapp(role?: string | null): boolean {
  return isManager(role) || role === 'MARKETING'
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

/**
 * Logins exempt from the 30-minute idle auto-logout — their session ends only when
 * they explicitly log out. Same email-keyed carve-out shape as HR_VIEWER_EMAILS.
 */
const IDLE_LOGOUT_EXEMPT_EMAILS = new Set<string>(['kedaroak_13@rediffmail.com'])

/** True when this login must never be signed out for inactivity. */
export function isIdleLogoutExempt(email?: string | null): boolean {
  return !!email && IDLE_LOGOUT_EXEMPT_EMAILS.has(email.toLowerCase())
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

import { Role } from '@prisma/client'

const ROLE_PRIORITY: Record<string, number> = {
  SUPER_ADMIN: 5,
  ADMIN: 4,
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

import type { Prisma } from '@prisma/client'
import { isCurrentMonth } from '@/lib/utils'

/**
 * Returns the Prisma `where` fragment that restricts BrokerageDetail rows to a
 * given operator scope, applying hybrid attribution:
 *
 *   - For the current calendar month: filter by Client.operatorId (current owner).
 *     Mid-month transfers move credit to the new owner.
 *   - For any past month: filter by BrokerageDetail.operatorId (snapshot at upload).
 *     Closed months are immutable — transfers don't shift past attribution.
 *
 * Caller composes the result into the full where clause, e.g.
 *   const where = { ...brokerageOperatorFilter(opId, month, year), brokerage: { isActive: true, ... } }
 *
 * Scope semantics:
 *   - string         → single operator
 *   - string[]       → multiple operators (admin view across dealers)
 *   - null/undefined → no operator restriction (admin "all")
 */
export function brokerageOperatorFilter(
  scope: string | string[] | null | undefined,
  month: number,
  year: number,
): Prisma.BrokerageDetailWhereInput {
  if (scope == null) return {}
  const isCurrent = isCurrentMonth(month, year)
  if (Array.isArray(scope)) {
    return isCurrent
      ? { client: { operatorId: { in: scope } } }
      : { operatorId: { in: scope } }
  }
  return isCurrent
    ? { client: { operatorId: scope } }
    : { operatorId: scope }
}

/**
 * Like brokerageOperatorFilter but for a SINGLE day of brokerage rows.
 * Day → month/year is derived from the date itself, so this function decides
 * current vs snapshot based on the date being viewed, not "today".
 *
 * Returns both the operator filter AND a flag indicating which attribution was used,
 * so callers building merged results know which clientId they should read
 * (`client.operatorId` for current, `operatorId` for snapshot).
 */
export function brokerageOperatorFilterForDate(
  scope: string | string[] | null | undefined,
  date: Date,
): { where: Prisma.BrokerageDetailWhereInput; attribution: 'current' | 'snapshot' } {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  const isCurrent = isCurrentMonth(month, year)
  return {
    where: brokerageOperatorFilter(scope, month, year),
    attribution: isCurrent ? 'current' : 'snapshot',
  }
}

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
 *   - string[]       → multiple operators (admin view across dealers).
 *                      An empty array is intentionally NOT short-circuited — it produces
 *                      a `{ in: [] }` clause that matches zero rows. Callers who want
 *                      "no operator restriction" must pass null/undefined.
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

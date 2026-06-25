import { Prisma } from '@prisma/client'
import { getMonthRange } from '@/lib/utils'

/**
 * Brokerage-driven traded-status sync.
 *
 * `Client.status` (TRADED / NOT_TRADED) for EQUITY clients is a *derived* value:
 * a client is TRADED iff they have at least one ACTIVE brokerage detail dated in
 * the current month. Historically the flag was written imperatively at upload time
 * and could drift when an upload was re-versioned, reversed, or re-activated
 * (the activate path never resynced it). This module makes the flag a pure function
 * of the active brokerage data so it can be recomputed after any such change.
 */

// Accepts both a full PrismaClient and an interactive-transaction client.
type DbClient = Pick<Prisma.TransactionClient, 'brokerageDetail' | 'client'>

/**
 * Pure partition: given a set of candidate client ids and the ids that currently
 * count as traded, decide who should be TRADED vs NOT_TRADED.
 *
 * Null-safe by design — null / undefined / empty client ids (e.g. brokerage rows
 * with no matched client code) are dropped, and ids are de-duplicated. This is the
 * unit under test; the DB wrapper below is a thin shell around it.
 */
export function partitionByTradedStatus(
  clientIds: ReadonlyArray<string | null | undefined>,
  tradedClientIds: Iterable<string | null | undefined>,
): { toTrade: string[]; toReset: string[] } {
  const ids = [...new Set(clientIds.filter((id): id is string => !!id))]
  const tradedSet = new Set([...tradedClientIds].filter((id): id is string => !!id))
  return {
    toTrade: ids.filter((id) => tradedSet.has(id)),
    toReset: ids.filter((id) => !tradedSet.has(id)),
  }
}

/**
 * Recompute and persist `Client.status` for the given EQUITY clients from the
 * single source of truth: do they have an ACTIVE brokerage detail in `ref`'s month?
 *
 * - Tolerates null / unmapped client ids (those rows are simply ignored).
 * - Only writes rows whose status actually changes, so `updatedAt` doesn't churn.
 * - Safe to call inside a transaction (pass the `tx` client) or standalone.
 *
 * Returns how many clients were flipped to TRADED / NOT_TRADED.
 */
export async function resyncEquityClientStatus(
  db: DbClient,
  clientIds: ReadonlyArray<string | null | undefined>,
  ref: Date = new Date(),
): Promise<{ traded: number; notTraded: number }> {
  const ids = [...new Set(clientIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return { traded: 0, notTraded: 0 }

  const { start, end } = getMonthRange(ref.getMonth() + 1, ref.getFullYear())

  const activeRows = await db.brokerageDetail.findMany({
    where: {
      clientId: { in: ids },
      brokerage: { isActive: true, uploadDate: { gte: start, lte: end } },
    },
    select: { clientId: true },
    distinct: ['clientId'],
  })

  const { toTrade, toReset } = partitionByTradedStatus(
    ids,
    activeRows.map((r) => r.clientId),
  )

  let traded = 0
  let notTraded = 0
  if (toTrade.length > 0) {
    const res = await db.client.updateMany({
      where: { id: { in: toTrade }, department: 'EQUITY', status: { not: 'TRADED' } },
      data: { status: 'TRADED' },
    })
    traded = res.count
  }
  if (toReset.length > 0) {
    const res = await db.client.updateMany({
      where: { id: { in: toReset }, department: 'EQUITY', status: { not: 'NOT_TRADED' } },
      data: { status: 'NOT_TRADED' },
    })
    notTraded = res.count
  }
  return { traded, notTraded }
}

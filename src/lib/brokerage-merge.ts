/**
 * Builds the detail rows for a new brokerage version.
 *
 * A trading day arrives as one ledger file per segment: the cash segment, and — on days
 * there were options trades — the F&O segment. The upload route used to write a version
 * containing only the rows in the file just uploaded, so the second file replaced the
 * first. Options brokerage therefore had no way into the system at all; it entered the DB
 * once, via a hand-run of `scripts/ingest-fno-ledger.ts`, and any later re-upload of the
 * cash ledger silently wiped it again.
 *
 * So a version is composed per segment: rows belonging to OTHER segments are carried
 * forward from the day's active version untouched, and the uploaded file supplies every
 * row for `segment`. Uploading the F&O file adds options without disturbing cash;
 * re-uploading a corrected cash file replaces cash without disturbing options. Because the
 * uploaded segment is replaced rather than added to, uploading the same file twice is a
 * no-op rather than a double-count.
 *
 * A client who traded both segments on the same day gets one row per segment — hence the
 * (brokerageId, clientCode, segment) uniqueness, not (brokerageId, clientCode).
 *
 * ponytail: rows new to this version take the client's *current* owner as their operator
 * snapshot; carried rows keep the snapshot they already had. Right for same-day uploads,
 * the real case. Uploading into a past month back-dates any transfer since — pass an
 * as-of-uploadDate operator map if that ever becomes routine.
 */

export type Segment = 'CASH' | 'FNO'

export type DetailRow = {
  clientCode: string
  clientId: string | null
  operatorId: string
  amount: number
  segment: Segment
}

export function buildVersionDetails(
  prevRows: ReadonlyArray<DetailRow>,
  segment: Segment,
  codeAmountMap: ReadonlyMap<string, number>,
  codeToClient: ReadonlyMap<string, { id: string; operatorId: string }>,
): {
  details: DetailRow[]
  unmappedCodes: string[]
  segmentAmount: number
  carriedAmount: number
  mappedFromFile: number
} {
  // Everything the uploaded file is not responsible for survives untouched.
  const details: DetailRow[] = prevRows.filter((r) => r.segment !== segment).map((r) => ({ ...r }))
  const carriedAmount = details.reduce((sum, d) => sum + d.amount, 0)

  const unmappedCodes: string[] = []
  let segmentAmount = 0

  for (const [clientCode, amount] of codeAmountMap) {
    const client = codeToClient.get(clientCode)
    if (!client) {
      unmappedCodes.push(clientCode)
      continue
    }
    segmentAmount += amount
    details.push({ clientCode, clientId: client.id, operatorId: client.operatorId, amount, segment })
  }

  return {
    details,
    unmappedCodes,
    segmentAmount,
    carriedAmount,
    mappedFromFile: codeAmountMap.size - unmappedCodes.length,
  }
}

/**
 * After one or more versions of a (date, branch) group are reversed (deleted),
 * decides which remaining version should become active.
 *
 * Reversing the active version used to leave the whole day with no active version:
 * the brokerage views (which query `isActive: true`) showed nothing, and the next
 * upload read an empty `prevRows` and so dropped the day's OTHER segment — an F&O
 * ledger silently vanished when a cash correction was reversed and re-uploaded.
 *
 * Returns the id of the highest-version survivor to activate, or null when the
 * group still has an active version or has no survivors at all (nothing to do).
 */
export function reactivationTarget(
  remaining: ReadonlyArray<{ id: string; version: number; isActive: boolean }>,
): string | null {
  if (remaining.length === 0) return null
  if (remaining.some((u) => u.isActive)) return null
  return remaining.reduce((max, u) => (u.version > max.version ? u : max)).id
}

/**
 * Builds the detail rows for a new brokerage version.
 *
 * A trading day arrives as more than one ledger: the cash segment and, separately, the
 * F&O / options segment. The upload route used to write a version containing only the
 * rows in the file just uploaded, so the second file replaced the first — options
 * brokerage could only ever be injected by hand-running `scripts/ingest-fno-ledger.ts`,
 * and any later re-upload of the cash ledger silently wiped it again.
 *
 * `prevRows` is the day's currently-active rows: pass them to ADD this file to the day
 * (a second segment), pass `[]` to REPLACE the day (a corrected re-upload of the same
 * ledger). Amounts for a code present in both are summed; the operator snapshot on an
 * existing row is kept, since that row's attribution is already settled.
 *
 * ponytail: a code that appears ONLY in the second file gets the client's *current* owner
 * as its snapshot. Correct for a same-month merge, which is the real case (both segment
 * files land on the trading day). Merging into a past month back-dates any transfer since,
 * and does it unevenly — the client keeps the old operator if they were in the first file
 * and gets the new one if they weren't. If past-month merges ever become routine, pass the
 * operator map as of `uploadDate` instead of today.
 */

export type DetailRow = {
  clientCode: string
  clientId: string | null
  operatorId: string
  amount: number
}

export function mergeBrokerageDetails(
  prevRows: ReadonlyArray<DetailRow>,
  codeAmountMap: ReadonlyMap<string, number>,
  codeToClient: ReadonlyMap<string, { id: string; operatorId: string }>,
): {
  details: DetailRow[]
  unmappedCodes: string[]
  addedAmount: number
  carriedAmount: number
  mappedFromFile: number
} {
  const merged = new Map<string, DetailRow>()
  for (const row of prevRows) merged.set(row.clientCode, { ...row })
  const carriedAmount = prevRows.reduce((sum, d) => sum + d.amount, 0)

  const unmappedCodes: string[] = []
  let addedAmount = 0

  for (const [code, amount] of codeAmountMap) {
    const client = codeToClient.get(code)
    if (!client) {
      unmappedCodes.push(code)
      continue
    }
    addedAmount += amount
    const row = merged.get(code)
    if (row) row.amount += amount
    else merged.set(code, { clientCode: code, clientId: client.id, operatorId: client.operatorId, amount })
  }

  return {
    details: [...merged.values()],
    unmappedCodes,
    addedAmount,
    carriedAmount,
    mappedFromFile: codeAmountMap.size - unmappedCodes.length,
  }
}

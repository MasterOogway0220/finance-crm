/**
 * Client-code extraction from a broker ledger narration.
 *
 * The FNO/equity ledger writes the segment marker and the client code in two shapes:
 *   "F/58581903 18S442"  → voucher no. and code separated by a space
 *   "F18S479"            → segment marker glued straight onto the code
 *   "FB91382619"         → same, with the BSE F&O marker
 *
 * The second shape used to yield "F18S479", which matches no row in Client master, so
 * those rows were silently dropped at upload (`unmappedCodes`) — the client showed no
 * brokerage and never flipped to TRADED. Real client codes always start with a digit,
 * so a leading `F` or `FB` immediately followed by one is the marker, never part of the code.
 *
 * A bare `F/12345678` with no code is deliberately left alone: stripping it would turn
 * a voucher number into a plausible-looking 8-digit client code.
 */
export function extractClientCodeFromNarration(narration: string): string {
  const trimmed = narration.trim()
  const lastSpaceIdx = trimmed.lastIndexOf(' ')
  const token = (lastSpaceIdx === -1 ? trimmed : trimmed.slice(lastSpaceIdx + 1)).trim().toUpperCase()
  return token.replace(/^FB?(?=\d)/, '')
}

const LEDGER_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Parses a ledger row's Date cell into a 'YYYY-MM-DD' key, or null when it can't be
 * read. Handles the shapes SheetJS yields: a real Date (workbook read with cellDates),
 * an Excel serial number, and the broker's text formats ("4-Aug-26", "2026-08-04",
 * "04/08/2026", day-first). Unrecognised values return null so the caller can fall back
 * to the picked upload date rather than drop the row.
 */
export function parseCellDateKey(val: unknown): string | null {
  if (val == null || val === '') return null
  if (val instanceof Date && !isNaN(val.getTime())) {
    // SheetJS cellDates builds a date cell at *local* midnight (minus a few seconds of
    // historical-offset drift), so on an IST server 4-Aug arrives as 2026-08-03T18:29:59Z
    // and reading its UTC day filed every row of a multi-date ledger one day early.
    // Nudging by 12h and reading the local day lands on the intended day for both that
    // shape and a plain UTC-midnight Date, in any timezone within ±12h.
    const d = new Date(val.getTime() + 12 * 3600 * 1000)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }
  const s = String(val).trim()
  if (!s) return null
  // Excel serial (days since 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const d = new Date(Math.round((parseFloat(s) - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  }
  // d-Mon-yy / d-Mon-yyyy (broker ledger)
  let m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})$/)
  if (m) {
    const mon = LEDGER_MONTHS.indexOf(m[2].toLowerCase())
    if (mon === -1) return null
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return `${year}-${pad2(mon + 1)}-${pad2(Number(m[1]))}`
  }
  // ISO YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // DD/MM/YYYY or DD-MM-YYYY (Indian day-first)
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`
  return null
}

/**
 * Operators whose clients are auto-flipped to TRADED during brokerage upload
 * when brokerage is recorded for the client that month. All other equity
 * operators continue to manage TRADED/NOT_TRADED manually.
 *
 * The monthly reset flips every equity client back to NOT_TRADED for everyone
 * — only the auto-upgrade is scoped to this list.
 */
export const AUTO_TRADE_OPERATOR_EMAILS: ReadonlySet<string> = new Set([
  'kedaroak_13@rediffmail.com', // Kedar Sir (Kedar Dattatraya Oak)
  'sarveshoak3@gmail.com',      // Sarvesh Kedar Oak
])

export function isAutoTradeOperator(email: string | null | undefined): boolean {
  if (!email) return false
  return AUTO_TRADE_OPERATOR_EMAILS.has(email.toLowerCase())
}

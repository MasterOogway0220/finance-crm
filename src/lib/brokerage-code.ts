/**
 * Client-code extraction from a broker ledger narration.
 *
 * The FNO/equity ledger writes the segment marker and the client code in two shapes:
 *   "F/58581903 18S442"  → voucher no. and code separated by a space
 *   "F18S479"            → segment marker glued straight onto the code
 *
 * The second shape used to yield "F18S479", which matches no row in Client master, so
 * those rows were silently dropped at upload (`unmappedCodes`) — the client showed no
 * brokerage and never flipped to TRADED. Real client codes always start with a digit,
 * so a leading `F` immediately followed by one is the marker, never part of the code.
 *
 * A bare `F/12345678` with no code is deliberately left alone: stripping it would turn
 * a voucher number into a plausible-looking 8-digit client code.
 */
export function extractClientCodeFromNarration(narration: string): string {
  const trimmed = narration.trim()
  const lastSpaceIdx = trimmed.lastIndexOf(' ')
  const token = (lastSpaceIdx === -1 ? trimmed : trimmed.slice(lastSpaceIdx + 1)).trim().toUpperCase()
  return token.replace(/^F(?=\d)/, '')
}

/**
 * Pure helpers for the inactive-client WhatsApp outreach feature.
 * Shared by the audience/campaign API routes. The office-PC worker keeps its
 * own CommonJS copy of normalizeWhatsappPhone (it cannot import from '@/lib').
 */

export type Segment = 'all' | 'equity' | 'mf' | 'dormant2m'

/** Normalise an Indian phone to WhatsApp's 12-digit `91XXXXXXXXXX` form; null if invalid/placeholder. */
export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length !== 10) return null
  if (d === '0000000000') return null
  return `91${d}`
}

/** Replace every {{name}} token with the client's first name. */
export function personalizeMessage(template: string, firstName: string): string {
  return template.replaceAll('{{name}}', firstName)
}

/**
 * Dedupe audience records by normalised phone, preferring the EQUITY record when
 * the same phone exists in both departments. Drops invalid phones. Stable within a department.
 */
export function dedupeAudienceByPhone<T extends { phone: string; department: string }>(records: T[]): T[] {
  const equity = records.filter((r) => r.department === 'EQUITY')
  const others = records.filter((r) => r.department !== 'EQUITY')
  const ordered = [...equity, ...others]
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of ordered) {
    const p = normalizeWhatsappPhone(r.phone)
    if (!p) continue
    if (seen.has(p)) continue
    seen.add(p)
    out.push(r)
  }
  return out
}

const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'OPT OUT', 'OPTOUT', 'REMOVE', 'CANCEL']

/** True when an inbound message body signals an opt-out (whole-word / prefix match, case-insensitive). */
export function isOptOutMessage(body: string): boolean {
  const text = (body || '').trim().toUpperCase()
  if (!text) return false
  return OPT_OUT_KEYWORDS.some((kw) => text === kw || text.startsWith(kw + ' ') || text.includes(' ' + kw))
}

/** Drop CONTACT rows whose normalized phone is opted out; GROUP rows and unnormalizable phones are always kept. */
export function filterOptedOut<T extends { phone: string; targetType: 'CONTACT' | 'GROUP' }>(
  rows: T[], optedOut: Set<string>,
): { kept: T[]; skippedOptedOut: number } {
  const kept: T[] = []
  let skippedOptedOut = 0
  for (const row of rows) {
    if (row.targetType === 'CONTACT') {
      const n = normalizeWhatsappPhone(row.phone)
      if (n && optedOut.has(n)) { skippedOptedOut++; continue }
    }
    kept.push(row)
  }
  return { kept, skippedOptedOut }
}

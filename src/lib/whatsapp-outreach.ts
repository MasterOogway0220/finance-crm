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

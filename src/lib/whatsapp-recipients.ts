import { normalizeWhatsappPhone } from './whatsapp-outreach'

export interface ManualRecipient {
  phone: string
  name?: string
}

/**
 * Parse a textarea of "number" or "number,Name" lines. Phones are normalized to the
 * `91XXXXXXXXXX` form; unparseable lines are returned in `invalidLines`. Blank lines are ignored.
 */
export function parseManualRecipients(text: string): { valid: ManualRecipient[]; invalidLines: string[] } {
  const valid: ManualRecipient[] = []
  const invalidLines: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const commaIdx = line.indexOf(',')
    const rawPhone = commaIdx === -1 ? line : line.slice(0, commaIdx)
    const name = commaIdx === -1 ? '' : line.slice(commaIdx + 1).trim()
    const normalized = normalizeWhatsappPhone(rawPhone)
    if (!normalized) { invalidLines.push(line); continue }
    valid.push(name ? { phone: normalized, name } : { phone: normalized })
  }
  return { valid, invalidLines }
}

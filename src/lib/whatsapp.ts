/**
 * WhatsApp notifications via Meta Cloud API.
 *
 * Required env vars:
 *   WHATSAPP_TOKEN            — permanent system user token from Meta
 *   WHATSAPP_PHONE_NUMBER_ID  — the phone number ID from Meta Business dashboard
 *
 * If either env var is missing, all sends are silently skipped so the app
 * keeps working without WhatsApp configured.
 *
 * Template-based messages are used for business-initiated conversations.
 * The template "hello_world" is the only pre-approved template on a fresh account.
 * For custom text we use a free-form text message (only works within 24-hour
 * user-initiated window). For outbound notifications we recommend creating
 * and approving a custom template in Meta Business Manager.
 *
 * For simplicity we send plain text messages here. Replace with template calls
 * once your templates are approved.
 */

const TOKEN = process.env.WHATSAPP_TOKEN
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`

function normalisePhone(phone: string): string {
  // Strip spaces, dashes, parens
  const digits = phone.replace(/\D/g, '')
  // Indian numbers: add country code if missing
  if (digits.length === 10) return `91${digits}`
  // Already has country code
  return digits
}

/**
 * Send a plain text WhatsApp message to a phone number.
 * Silently skips if env vars are not configured or phone is a placeholder.
 */
export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  if (!TOKEN || !PHONE_NUMBER_ID) return
  if (!phone || phone === '0000000000') return

  const to = normalisePhone(phone)

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[WhatsApp] Send failed:', err)
    }
  } catch (err) {
    console.error('[WhatsApp] Network error:', err)
  }
}

/**
 * Send a WhatsApp notification to an employee fetched from DB.
 * Pass the employee's phone + a human-readable message.
 */
export async function notifyEmployeeWhatsApp(phone: string, title: string, message: string): Promise<void> {
  const body = `*${title}*\n${message}`
  await sendWhatsAppMessage(phone, body)
}

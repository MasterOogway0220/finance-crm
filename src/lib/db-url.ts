/**
 * Force a serverless-safe connection pool onto a database URL.
 *
 * On Vercel each warm function instance keeps its own Prisma connection pool.
 * Our MySQL host (Hostinger shared) caps connections per DB user at 75, shared
 * across Vercel, local dev, and the office WhatsApp worker. A high
 * `connection_limit` lets a handful of warm instances exhaust that cap, after
 * which every new query throws "too many connections". In the login path
 * `authorize()` swallows that error and returns null, so users just see a
 * generic NextAuth `CredentialsSignin` ("Login failed. Check credentials.").
 *
 * We override `connection_limit` (default 1) so each instance holds a single
 * connection, and only *add* a generous `pool_timeout` so brief in-instance
 * contention waits instead of failing. Credentials and any other query params
 * (sslaccept, etc.) are left untouched — we only rewrite the query string, never
 * the user:password@host/db portion, to avoid re-encoding the password.
 */
export function withServerlessPool(
  raw: string | undefined,
  connectionLimit = 1,
  poolTimeoutSeconds = 20,
): string | undefined {
  if (!raw) return raw
  const qIndex = raw.indexOf('?')
  const base = qIndex === -1 ? raw : raw.slice(0, qIndex)
  const query = qIndex === -1 ? '' : raw.slice(qIndex + 1)
  const params = new URLSearchParams(query)
  params.set('connection_limit', String(connectionLimit))
  if (!params.has('pool_timeout')) params.set('pool_timeout', String(poolTimeoutSeconds))
  return `${base}?${params.toString()}`
}

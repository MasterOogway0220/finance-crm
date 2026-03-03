export function validateClientCode(code: string): boolean {
  const formatA = /^\d{2,3}[A-Z]\d{3}$/        // 18K099, 411E015
  const formatB = /^\d{8}$/                      // 91383117
  const formatC = /^\d{2}[A-Z]{1,5}\d{2,3}$/   // 18KS008, 18GO38
  return formatA.test(code) || formatB.test(code) || formatC.test(code)
}

export function getClientCodeError(code: string): string | null {
  if (!code) return 'Client code is required'
  if (!validateClientCode(code)) {
    return 'Invalid client code format. Accepted formats: 18K099, 411E015, 91383117, 18KS008, 18GO38'
  }
  return null
}

export function validateClientCode(code: string): boolean {
  const formatA = /^\d{2}[A-Z]\d{3}$/          // 18K099
  const formatB = /^\d{8}$/                      // 91383117
  const formatC = /^\d{2}[A-Z]{1,5}\d{3}$/      // 18KS008
  return formatA.test(code) || formatB.test(code) || formatC.test(code)
}

export function getClientCodeError(code: string): string | null {
  if (!code) return 'Client code is required'
  if (!validateClientCode(code)) {
    return 'Invalid client code format. Accepted formats: 18K099 (2 digits + letter + 3 digits), 91383117 (8 digits), 18KS008 (2 digits + 1-5 letters + 3 digits)'
  }
  return null
}

'use client'

import { useEffect } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useActiveRoleStore } from '@/stores/active-role-store'

// Signs the user out the moment their session hits its cut-off (6 PM IST, or
// midnight for an after-6-PM login). The server rejects the session from then on
// regardless; this just takes the screen back to the login page on time.
export default function WorkHoursGuard() {
  const { data: session } = useSession()
  const clearActiveRole = useActiveRoleStore((s) => s.clearActiveRole)
  const endsAt = session?.user?.sessionEndsAt
  const recorded = session?.user?.recorded

  useEffect(() => {
    if (!endsAt) return
    const id = setTimeout(() => {
      clearActiveRole()
      signOut({ callbackUrl: '/login' })
    }, Math.max(0, Date.parse(endsAt) - Date.now()))
    return () => clearTimeout(id)
  }, [endsAt, clearActiveRole])

  useEffect(() => {
    if (recorded === false) {
      toast.info('Logged in after 6:00 PM — this time is not recorded. Submit it under Extra Time for approval.', {
        id: 'off-hours',
        duration: 10000,
      })
    }
  }, [recorded])

  return null
}

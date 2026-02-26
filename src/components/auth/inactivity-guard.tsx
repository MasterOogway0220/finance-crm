'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const TIMEOUT_MS = 30 * 60 * 1000  // 30 minutes
const WARN_BEFORE_MS = 5 * 60 * 1000  // warn at 25 minutes
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'] as const

function formatCountdown(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function InactivityGuard() {
  const [showWarning, setShowWarning] = useState(false)
  const [countdown, setCountdown] = useState(WARN_BEFORE_MS)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const warningShownAt = useRef<number | null>(null)

  const clearAll = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (warnTimeoutRef.current) clearTimeout(warnTimeoutRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }, [])

  const logout = useCallback(() => {
    clearAll()
    signOut({ callbackUrl: '/login' })
  }, [clearAll])

  const startCountdown = useCallback(() => {
    warningShownAt.current = Date.now()
    setCountdown(WARN_BEFORE_MS)
    setShowWarning(true)

    countdownRef.current = setInterval(() => {
      const elapsed = Date.now() - (warningShownAt.current ?? Date.now())
      const remaining = WARN_BEFORE_MS - elapsed
      if (remaining <= 0) {
        clearAll()
        logout()
      } else {
        setCountdown(remaining)
      }
    }, 500)
  }, [clearAll, logout])

  const resetTimer = useCallback(() => {
    clearAll()
    setShowWarning(false)
    setCountdown(WARN_BEFORE_MS)
    warningShownAt.current = null

    warnTimeoutRef.current = setTimeout(() => {
      startCountdown()
    }, TIMEOUT_MS - WARN_BEFORE_MS)

    timeoutRef.current = setTimeout(() => {
      logout()
    }, TIMEOUT_MS)
  }, [clearAll, startCountdown, logout])

  const handleStayLoggedIn = useCallback(() => {
    resetTimer()
  }, [resetTimer])

  // Start timers on mount; reset on activity
  useEffect(() => {
    resetTimer()

    const onActivity = () => {
      // Don't reset if the warning is already showing — user must click the button
      if (showWarning) return
      resetTimer()
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }

    return () => {
      clearAll()
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWarning])

  return (
    <Dialog open={showWarning} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-sm"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Session expiring</DialogTitle>
          <DialogDescription>
            You&apos;ve been inactive. Your session will expire in{' '}
            <span className="font-semibold text-red-600">{formatCountdown(countdown)}</span>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={logout}>
            Log out
          </Button>
          <Button onClick={handleStayLoggedIn}>
            Stay logged in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

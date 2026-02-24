'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import { Toaster } from 'sonner'
import Sidebar from '@/components/layout/sidebar'
import TopBar from '@/components/layout/topbar'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const pathname = usePathname()

  // Track desktop breakpoint (lg = 1024px)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsSidebarOpen(false)
  }, [pathname])

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev)
  const closeSidebar = () => setIsSidebarOpen(false)

  const sidebarVisible = isDesktop || isSidebarOpen

  return (
    <SessionProvider>
      <div className="flex min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>

        {/* Backdrop — mobile only */}
        {isSidebarOpen && !isDesktop && (
          <div
            className="fixed inset-0 z-20 bg-black/50"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}

        {/* Sidebar — single element, JS-driven visibility */}
        <div
          className="fixed inset-y-0 left-0 z-30 w-64 transition-transform duration-300 ease-in-out"
          style={{ transform: sidebarVisible ? 'translateX(0)' : 'translateX(-100%)' }}
        >
          <Sidebar onClose={closeSidebar} />
        </div>

        {/* Main area — lg:ml-64 offsets for the always-visible desktop sidebar */}
        <div className="flex flex-1 flex-col min-w-0 lg:ml-64">
          <TopBar onMenuClick={toggleSidebar} />
          <main className="flex-1 overflow-y-auto" style={{ backgroundColor: '#F5F5F5' }}>
            {children}
          </main>
        </div>

        <Toaster position="top-right" richColors closeButton />
      </div>
    </SessionProvider>
  )
}

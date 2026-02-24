'use client'

import { useState } from 'react'
import { SessionProvider } from 'next-auth/react'
import { Toaster } from 'sonner'
import Sidebar from '@/components/layout/sidebar'
import TopBar from '@/components/layout/topbar'

interface ProtectedLayoutProps {
  children: React.ReactNode
}

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev)
  const closeSidebar = () => setIsSidebarOpen(false)

  return (
    <SessionProvider>
      <div className="flex min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
        {/* ------------------------------------------------------------------ */}
        {/* Sidebar – desktop: always visible; mobile: overlay                  */}
        {/* ------------------------------------------------------------------ */}

        {/* Mobile overlay backdrop */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}

        {/* Sidebar wrapper */}
        <div
          className={[
            // Base positioning
            'fixed inset-y-0 left-0 z-30 transition-transform duration-200 ease-in-out',
            // Desktop: always visible
            'lg:translate-x-0',
            // Mobile: slide in/out
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          ].join(' ')}
        >
          <Sidebar onClose={closeSidebar} />
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Main content area                                                    */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex flex-1 flex-col lg:ml-64">
          {/* Top bar */}
          <TopBar onMenuClick={toggleSidebar} />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6" style={{ backgroundColor: '#F5F5F5' }}>
            {children}
          </main>
        </div>

        {/* Toast notifications */}
        <Toaster position="top-right" richColors closeButton />
      </div>
    </SessionProvider>
  )
}

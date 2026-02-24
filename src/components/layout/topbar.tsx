'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  Bell,
  Menu,
  Search,
  CheckSquare,
  IndianRupee,
  Info,
  Settings,
  LogOut,
  User,
  TrendingUp,
  Check,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn, getInitials, formatTimeAgo } from '@/lib/utils'
import { useNotificationStore } from '@/stores/notification-store'
import type { NotificationItem } from '@/types'
import CommandSearch from '@/components/layout/command-search'

// ---------------------------------------------------------------------------
// Notification icon resolver
// ---------------------------------------------------------------------------

function NotificationIcon({ type }: { type: string }) {
  const cls = 'h-4 w-4 shrink-0'
  switch (type) {
    case 'task':
      return <CheckSquare className={cn(cls, 'text-blue-500')} />
    case 'brokerage':
      return <IndianRupee className={cn(cls, 'text-green-500')} />
    default:
      return <Info className={cn(cls, 'text-gray-400')} />
  }
}

// ---------------------------------------------------------------------------
// NotificationPanel
// ---------------------------------------------------------------------------

interface NotificationPanelProps {
  notifications: NotificationItem[]
  onMarkAsRead: (id: string) => void
  onMarkAllRead: () => void
}

function NotificationPanel({ notifications, onMarkAsRead, onMarkAllRead }: NotificationPanelProps) {
  const router = useRouter()

  const handleClick = (n: NotificationItem) => {
    onMarkAsRead(n.id)
    if (n.link) {
      router.push(n.link)
    }
  }

  return (
    <div className="flex flex-col" style={{ width: 360 }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold text-gray-800">Notifications</span>
        <button
          type="button"
          onClick={onMarkAllRead}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Check className="h-3 w-3" />
          Mark all as read
        </button>
      </div>

      {/* Items */}
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
        {notifications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications</p>
        ) : (
          notifications.slice(0, 10).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleClick(n)}
              className={cn(
                'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50',
                !n.isRead && 'border-l-2 border-blue-500 bg-blue-50',
              )}
            >
              <div className="mt-0.5">
                <NotificationIcon type={n.type} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 leading-snug">{n.title}</p>
                <p className="mt-0.5 truncate text-xs text-gray-500">{n.message}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {formatTimeAgo(n.createdAt)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2.5 text-center">
        <a
          href="/notifications"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          View all notifications
        </a>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------

interface TopBarProps {
  onMenuClick: () => void
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllRead } =
    useNotificationStore()
  const [notifOpen, setNotifOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initial fetch + 30s polling
  useEffect(() => {
    fetchNotifications()
    pollRef.current = setInterval(fetchNotifications, 30_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchNotifications])

  const userName = session?.user?.name ?? 'User'
  const initials = getInitials(userName)

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4">
        {/* Left */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Toggle sidebar"
            onClick={onMenuClick}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* Brand name – visible on mobile only */}
          <span className="text-sm font-bold text-gray-800 lg:hidden">FinanceCRM</span>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <button
            type="button"
            aria-label="Open search"
            onClick={() => setSearchOpen(true)}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Notifications */}
          <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Notifications"
                className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100 transition-colors"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="p-0" style={{ width: 360 }}>
              <NotificationPanel
                notifications={notifications}
                onMarkAsRead={(id) => {
                  markAsRead(id)
                }}
                onMarkAllRead={() => {
                  markAllRead()
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="User menu"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white focus:outline-none hover:bg-blue-700 transition-colors"
              >
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium text-gray-900">{userName}</p>
                {session?.user?.email && (
                  <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-red-600 focus:text-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Global command search */}
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}

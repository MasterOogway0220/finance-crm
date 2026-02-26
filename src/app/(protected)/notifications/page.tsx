'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Check,
  CheckSquare,
  IndianRupee,
  Info,
  RefreshCw,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatTimeAgo } from '@/lib/utils'
import { useNotificationStore } from '@/stores/notification-store'
import type { NotificationItem } from '@/types'

function NotificationIcon({ type }: { type: string }) {
  const cls = 'h-5 w-5 shrink-0'
  if (type === 'TASK_ASSIGNED' || type === 'TASK_COMPLETED' || type === 'TASK_EXPIRED') {
    return <CheckSquare className={cn(cls, 'text-blue-500')} />
  }
  if (type === 'MONTHLY_RESET') {
    return <Calendar className={cn(cls, 'text-purple-500')} />
  }
  if (type.toLowerCase().includes('brokerage')) {
    return <IndianRupee className={cn(cls, 'text-green-500')} />
  }
  return <Info className={cn(cls, 'text-gray-400')} />
}

export default function NotificationsPage() {
  const router = useRouter()
  const { markAsRead, markAllRead, fetchNotifications } = useNotificationStore()

  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const fetchAll = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '100' })
    if (unreadOnly) params.set('unreadOnly', 'true')
    fetch(`/api/notifications?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setNotifications(d.data.notifications) })
      .finally(() => setLoading(false))
  }, [unreadOnly])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleClick = async (n: NotificationItem) => {
    if (!n.isRead) {
      await markAsRead(n.id)
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, isRead: true } : x))
    }
    if (n.link) router.push(n.link)
  }

  const handleMarkAllRead = async () => {
    await markAllRead()
    setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })))
    // Refresh topbar count
    fetchNotifications()
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="h-6 w-6 text-gray-700" />
            Notifications
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUnreadOnly((v) => !v)}
            className={cn('gap-1.5 text-sm', unreadOnly && 'border-blue-500 text-blue-600 bg-blue-50')}
          >
            {unreadOnly ? 'Showing unread' : 'All notifications'}
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              className="gap-1.5 text-sm"
            >
              <Check className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-4 animate-pulse">
              <div className="h-5 w-5 rounded-full bg-gray-200 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-48 bg-gray-200 rounded" />
                <div className="h-3 w-72 bg-gray-100 rounded" />
                <div className="h-2.5 w-20 bg-gray-100 rounded" />
              </div>
            </div>
          ))
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Bell className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">{unreadOnly ? 'No unread notifications' : 'No notifications yet'}</p>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleClick(n)}
              className={cn(
                'w-full flex items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50',
                !n.isRead && 'border-l-4 border-blue-500 bg-blue-50 hover:bg-blue-50/80',
              )}
            >
              <div className="mt-0.5">
                <NotificationIcon type={n.type} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('text-sm leading-snug', !n.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>
                    {n.title}
                  </p>
                  {!n.isRead && (
                    <span className="mt-0.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                  )}
                </div>
                <p className="mt-0.5 text-sm text-gray-500 leading-snug">{n.message}</p>
                <p className="mt-1.5 text-xs text-gray-400">{formatTimeAgo(n.createdAt)}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

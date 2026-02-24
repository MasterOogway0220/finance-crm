'use client'
import { create } from 'zustand'
import { NotificationItem } from '@/types'

interface NotificationStore {
  notifications: NotificationItem[]
  unreadCount: number
  isLoading: boolean
  fetchNotifications: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async () => {
    set({ isLoading: true })
    try {
      const res = await fetch('/api/notifications?limit=10')
      const data = await res.json()
      if (data.success) {
        set({
          notifications: data.data.notifications,
          unreadCount: data.data.unreadCount,
        })
      }
    } catch (err) {
      console.error('Failed to fetch notifications', err)
    } finally {
      set({ isLoading: false })
    }
  },

  markAsRead: async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
  },

  markAllRead: async () => {
    await fetch('/api/notifications/mark-all-read', { method: 'PATCH' })
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    }))
  },
}))

'use client'
import { create } from 'zustand'
import { NotificationItem } from '@/types'

interface NotificationStore {
  notifications: NotificationItem[]
  unreadCount: number
  taskAssignedCount: number
  isLoading: boolean
  fetchNotifications: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  markTaskAssignedRead: () => Promise<void>
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  taskAssignedCount: 0,
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
          taskAssignedCount: data.data.taskAssignedCount ?? 0,
        })
      }
    } catch (err) {
      console.error('Failed to fetch notifications', err)
    } finally {
      set({ isLoading: false })
    }
  },

  markAsRead: async (id: string) => {
    const target = get().notifications.find((n) => n.id === id)
    const wasUnreadTaskAssigned = target && !target.isRead && target.type === 'TASK_ASSIGNED'
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
      taskAssignedCount: wasUnreadTaskAssigned
        ? Math.max(0, state.taskAssignedCount - 1)
        : state.taskAssignedCount,
    }))
  },

  markAllRead: async () => {
    await fetch('/api/notifications/mark-all-read', { method: 'PATCH' })
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
      taskAssignedCount: 0,
    }))
  },

  markTaskAssignedRead: async () => {
    if (get().taskAssignedCount === 0) return
    await fetch('/api/notifications/mark-all-read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'TASK_ASSIGNED' }),
    })
    set((state) => {
      const cleared = state.notifications.filter(
        (n) => !n.isRead && n.type === 'TASK_ASSIGNED',
      ).length
      return {
        notifications: state.notifications.map((n) =>
          n.type === 'TASK_ASSIGNED' ? { ...n, isRead: true } : n,
        ),
        unreadCount: Math.max(0, state.unreadCount - cleared),
        taskAssignedCount: 0,
      }
    })
  },
}))

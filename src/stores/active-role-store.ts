import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface ActiveRoleState {
  activeRole: string
  userId: string
  // Call on session load — only resets role if a *confirmed* different user logs in
  initForUser: (userId: string, primaryRole: string) => void
  setActiveRole: (role: string) => void
  // Called from the login role-picker — sets both so initForUser never resets it
  setRoleForNewLogin: (userId: string, role: string) => void
}

export const useActiveRoleStore = create<ActiveRoleState>()(
  persist(
    (set, get) => ({
      activeRole: '',
      userId: '',

      initForUser: (userId, primaryRole) => {
        const state = get()
        if (!state.userId) {
          // Store not yet hydrated from sessionStorage — just record userId,
          // leave activeRole alone (will be set by rehydration or setRoleForNewLogin)
          set({ userId })
        } else if (state.userId !== userId) {
          // Confirmed different user logged in — reset to their primary role
          set({ activeRole: primaryRole, userId })
        }
        // Same user with an existing role → do nothing
      },

      setActiveRole: (role) => set({ activeRole: role }),

      // Sets both userId and role atomically so initForUser can never override it
      setRoleForNewLogin: (userId, role) => set({ activeRole: role, userId }),
    }),
    {
      name: 'finance-crm-active-role',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
        return sessionStorage
      }),
    },
  ),
)

// Dashboard path for each role
export function getDashboardForRole(role: string): string {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return '/dashboard'
    case 'EQUITY_DEALER':
      return '/equity/dashboard'
    case 'MF_DEALER':
      return '/mf/dashboard'
    case 'BACK_OFFICE':
      return '/backoffice/dashboard'
    default:
      return '/dashboard'
  }
}

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  EQUITY_DEALER: 'Equity Dealer',
  MF_DEALER: 'MF Dealer',
  BACK_OFFICE: 'Back Office',
}

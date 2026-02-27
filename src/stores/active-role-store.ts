import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface ActiveRoleState {
  activeRole: string
  userId: string
  _hydrated: boolean
  // Call on session load — resets role if a different user logs in
  initForUser: (userId: string, primaryRole: string) => void
  setActiveRole: (role: string) => void
  // Called from the login role-picker so the choice survives initForUser
  setRoleForNewLogin: (userId: string, role: string) => void
}

export const useActiveRoleStore = create<ActiveRoleState>()(
  persist(
    (set, get) => ({
      activeRole: '',
      userId: '',
      _hydrated: false,

      initForUser: (userId, primaryRole) => {
        const state = get()
        // Don't run until sessionStorage has been loaded — prevents resetting
        // the role chosen in the login picker before hydration completes
        if (!state._hydrated) return
        if (state.userId !== userId) {
          // Different user logged in — reset to their primary role
          set({ activeRole: primaryRole, userId })
        } else if (!state.activeRole) {
          set({ activeRole: primaryRole })
        }
      },

      setActiveRole: (role) => set({ activeRole: role }),

      // Sets both userId and role at once so initForUser won't reset it
      setRoleForNewLogin: (userId, role) => set({ activeRole: role, userId }),
    }),
    {
      name: 'finance-crm-active-role',
      storage: createJSONStorage(() => {
        // SSR-safe: fall back to a no-op storage on the server
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
        return sessionStorage
      }),
      // Mark hydrated after sessionStorage is loaded
      onRehydrateStorage: () => (state) => {
        if (state) state._hydrated = true
      },
      // Don't persist the internal hydration flag
      partialize: (state) => ({ activeRole: state.activeRole, userId: state.userId }),
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

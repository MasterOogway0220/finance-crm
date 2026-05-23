import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Cookie that mirrors `activeRole` so API routes (server) can read the user's
// chosen role and apply permission checks against it — not just the highest
// priority role from getEffectiveRole().
const ACTIVE_ROLE_COOKIE = 'activeRole'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

function writeActiveRoleCookie(role: string) {
  if (typeof document === 'undefined') return
  if (!role) {
    document.cookie = `${ACTIVE_ROLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`
    return
  }
  document.cookie =
    `${ACTIVE_ROLE_COOKIE}=${role}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
}

interface ActiveRoleState {
  activeRole: string
  userId: string
  hasHydrated: boolean
  // Call on session load — pre-seeds role for new users, resets on user change.
  initForUser: (userId: string, primaryRole: string) => void
  setActiveRole: (role: string) => void
  // Called from login role-picker / single-role redirect.
  setRoleForNewLogin: (userId: string, role: string) => void
  // Wipes both Zustand state and the cookie — call before signOut.
  clearActiveRole: () => void
  setHasHydrated: (state: boolean) => void
}

export const useActiveRoleStore = create<ActiveRoleState>()(
  persist(
    (set, get) => ({
      activeRole: '',
      userId: '',
      hasHydrated: false,

      initForUser: (userId, primaryRole) => {
        const state = get()
        if (!state.userId) {
          // Fresh state with no prior choice — default to primary role.
          // For dual-role users, the login picker sets the role explicitly via
          // setRoleForNewLogin BEFORE this runs, so we only land here for
          // single-role users or for the rare case where storage was cleared.
          set({ userId, activeRole: primaryRole })
          writeActiveRoleCookie(primaryRole)
        } else if (state.userId !== userId) {
          // Confirmed different user logged in — reset to their primary role.
          set({ activeRole: primaryRole, userId })
          writeActiveRoleCookie(primaryRole)
        } else if (state.activeRole) {
          // Same user with existing role — keep it, but make sure cookie matches.
          writeActiveRoleCookie(state.activeRole)
        }
      },

      setActiveRole: (role) => {
        set({ activeRole: role })
        writeActiveRoleCookie(role)
      },

      setRoleForNewLogin: (userId, role) => {
        set({ activeRole: role, userId })
        writeActiveRoleCookie(role)
      },

      clearActiveRole: () => {
        set({ activeRole: '', userId: '' })
        writeActiveRoleCookie('')
      },

      setHasHydrated: (state) => set({ hasHydrated: state }),
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
        return localStorage
      }),
      onRehydrateStorage: () => (state) => {
        // Re-sync the cookie after hydration so a new tab (which only got the
        // role from localStorage) immediately has a matching cookie for APIs.
        if (state?.activeRole) {
          writeActiveRoleCookie(state.activeRole)
        }
        state?.setHasHydrated(true)
      },
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

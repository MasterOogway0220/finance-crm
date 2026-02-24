'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  TrendingUp,
  LayoutDashboard,
  Users,
  IndianRupee,
  CheckSquare,
  ClipboardList,
  BarChart3,
  Database,
  Settings,
  ChevronDown,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavItem {
  label: string
  href?: string
  icon: React.ElementType
  children?: NavItem[]
}

// ---------------------------------------------------------------------------
// Role-based nav config
// ---------------------------------------------------------------------------

const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'All Clients', href: '/clients', icon: Users },
  { label: 'Brokerage', href: '/brokerage', icon: IndianRupee },
  { label: 'Tasks', href: '/tasks', icon: CheckSquare },
  { label: 'Assign Task', href: '/tasks/assign', icon: ClipboardList },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  {
    label: 'Masters',
    icon: Database,
    children: [
      { label: 'Employee Master', href: '/masters/employees', icon: Database },
      { label: 'Client Master', href: '/masters/clients', icon: Database },
    ],
  },
  { label: 'Settings', href: '/settings', icon: Settings },
]

const EQUITY_DEALER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/equity/dashboard', icon: LayoutDashboard },
  { label: 'My Clients', href: '/equity/clients', icon: Users },
  { label: 'My Brokerage', href: '/equity/brokerage', icon: IndianRupee },
  { label: 'My Tasks', href: '/equity/tasks', icon: CheckSquare },
  { label: 'Assign Task', href: '/tasks/assign', icon: ClipboardList },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  { label: 'Settings', href: '/settings', icon: Settings },
]

const MF_DEALER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/mf/dashboard', icon: LayoutDashboard },
  { label: 'My Clients', href: '/mf/clients', icon: Users },
  { label: 'My Tasks', href: '/mf/tasks', icon: CheckSquare },
  { label: 'Assign Task', href: '/tasks/assign', icon: ClipboardList },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  { label: 'Settings', href: '/settings', icon: Settings },
]

const BACK_OFFICE_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/backoffice/dashboard', icon: LayoutDashboard },
  { label: 'Tasks', href: '/backoffice/tasks', icon: CheckSquare },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
]

function getNavItems(role: string): NavItem[] {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return ADMIN_NAV
    case 'EQUITY_DEALER':
      return EQUITY_DEALER_NAV
    case 'MF_DEALER':
      return MF_DEALER_NAV
    case 'BACK_OFFICE':
      return BACK_OFFICE_NAV
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// NavLink – single item
// ---------------------------------------------------------------------------

interface NavLinkProps {
  item: NavItem
  pathname: string
  depth?: number
}

function NavLink({ item, pathname, depth = 0 }: NavLinkProps) {
  const isActive = item.href ? pathname === item.href || pathname.startsWith(item.href + '/') : false
  const Icon = item.icon

  if (!item.href) return null

  return (
    <Link
      href={item.href}
      className={cn(
        'relative flex items-center gap-3 py-2.5 text-sm transition-colors',
        depth === 0 ? 'px-4' : 'px-4 pl-8',
        isActive
          ? 'bg-slate-800 text-white'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white',
      )}
    >
      {/* Active left indicator bar */}
      {isActive && (
        <span className="absolute left-0 top-0 h-full w-1 rounded-r bg-blue-500" />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// ExpandableNavItem – Masters group
// ---------------------------------------------------------------------------

interface ExpandableNavItemProps {
  item: NavItem
  pathname: string
}

function ExpandableNavItem({ item, pathname }: ExpandableNavItemProps) {
  const hasActiveChild = item.children?.some(
    (child) => child.href && (pathname === child.href || pathname.startsWith(child.href + '/')),
  )
  const [open, setOpen] = useState(hasActiveChild ?? false)
  const Icon = item.icon

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'relative flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors',
          hasActiveChild
            ? 'bg-slate-800 text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white',
        )}
      >
        {hasActiveChild && (
          <span className="absolute left-0 top-0 h-full w-1 rounded-r bg-blue-500" />
        )}
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
      </button>

      {open && item.children && (
        <div className="py-0.5">
          {item.children.map((child) => (
            <NavLink key={child.label} item={child} pathname={pathname} depth={1} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export default function Sidebar() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const role = session?.user?.role ?? ''
  const navItems = getNavItems(role)

  const userName = session?.user?.name ?? 'User'
  const designation = session?.user?.designation ?? ''
  const initials = getInitials(userName)

  return (
    <aside
      className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col"
      style={{ backgroundColor: '#0f172a' }}
    >
      {/* Logo area */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-blue-400 shrink-0" />
          <div>
            <p className="text-xl font-bold leading-none text-white">FinanceCRM</p>
            <p className="mt-0.5 text-xs text-slate-400">Financial CRM</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-slate-700" />

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) =>
          item.children ? (
            <ExpandableNavItem key={item.label} item={item} pathname={pathname} />
          ) : (
            <NavLink key={item.label} item={item} pathname={pathname} />
          ),
        )}
      </nav>

      {/* User section */}
      <div className="border-t border-slate-700 p-4">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
            {initials}
          </div>
          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            {designation && (
              <p className="truncate text-xs text-slate-400">{designation}</p>
            )}
          </div>
          {/* Sign out */}
          <button
            type="button"
            title="Sign out"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

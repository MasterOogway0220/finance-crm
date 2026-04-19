'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  LayoutDashboard,
  Users,
  IndianRupee,
  CheckSquare,
  BarChart3,
  Database,
  FolderOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  LogOut,
  Headset,
  ClipboardList,
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { useActiveRoleStore } from '@/stores/active-role-store'
import { useNotificationStore } from '@/stores/notification-store'

type NavBadge = 'taskAssigned'

interface NavItem {
  label: string
  href?: string
  icon: React.ElementType
  children?: NavItem[]
  badge?: NavBadge
}

const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
{ label: 'Brokerage', href: '/brokerage', icon: IndianRupee },
  { label: 'Tasks', href: '/tasks', icon: CheckSquare, badge: 'taskAssigned' },
  { label: 'Document Pool', href: '/documents', icon: FolderOpen },
  { label: 'Calendar & Leave', href: '/calendar', icon: CalendarDays },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  { label: 'Login/Logoff History', href: '/login-history', icon: ClipboardList },
  {
    label: 'Masters',
    icon: Database,
    children: [
      { label: 'Employee Master', href: '/masters/employees', icon: Database },
      { label: 'Equity Client Master', href: '/masters/clients', icon: Database },
      { label: 'MF Client Master', href: '/masters/clients/mf', icon: Database },
      { label: 'Closed Account Master', href: '/masters/clients/closed', icon: Database },
    ],
  },
]

const EQUITY_DEALER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/equity/dashboard', icon: LayoutDashboard },
  { label: 'My Clients', href: '/equity/clients', icon: Users },
  { label: 'My Brokerage', href: '/equity/brokerage', icon: IndianRupee },
  { label: 'Mutual Fund Log', href: '/equity/mf-log', icon: IndianRupee },
  {
    label: 'Tasks',
    icon: CheckSquare,
    badge: 'taskAssigned',
    children: [
      { label: 'Assign Task', href: '/tasks/assign', icon: CheckSquare },
      { label: 'My Tasks', href: '/equity/tasks', icon: CheckSquare, badge: 'taskAssigned' },
    ],
  },
  { label: 'Document Pool', href: '/documents', icon: FolderOpen },
  { label: 'Calendar & Leave', href: '/calendar', icon: CalendarDays },
  { label: 'Annual Report', href: '/reports/brokerage', icon: BarChart3 },
]

const MF_DEALER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/mf/dashboard', icon: LayoutDashboard },
  { label: 'My Clients', href: '/mf/clients', icon: Users },
  {
    label: 'Business',
    icon: IndianRupee,
    children: [
      { label: 'Record Business', href: '/mf/business/record', icon: IndianRupee },
      { label: 'Business Log', href: '/mf/business/log', icon: IndianRupee },
    ],
  },
  {
    label: 'Service',
    icon: Headset,
    children: [
      { label: 'Record Service', href: '/mf/service/record', icon: Headset },
      { label: 'Service Log', href: '/mf/service/log', icon: Headset },
    ],
  },
  {
    label: 'Tasks',
    icon: CheckSquare,
    badge: 'taskAssigned',
    children: [
      { label: 'Assign Task', href: '/tasks/assign', icon: CheckSquare },
      { label: 'My Tasks', href: '/mf/tasks', icon: CheckSquare, badge: 'taskAssigned' },
    ],
  },
  { label: 'Document Pool', href: '/documents', icon: FolderOpen },
  { label: 'Calendar & Leave', href: '/calendar', icon: CalendarDays },
]

const BACK_OFFICE_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/backoffice/dashboard', icon: LayoutDashboard },
  { label: 'Tasks', href: '/backoffice/tasks', icon: CheckSquare, badge: 'taskAssigned' },
  { label: 'Document Pool', href: '/documents', icon: FolderOpen },
  { label: 'Calendar & Leave', href: '/calendar', icon: CalendarDays },
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

function NavBadgeDot({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white shadow-sm"
      aria-label={`${count} unread`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function useBadgeCount(badge: NavBadge | undefined): number {
  const taskAssignedCount = useNotificationStore((s) => s.taskAssignedCount)
  if (badge === 'taskAssigned') return taskAssignedCount
  return 0
}

interface NavLinkProps {
  item: NavItem
  pathname: string
  depth?: number
  onClose?: () => void
}

function NavLink({ item, pathname, depth = 0, onClose }: NavLinkProps) {
  const isActive = item.href ? pathname === item.href || pathname.startsWith(item.href + '/') : false
  const Icon = item.icon
  const badgeCount = useBadgeCount(item.badge)

  if (!item.href) return null

  return (
    <Link
      href={item.href}
      onClick={onClose}
      className={cn(
        'relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-all duration-200',
        depth === 0 ? 'px-3' : 'px-3 pl-9',
        isActive
          ? 'bg-blue-600/15 text-blue-400'
          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-blue-500" />
      )}
      <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-blue-400')} />
      <span className="flex-1">{item.label}</span>
      <NavBadgeDot count={badgeCount} />
    </Link>
  )
}

interface ExpandableNavItemProps {
  item: NavItem
  pathname: string
  onClose?: () => void
}

function ExpandableNavItem({ item, pathname, onClose }: ExpandableNavItemProps) {
  const hasActiveChild = item.children?.some(
    (child) => child.href && (pathname === child.href || pathname.startsWith(child.href + '/')),
  )
  const [open, setOpen] = useState(hasActiveChild ?? false)
  const Icon = item.icon
  const badgeCount = useBadgeCount(item.badge)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
          hasActiveChild
            ? 'bg-blue-600/15 text-blue-400'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
        )}
      >
        {hasActiveChild && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-blue-500" />
        )}
        <Icon className={cn('h-[18px] w-[18px] shrink-0', hasActiveChild && 'text-blue-400')} />
        <span className="flex-1 text-left">{item.label}</span>
        {!open && <NavBadgeDot count={badgeCount} />}
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200" />
        )}
      </button>

      {open && item.children && (
        <div className="py-0.5">
          {item.children.map((child) => (
            <NavLink key={child.label} item={child} pathname={pathname} depth={1} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  onClose?: () => void
}

const MY_TASKS_PATHS = new Set([
  '/tasks',
  '/backoffice/tasks',
  '/equity/tasks',
  '/mf/tasks',
])

export default function Sidebar({ onClose }: SidebarProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const { activeRole, initForUser } = useActiveRoleStore()
  const markTaskAssignedRead = useNotificationStore((s) => s.markTaskAssignedRead)

  // Initialise the store whenever session loads
  useEffect(() => {
    if (session?.user?.id && session.user.role) {
      initForUser(session.user.id, session.user.role)
    }
  }, [session?.user?.id, session?.user?.role, initForUser])

  // Clear the red "new task assigned" badge when the user visits their tasks page
  useEffect(() => {
    if (MY_TASKS_PATHS.has(pathname)) {
      markTaskAssignedRead()
    }
  }, [pathname, markTaskAssignedRead])

  const effectiveRole = activeRole || session?.user?.role || ''
  const navItems = getNavItems(effectiveRole)

  const userName = session?.user?.name ?? 'User'
  const designation = session?.user?.designation ?? ''
  const initials = getInitials(userName)

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="Kesar Securities" className="h-9 w-9 object-contain" />
        </div>
        <div>
          <p className="text-lg font-bold leading-none text-white" style={{ fontFamily: 'var(--font-lexend), sans-serif' }}>Kesar Securities CRM</p>
          <p className="mt-0.5 text-[11px] text-slate-400 tracking-wide uppercase">Brokerage Platform</p>
        </div>
      </div>

      <div className="mx-4 h-px bg-slate-700/60" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) =>
          item.children ? (
            <ExpandableNavItem key={item.label} item={item} pathname={pathname} onClose={onClose} />
          ) : (
            <NavLink key={item.label} item={item} pathname={pathname} onClose={onClose} />
          ),
        )}
      </nav>

      {/* User section */}
      <div className="border-t border-slate-700/60 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-semibold text-white shadow-sm">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            {designation && (
              <p className="truncate text-xs text-slate-400">{designation}</p>
            )}
          </div>
          <button
            type="button"
            title="Sign out"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

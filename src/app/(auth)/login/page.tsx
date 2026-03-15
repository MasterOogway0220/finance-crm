'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  TrendingUp,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  BarChart3,
  Briefcase,
  LineChart,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { getDashboardForRole, ROLE_LABELS } from '@/stores/active-role-store'
import { useActiveRoleStore } from '@/stores/active-role-store'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type LoginFormValues = z.infer<typeof loginSchema>

interface PendingSession {
  userId: string
  name: string
  primaryRole: string
  secondaryRole: string
}

const ROLE_ICONS: Record<string, React.ElementType> = {
  SUPER_ADMIN: ShieldCheck,
  ADMIN: ShieldCheck,
  EQUITY_DEALER: TrendingUp,
  MF_DEALER: LineChart,
  BACK_OFFICE: Briefcase,
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  SUPER_ADMIN: 'Full system access, all departments',
  ADMIN: 'Manage clients, brokerage & team',
  EQUITY_DEALER: 'Equity clients & brokerage',
  MF_DEALER: 'Mutual fund clients',
  BACK_OFFICE: 'Tasks & operational work',
}

const ROLE_COLORS: Record<string, { bg: string; border: string; icon: string; badge: string }> = {
  SUPER_ADMIN: { bg: 'bg-purple-50', border: 'border-purple-300', icon: 'text-purple-600', badge: 'bg-purple-100 text-purple-700' },
  ADMIN:       { bg: 'bg-blue-50',   border: 'border-blue-300',   icon: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700'   },
  EQUITY_DEALER: { bg: 'bg-emerald-50', border: 'border-emerald-300', icon: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  MF_DEALER:   { bg: 'bg-orange-50', border: 'border-orange-300', icon: 'text-orange-600', badge: 'bg-orange-100 text-orange-700' },
  BACK_OFFICE: { bg: 'bg-slate-50',  border: 'border-slate-300',  icon: 'text-slate-600',  badge: 'bg-slate-100 text-slate-700'  },
}

// ---------------------------------------------------------------------------
// Role Picker
// ---------------------------------------------------------------------------

function RolePicker({ pending, onPick }: { pending: PendingSession; onPick: (role: string) => void }) {
  const [hoveredRole, setHoveredRole] = useState<string | null>(null)
  const roles = [pending.primaryRole, pending.secondaryRole]

  return (
    <div className="w-full min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 mb-3">
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-lexend), sans-serif' }}>FinanceCRM</span>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-7">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 mb-3">
              <span className="text-xl font-bold text-blue-700">
                {pending.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Welcome back, {pending.name.split(' ')[0]}!</h1>
            <p className="mt-1.5 text-sm text-gray-500">
              You have access to multiple profiles. Choose which one to enter.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {roles.map((role) => {
              const Icon = ROLE_ICONS[role] ?? BarChart3
              const colors = ROLE_COLORS[role] ?? ROLE_COLORS.ADMIN
              const isHovered = hoveredRole === role

              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => onPick(role)}
                  onMouseEnter={() => setHoveredRole(role)}
                  onMouseLeave={() => setHoveredRole(null)}
                  className={cn(
                    'relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-left transition-all duration-150',
                    colors.bg,
                    isHovered ? colors.border : 'border-transparent',
                    isHovered ? 'shadow-lg scale-[1.02]' : 'shadow-sm',
                    'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
                  )}
                >
                  <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', colors.bg, 'border', colors.border)}>
                    <Icon className={cn('h-6 w-6', colors.icon)} />
                  </div>

                  <div className="w-full text-center">
                    <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold mb-1', colors.badge)}>
                      {ROLE_LABELS[role] ?? role}
                    </span>
                    <p className="text-xs text-gray-500 leading-snug">{ROLE_DESCRIPTIONS[role] ?? ''}</p>
                  </div>

                  <div className={cn(
                    'absolute bottom-3 right-3 transition-opacity',
                    isHovered ? 'opacity-100' : 'opacity-0'
                  )}>
                    <ArrowRight className={cn('h-4 w-4', colors.icon)} />
                  </div>
                </button>
              )
            })}
          </div>

          <p className="mt-5 text-center text-xs text-gray-400">
            You can switch between profiles anytime from the profile menu.
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Login Form
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const router = useRouter()
  const { setRoleForNewLogin } = useActiveRoleStore()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null)
    try {
      const result = await signIn('credentials', {
        email: values.email,
        password: values.password,
        redirect: false,
      })

      if (result?.error) {
        setServerError(`Login failed (${result.error}). Check credentials or contact support.`)
        return
      }

      const sessionRes = await fetch('/api/auth/session')
      const session = await sessionRes.json()
      const primaryRole: string = session?.user?.role ?? ''
      const secondaryRole: string = session?.user?.secondaryRole ?? ''

      if (secondaryRole) {
        // Dual-role user — show picker
        setPendingSession({
          userId: session.user.id,
          name: session.user.name ?? 'User',
          primaryRole,
          secondaryRole,
        })
      } else {
        // Single role — redirect immediately
        setRoleForNewLogin(session.user.id, primaryRole)
        window.location.href = getDashboardForRole(primaryRole)
      }
    } catch {
      setServerError('Something went wrong. Please try again.')
    }
  }

  const handleRolePick = (role: string) => {
    if (!pendingSession) return
    setRoleForNewLogin(pendingSession.userId, role)
    window.location.href = getDashboardForRole(role)
  }

  // Show role picker if dual-role user just authenticated
  if (pendingSession) {
    return <RolePicker pending={pendingSession} onPick={handleRolePick} />
  }

  return (
    <div className="w-full min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-10">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 mb-4">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-lexend), sans-serif' }}>FinanceCRM</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
          </div>

          {/* Error Alert */}
          {serverError && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <div className="form-group">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
            </div>

            <div className="form-group">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a href="/forgot-password" className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="pr-10"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-500">
          Financial Brokerage CRM Platform
        </p>
      </div>
    </div>
  )
}

'use client'
import { Card, CardContent } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  accent?: 'blue' | 'indigo' | 'green' | 'emerald' | 'amber' | 'red'
  trend?: { value: string; positive: boolean }
  onClick?: () => void
  actionLabel?: string
  onAction?: () => void
}

const accentStyles = {
  blue:    { icon: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/50',    border: 'border-l-blue-500' },
  indigo:  { icon: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/50', border: 'border-l-indigo-500' },
  green:   { icon: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50',   border: 'border-l-emerald-500' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50', border: 'border-l-emerald-500' },
  amber:   { icon: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/50',   border: 'border-l-amber-500' },
  red:     { icon: 'bg-red-50 text-red-600 ring-1 ring-red-200/50',       border: 'border-l-red-500' },
}

export function KpiCard({ title, value, subtitle, icon: Icon, accent = 'blue', trend, actionLabel, onAction }: KpiCardProps) {
  const styles = accentStyles[accent]

  return (
    <Card className={cn('border-l-4 transition-all duration-200 hover:shadow-md', styles.border)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            <p className="mt-2 stat-value text-foreground">{value}</p>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground truncate">{subtitle}</p>
            )}
            {trend && (
              <p className={cn('mt-1.5 text-xs font-semibold flex items-center gap-1', trend.positive ? 'text-emerald-600' : 'text-red-600')}>
                <span>{trend.positive ? '▲' : '▼'}</span>
                {trend.value}
              </p>
            )}
          </div>
          <div className={cn('flex-shrink-0 p-2.5 rounded-xl', styles.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {actionLabel && onAction && (
          <div className="mt-3 pt-3 border-t border-border flex justify-end">
            <button
              onClick={onAction}
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer"
            >
              {actionLabel} →
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

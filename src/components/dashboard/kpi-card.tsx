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
  blue:    { icon: 'bg-blue-100 text-blue-600',    border: 'border-l-blue-500' },
  indigo:  { icon: 'bg-indigo-100 text-indigo-600', border: 'border-l-indigo-500' },
  green:   { icon: 'bg-green-100 text-green-600',   border: 'border-l-green-500' },
  emerald: { icon: 'bg-emerald-100 text-emerald-600', border: 'border-l-emerald-500' },
  amber:   { icon: 'bg-amber-100 text-amber-600',   border: 'border-l-amber-500' },
  red:     { icon: 'bg-red-100 text-red-600',       border: 'border-l-red-500' },
}

export function KpiCard({ title, value, subtitle, icon: Icon, accent = 'blue', trend, actionLabel, onAction }: KpiCardProps) {
  const styles = accentStyles[accent]

  return (
    <Card className={cn('border-l-4 hover:shadow-md transition-shadow', styles.border)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
            {subtitle && (
              <p className="mt-1 text-sm text-gray-500 truncate">{subtitle}</p>
            )}
            {trend && (
              <p className={cn('mt-1 text-xs font-medium flex items-center gap-1', trend.positive ? 'text-green-600' : 'text-red-600')}>
                <span>{trend.positive ? '▲' : '▼'}</span>
                {trend.value}
              </p>
            )}
          </div>
          <div className={cn('flex-shrink-0 p-2.5 rounded-lg', styles.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {actionLabel && onAction && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={onAction}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              {actionLabel} →
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

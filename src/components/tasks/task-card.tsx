'use client'
import { TaskWithRelations, TaskStatus, TaskPriority } from '@/types'
import { formatDate, getDaysRemaining } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface TaskCardProps {
  task: TaskWithRelations
  onClick: (task: TaskWithRelations) => void
}

const statusConfig: Record<TaskStatus, { color: string; bar: string; badge: string }> = {
  PENDING:   { color: 'text-amber-600',  bar: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-800' },
  COMPLETED: { color: 'text-green-600',  bar: 'bg-green-500',  badge: 'bg-green-100 text-green-800' },
  EXPIRED:   { color: 'text-red-600',    bar: 'bg-red-500',    badge: 'bg-red-100 text-red-800' },
}

const priorityConfig: Record<TaskPriority, { label: string; color: string }> = {
  HIGH:   { label: 'High',   color: 'bg-red-100 text-red-700' },
  MEDIUM: { label: 'Medium', color: 'bg-yellow-100 text-yellow-700' },
  LOW:    { label: 'Low',    color: 'bg-green-100 text-green-700' },
}

function DaysIndicator({ deadline, status }: { deadline: Date; status: TaskStatus }) {
  if (status === 'COMPLETED') return <span className="text-xs text-green-600 font-medium">Completed</span>
  const days = getDaysRemaining(deadline)
  if (days < 0) return <span className="text-xs text-red-600 font-medium">Expired {Math.abs(days)}d ago</span>
  if (days === 0) return <span className="text-xs text-orange-500 font-medium">Due today</span>
  if (days <= 3) return <span className="text-xs text-orange-400 font-medium">{days}d left</span>
  return <span className="text-xs text-green-600 font-medium">{days} days left</span>
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const config = statusConfig[task.status]
  const priority = priorityConfig[task.priority]

  return (
    <div
      onClick={() => onClick(task)}
      className="flex items-stretch bg-white border border-gray-200 rounded-lg hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
    >
      {/* Left accent bar */}
      <div className={cn('w-1 rounded-l-lg flex-shrink-0', config.bar)} />

      {/* Content */}
      <div className="flex-1 px-4 py-3 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800 text-sm truncate">{task.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</p>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1">
            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full capitalize', config.badge)}>
              {task.status}
            </span>
            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', priority.color)}>
              {priority.label}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>
            By <strong className="text-gray-700">{task.assignedBy.name}</strong>
            {' · '}
            {task.assignedBy.department.replace('_', ' ')}
            {' · '}
            Due: {formatDate(task.deadline)}
          </span>
          <DaysIndicator deadline={new Date(task.deadline)} status={task.status} />
        </div>
      </div>
    </div>
  )
}

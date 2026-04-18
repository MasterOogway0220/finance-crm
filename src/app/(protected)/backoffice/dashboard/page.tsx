'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Clock, CheckCircle, ClipboardList, AlertTriangle } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import { TaskWithRelations } from '@/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatDateLong, getDaysRemaining, getInitials } from '@/lib/utils'
import { useActiveRoleStore, getDashboardForRole } from '@/stores/active-role-store'

const STATUS_CLASS: Record<string, string> = {
  PENDING:   'dash-pill dash-pill--warning',
  COMPLETED: 'dash-pill dash-pill--success',
  EXPIRED:   'dash-pill dash-pill--danger',
}

const PRIORITY_CLASS: Record<string, string> = {
  HIGH:   'dash-pill dash-pill--danger',
  MEDIUM: 'dash-pill dash-pill--warning',
  LOW:    'dash-pill dash-pill--success',
}

const DEPT_CLASS: Record<string, string> = {
  EQUITY:      'dash-pill dash-pill--primary-soft',
  MUTUAL_FUND: 'dash-pill dash-pill--success',
  BACK_OFFICE: 'dash-pill dash-pill--muted',
  ADMIN:       'dash-pill dash-pill--warning',
}

function DeadlineInfo({ deadline, status }: { deadline: Date; status: string }) {
  if (status === 'COMPLETED') return <span className="text-xs text-green-600 font-medium">Completed</span>
  const days = getDaysRemaining(deadline)
  if (days < 0)  return <span className="text-xs text-red-600 font-medium">Expired {Math.abs(days)}d ago</span>
  if (days === 0) return <span className="text-xs text-orange-500 font-medium">Due today</span>
  if (days <= 3) return <span className="text-xs text-orange-400 font-medium">{days}d left</span>
  return <span className="text-xs text-gray-400">{days} days left</span>
}

interface BackofficeDashData {
  pendingTasks: number
  completedTasksThisMonth: number
  expiredTasks: number
  filteredTasks: TaskWithRelations[]
}

export default function BackofficeDashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [data, setData] = useState<BackofficeDashData | null>(null)
  const [filter, setFilter] = useState('week')
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null)
  const today = new Date()
  const { activeRole } = useActiveRoleStore()

  // If the user's active role doesn't belong on this dashboard, send them to the right one
  useEffect(() => {
    if (!activeRole) return
    const target = getDashboardForRole(activeRole)
    if (target !== '/backoffice/dashboard') {
      window.location.replace(target)
    }
  }, [activeRole])

  const fetchData = (f: string) => {
    setLoading(true)
    fetch(`/api/dashboard/backoffice?filter=${f}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData(filter) }, [filter])

  const handleTaskCompleted = () => fetchData(filter)

  return (
    <div className="dash-scope page-container space-y-6">
      <nav aria-label="Breadcrumb" className="dash-breadcrumb">
        <a href="/backoffice/dashboard">Home</a>
        <span className="dash-breadcrumb__sep">›</span>
        <span className="dash-breadcrumb__current">Back Office Dashboard</span>
      </nav>

      {/* Welcome */}
      <div className="flex items-start justify-between">
        <div>
          <h1>Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--dash-muted, #6b7280)' }}>
            Back Office
          </p>
        </div>
        <p
          className="text-sm hidden md:block"
          style={{ color: 'var(--dash-muted, #6b7280)' }}
        >
          {formatDateLong(today)}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
          </div>
          <Skeleton className="h-48 rounded-lg" />
        </div>
      ) : data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              title="Tasks Pending"
              value={data.pendingTasks}
              subtitle="Awaiting completion"
              icon={Clock}
              accent="amber"
              actionLabel="View"
              onAction={() => router.push('/backoffice/tasks?tab=pending')}
            />
            <KpiCard
              title="Tasks Completed"
              value={data.completedTasksThisMonth}
              subtitle="This month"
              icon={CheckCircle}
              accent="green"
              actionLabel="View"
              onAction={() => router.push('/backoffice/tasks?tab=completed')}
            />
            <KpiCard
              title="Tasks Expired"
              value={data.expiredTasks}
              subtitle="Missed deadline"
              icon={AlertTriangle}
              accent="red"
              actionLabel="View"
              onAction={() => router.push('/backoffice/tasks?tab=expired')}
            />
          </div>

          {/* Tasks Table */}
          <div>
            <div className="dash-controls-row flex items-center justify-between mb-3">
              <h2 className="dash-section-title">Pending Tasks</h2>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Due Today</SelectItem>
                  <SelectItem value="tomorrow">Due Tomorrow</SelectItem>
                  <SelectItem value="week">Due This Week</SelectItem>
                  <SelectItem value="month">Due This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div
              className="overflow-x-auto"
              style={{ borderRadius: 10, border: '1px solid var(--dash-border, #e7eaf0)' }}
            >
              <table className="dash-table" style={{ minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ width: 256 }}>Task</th>
                    <th style={{ width: 144, whiteSpace: 'nowrap' }}>Assigned To</th>
                    <th style={{ width: 144, whiteSpace: 'nowrap' }}>Assigned By</th>
                    <th style={{ width: 128 }}>Department</th>
                    <th style={{ width: 96 }}>Priority</th>
                    <th style={{ width: 96 }}>Status</th>
                    <th style={{ width: 128 }}>Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {data.filteredTasks.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ padding: '56px 16px', textAlign: 'center' }}
                      >
                        <ClipboardList
                          className="h-10 w-10 mx-auto mb-2"
                          style={{ color: 'var(--dash-border, #e7eaf0)' }}
                        />
                        <p
                          className="text-sm"
                          style={{ color: 'var(--dash-muted, #9ca3af)' }}
                        >
                          No pending tasks for this period
                        </p>
                      </td>
                    </tr>
                  ) : data.filteredTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedTask(task)}
                    >
                      <td>
                        <p
                          className="font-medium truncate max-w-60"
                          style={{ color: 'var(--dash-ink, #0b0b0f)' }}
                        >
                          {task.title}
                        </p>
                        <p
                          className="text-xs truncate max-w-60 mt-0.5"
                          style={{ color: 'var(--dash-muted, #9ca3af)' }}
                        >
                          {task.description}
                        </p>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-medium flex-shrink-0"
                            style={{ background: 'var(--dash-primary, #4e6cad)' }}
                          >
                            {getInitials(task.assignedTo.name)}
                          </div>
                          <span
                            className="font-medium whitespace-nowrap"
                            style={{ color: 'var(--dash-ink, #0b0b0f)' }}
                          >
                            {task.assignedTo.name}
                          </span>
                        </div>
                      </td>
                      <td
                        className="text-xs whitespace-nowrap"
                        style={{ color: 'var(--dash-muted, #4b5563)' }}
                      >
                        {task.assignedBy.name}
                      </td>
                      <td>
                        <span className={DEPT_CLASS[task.assignedTo.department] ?? 'dash-pill dash-pill--muted'}>
                          {task.assignedTo.department.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={PRIORITY_CLASS[task.priority]}>
                          {task.priority}
                        </span>
                      </td>
                      <td>
                        <span className={STATUS_CLASS[task.status]}>
                          {task.status}
                        </span>
                      </td>
                      <td>
                        <p
                          className="text-xs whitespace-nowrap"
                          style={{ color: 'var(--dash-text, #4b5563)' }}
                        >
                          {formatDate(task.deadline)}
                        </p>
                        <DeadlineInfo deadline={new Date(task.deadline)} status={task.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => router.push('/backoffice/tasks')}
              className="mt-3 text-sm hover:underline font-medium"
              style={{ color: 'var(--dash-primary, #4e6cad)' }}
            >
              View All Tasks →
            </button>
          </div>
        </>
      )}

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onTaskCompleted={handleTaskCompleted}
        canComplete={true}
      />
    </div>
  )
}

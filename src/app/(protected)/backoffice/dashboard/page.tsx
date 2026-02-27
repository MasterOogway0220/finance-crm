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

const STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  EXPIRED:   'bg-red-100 text-red-700',
}

const PRIORITY_COLORS: Record<string, string> = {
  HIGH:   'bg-red-100 text-red-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW:    'bg-green-100 text-green-700',
}

const DEPT_COLORS: Record<string, string> = {
  EQUITY:      'bg-blue-100 text-blue-700',
  MUTUAL_FUND: 'bg-green-100 text-green-700',
  BACK_OFFICE: 'bg-purple-100 text-purple-700',
  ADMIN:       'bg-orange-100 text-orange-700',
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
    <div className="p-6 space-y-6">
      {/* Welcome */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Back Office</p>
        </div>
        <p className="text-sm text-gray-500 hidden md:block">{formatDateLong(today)}</p>
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
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Pending Tasks</h2>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40 h-8 text-sm">
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

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-64">Task</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-36 whitespace-nowrap">Assigned To</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-36 whitespace-nowrap">Assigned By</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-32">Department</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-24">Priority</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-24">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide w-32">Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {data.filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-14 text-center">
                        <ClipboardList className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm text-gray-400">No pending tasks for this period</p>
                      </td>
                    </tr>
                  ) : data.filteredTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedTask(task)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 truncate max-w-60">{task.title}</p>
                        <p className="text-xs text-gray-400 truncate max-w-60 mt-0.5">{task.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
                            {getInitials(task.assignedTo.name)}
                          </div>
                          <span className="font-medium text-gray-800 whitespace-nowrap">{task.assignedTo.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{task.assignedBy.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${DEPT_COLORS[task.assignedTo.department] ?? 'bg-gray-100 text-gray-600'}`}>
                          {task.assignedTo.department.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority]}`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status]}`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-600 whitespace-nowrap">{formatDate(task.deadline)}</p>
                        <DeadlineInfo deadline={new Date(task.deadline)} status={task.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => router.push('/backoffice/tasks')}
              className="mt-3 text-sm text-blue-600 hover:underline font-medium"
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

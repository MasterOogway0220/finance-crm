'use client'
import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import { TaskWithRelations } from '@/types'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ClipboardList } from 'lucide-react'
import { formatDate, getDaysRemaining, getInitials } from '@/lib/utils'

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

const DEPARTMENTS = [
  { value: 'all', label: 'All Departments' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'MUTUAL_FUND', label: 'Mutual Fund' },
]

function DeadlineInfo({ deadline, status }: { deadline: Date; status: string }) {
  if (status === 'COMPLETED') return <span className="text-xs text-green-600 font-medium">Completed</span>
  const days = getDaysRemaining(deadline)
  if (days < 0)  return <span className="text-xs text-red-600 font-medium">Expired {Math.abs(days)}d ago</span>
  if (days === 0) return <span className="text-xs text-orange-500 font-medium">Due today</span>
  if (days <= 3) return <span className="text-xs text-orange-400 font-medium">{days}d left</span>
  return <span className="text-xs text-gray-400">{days} days left</span>
}

function BackofficeTasksContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab') || 'pending'
  const [tab, setTab] = useState<'pending' | 'completed'>(tabParam as 'pending' | 'completed')
  const [dept, setDept] = useState('all')
  const [priority, setPriority] = useState('all')
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null)

  const fetchTasks = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('status', tab.toUpperCase())
    if (dept !== 'all') params.set('department', dept)
    if (priority !== 'all') params.set('priority', priority)
    fetch(`/api/tasks?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setTasks(d.data.tasks || []) })
      .finally(() => setLoading(false))
  }, [tab, dept, priority])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const handleTabChange = (value: string) => {
    setTab(value as 'pending' | 'completed')
    router.replace(`/backoffice/tasks?tab=${value}`, { scroll: false })
  }

  const handleTaskCompleted = () => { setSelectedTask(null); fetchTasks() }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
        <p className="text-sm text-gray-500">Tasks assigned to you</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Task', 'Assigned To', 'Assigned By', 'Department', 'Priority', 'Status', 'Deadline'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
              ))
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <ClipboardList className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-400">No {tab} tasks</p>
                  <p className="text-xs text-gray-300 mt-1">Tasks assigned to you will appear here</p>
                </td>
              </tr>
            ) : tasks.map((task) => (
              <tr
                key={task.id}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedTask(task)}
              >
                <td className="px-4 py-3 max-w-56">
                  <p className="font-medium text-gray-800 truncate">{task.title}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{task.description}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
                      {getInitials(task.assignedTo.name)}
                    </div>
                    <span className="font-medium text-gray-800">{task.assignedTo.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{task.assignedBy.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${DEPT_COLORS[task.assignedTo.department] ?? 'bg-gray-100 text-gray-600'}`}>
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
                  <p className="text-xs text-gray-600">{formatDate(task.deadline)}</p>
                  <DeadlineInfo deadline={new Date(task.deadline)} status={task.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onTaskCompleted={handleTaskCompleted}
        canComplete={tab === 'pending'}
      />
    </div>
  )
}

export default function BackofficeTasksPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400 text-sm">Loading...</div>}>
      <BackofficeTasksContent />
    </Suspense>
  )
}

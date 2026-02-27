'use client'
import { useState, useEffect, useCallback } from 'react'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import { TaskWithRelations } from '@/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, X, ClipboardList } from 'lucide-react'
import { formatDate, getDaysRemaining, getInitials } from '@/lib/utils'
import Link from 'next/link'

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

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [priority, setPriority] = useState('all')
  const [dept, setDept] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null)

  const fetchTasks = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (status !== 'all') params.set('status', status)
    if (priority !== 'all') params.set('priority', priority)
    if (dept !== 'all') params.set('department', dept)
    if (search) params.set('search', search)
    fetch(`/api/tasks?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setTasks(d.data.tasks || []) })
      .finally(() => setLoading(false))
  }, [status, priority, dept, search])

  useEffect(() => {
    const timer = setTimeout(fetchTasks, 300)
    return () => clearTimeout(timer)
  }, [fetchTasks])

  const hasFilters = status !== 'all' || priority !== 'all' || dept !== 'all' || search !== ''

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Tasks</h1>
          <p className="text-sm text-gray-500">Manage and monitor all tasks across departments</p>
        </div>
        <Link href="/tasks/assign">
          <Button className="gap-2">
            <ClipboardList className="h-4 w-4" />Assign Task
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title…" className="pl-9 h-9 text-sm" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
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
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="EQUITY">Equity</SelectItem>
              <SelectItem value="MUTUAL_FUND">Mutual Fund</SelectItem>
              <SelectItem value="BACK_OFFICE">Back Office</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus('all'); setPriority('all'); setDept('all') }} className="h-9 gap-1.5 text-gray-500 hover:text-gray-800">
              <X className="h-3.5 w-3.5" />Clear
            </Button>
          )}
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
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">No tasks found{hasFilters ? ' for the selected filters' : ''}</td></tr>
            ) : tasks.map((task) => (
              <tr
                key={task.id}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedTask(task)}
              >
                {/* Task title + description */}
                <td className="px-4 py-3 max-w-56">
                  <p className="font-medium text-gray-800 truncate">{task.title}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{task.description}</p>
                </td>

                {/* Assigned To with avatar */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
                      {getInitials(task.assignedTo.name)}
                    </div>
                    <span className="font-medium text-gray-800">{task.assignedTo.name}</span>
                  </div>
                </td>

                {/* Assigned By */}
                <td className="px-4 py-3 text-gray-600 text-xs">{task.assignedBy.name}</td>

                {/* Department badge (of assignee) */}
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${DEPT_COLORS[task.assignedTo.department] ?? 'bg-gray-100 text-gray-600'}`}>
                    {task.assignedTo.department.replace(/_/g, ' ')}
                  </span>
                </td>

                {/* Priority */}
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority]}`}>
                    {task.priority}
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[task.status]}`}>
                    {task.status}
                  </span>
                </td>

                {/* Deadline + days remaining */}
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
        onTaskCompleted={() => { setSelectedTask(null); fetchTasks() }}
        onTaskUpdated={(updated) => { setSelectedTask(updated); fetchTasks() }}
        canComplete={false}
        canEdit={true}
      />
    </div>
  )
}

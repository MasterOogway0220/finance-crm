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
import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  PENDING:   'badge-warning',
  COMPLETED: 'badge-success',
  EXPIRED:   'badge-danger',
}

const PRIORITY_COLORS: Record<string, string> = {
  HIGH:   'badge-danger',
  MEDIUM: 'badge-warning',
  LOW:    'badge-success',
}

const DEPT_COLORS: Record<string, string> = {
  EQUITY:      'badge-info',
  MUTUAL_FUND: 'badge-success',
  BACK_OFFICE: 'inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-purple-600/20',
  ADMIN:       'inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-600/20',
}

function DeadlineInfo({ deadline, status }: { deadline: Date; status: string }) {
  if (status === 'COMPLETED') return <span className="text-xs text-emerald-600 font-medium">Completed</span>
  const days = getDaysRemaining(deadline)
  if (days < 0)  return <span className="text-xs text-red-600 font-medium">Expired {Math.abs(days)}d ago</span>
  if (days === 0) return <span className="text-xs text-orange-500 font-medium">Due today</span>
  if (days <= 3) return <span className="text-xs text-orange-400 font-medium">{days}d left</span>
  return <span className="text-xs text-muted-foreground">{days} days left</span>
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
    <div className="page-container space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">All Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage and monitor all tasks across departments</p>
        </div>
        <Link href="/tasks/assign">
          <Button className="gap-2">
            <ClipboardList className="h-4 w-4" />Assign Task
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="card-base !p-3">
        <div className="filter-row">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title..."
              className="pl-9"
              aria-label="Search tasks"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36" aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-36" aria-label="Filter by priority"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-44" aria-label="Filter by department"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="EQUITY">Equity</SelectItem>
              <SelectItem value="MUTUAL_FUND">Mutual Fund</SelectItem>
              <SelectItem value="BACK_OFFICE">Back Office</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus('all'); setPriority('all'); setDept('all') }} className="gap-1.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-responsive">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {['Task', 'Assigned To', 'Assigned By', 'Department', 'Priority', 'Status', 'Deadline'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-8 w-full" /></td></tr>
              ))
            ) : tasks.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center">
                <div className="empty-state">
                  <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm">No tasks found{hasFilters ? ' for the selected filters' : ''}</p>
                </div>
              </td></tr>
            ) : tasks.map((task) => (
              <tr
                key={task.id}
                className="border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => setSelectedTask(task)}
              >
                <td className="px-4 py-3 max-w-[240px]">
                  <p className="font-medium text-foreground truncate">{task.title}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-semibold shrink-0">
                      {getInitials(task.assignedTo.name)}
                    </div>
                    <span className="font-medium text-foreground text-sm">{task.assignedTo.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-sm">{task.assignedBy.name}</td>
                <td className="px-4 py-3">
                  <span className={DEPT_COLORS[task.assignedTo.department] ?? 'badge-neutral'}>
                    {task.assignedTo.department.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={PRIORITY_COLORS[task.priority] ?? 'badge-neutral'}>{task.priority}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={STATUS_COLORS[task.status] ?? 'badge-neutral'}>{task.status}</span>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-foreground">{formatDate(task.deadline)}</p>
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
        onTaskDeleted={() => { setSelectedTask(null); fetchTasks() }}
        canComplete={false}
        canEdit={true}
        canDelete={true}
      />
    </div>
  )
}

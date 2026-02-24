'use client'
import { useState, useEffect, useCallback } from 'react'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import { TaskWithRelations } from '@/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ClipboardList, Search } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'EXPIRED', label: 'Expired' },
]

const DEPT_OPTIONS = [
  { value: 'all', label: 'All Departments' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'MUTUAL_FUND', label: 'Mutual Fund' },
  { value: 'BACK_OFFICE', label: 'Back Office' },
  { value: 'ADMIN', label: 'Admin' },
]

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [dept, setDept] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null)

  const fetchTasks = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (status !== 'all') params.set('status', status)
    if (dept !== 'all') params.set('department', dept)
    if (search) params.set('search', search)
    fetch(`/api/tasks?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setTasks(d.data.tasks || []) })
      .finally(() => setLoading(false))
  }, [status, dept, search])

  useEffect(() => {
    const timer = setTimeout(fetchTasks, 300)
    return () => clearTimeout(timer)
  }, [fetchTasks])

  const handleTaskCompleted = () => { setSelectedTask(null); fetchTasks() }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">All Tasks</h1>
        <p className="text-sm text-gray-500">Manage and monitor all tasks across departments</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="pl-9 h-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DEPT_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No tasks found</p>
          <p className="text-xs mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{tasks.length} task{tasks.length !== 1 ? 's' : ''} found</p>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={setSelectedTask} />
          ))}
        </div>
      )}

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onTaskCompleted={handleTaskCompleted}
        canComplete={false}
      />
    </div>
  )
}

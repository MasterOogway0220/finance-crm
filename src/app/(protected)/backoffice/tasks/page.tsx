'use client'
import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import { TaskWithRelations } from '@/types'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ClipboardList } from 'lucide-react'

const DEPARTMENTS = [
  { value: 'all', label: 'All Departments' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'MUTUAL_FUND', label: 'Mutual Fund' },
]

function BackofficeTasksContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab') || 'pending'
  const [tab, setTab] = useState<'pending' | 'completed'>(tabParam as 'pending' | 'completed')
  const [dept, setDept] = useState('all')
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null)

  const fetchTasks = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('status', tab.toUpperCase())
    if (dept !== 'all') params.set('assignedByDept', dept)
    fetch(`/api/tasks?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setTasks(d.data.tasks || []) })
      .finally(() => setLoading(false))
  }, [tab, dept])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const handleTabChange = (value: string) => {
    setTab(value as 'pending' | 'completed')
    router.replace(`/backoffice/tasks?tab=${value}`, { scroll: false })
  }

  const handleTaskCompleted = () => {
    setSelectedTask(null)
    fetchTasks()
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
        <p className="text-sm text-gray-500">Tasks assigned to you</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Tabs>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No {tab} tasks</p>
          <p className="text-xs mt-1">Tasks assigned to you will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
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

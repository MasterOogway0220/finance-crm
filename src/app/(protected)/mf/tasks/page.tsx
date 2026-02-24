'use client'
import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import { TaskWithRelations } from '@/types'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { ClipboardList } from 'lucide-react'

function MFTasksContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab') || 'my-tasks'
  const [tab, setTab] = useState(tabParam)
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null)

  const fetchTasks = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (tab === 'assigned-by-me') {
      params.set('assignedByMe', 'true')
    } else {
      params.set('assignedToMe', 'true')
    }
    fetch(`/api/tasks?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setTasks(d.data.tasks || []) })
      .finally(() => setLoading(false))
  }, [tab])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const handleTabChange = (value: string) => {
    setTab(value)
    router.replace(`/mf/tasks?tab=${value}`, { scroll: false })
  }

  const handleTaskCompleted = () => { setSelectedTask(null); fetchTasks() }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="my-tasks">My Tasks</TabsTrigger>
          <TabsTrigger value="assigned-by-me">Assigned by Me</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No tasks found</p>
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
        canComplete={tab === 'my-tasks'}
      />
    </div>
  )
}

export default function MFTasksPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400 text-sm">Loading...</div>}>
      <MFTasksContent />
    </Suspense>
  )
}

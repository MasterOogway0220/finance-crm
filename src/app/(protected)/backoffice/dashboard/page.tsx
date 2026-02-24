'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Clock, CheckCircle } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import { TaskWithRelations } from '@/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateLong } from '@/lib/utils'

interface BackofficeDashData {
  pendingTasks: number
  completedTasksThisMonth: number
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
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
          </div>

          {/* My Tasks Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">My Tasks</h2>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              {data.filteredTasks.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Clock className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No pending tasks for this period</p>
                </div>
              ) : data.filteredTasks.map((task) => (
                <TaskCard key={task.id} task={task} onClick={setSelectedTask} />
              ))}
            </div>
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

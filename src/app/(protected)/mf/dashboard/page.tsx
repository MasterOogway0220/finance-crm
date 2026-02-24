'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Users, Activity, UserX, Clock, CheckCircle } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import { TaskWithRelations } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateLong } from '@/lib/utils'

interface MFDashData {
  totalClients: number
  activeClients: number
  inactiveClients: number
  pendingTasks: number
  completedTasksThisMonth: number
  recentTasks: TaskWithRelations[]
}

export default function MFDashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [data, setData] = useState<MFDashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null)
  const today = new Date()

  useEffect(() => {
    fetch('/api/dashboard/mf')
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [])

  const handleTaskCompleted = () => {
    fetch('/api/dashboard/mf').then(r => r.json()).then(d => { if (d.success) setData(d.data) })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {session?.user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here's your work overview for today</p>
        </div>
        <p className="text-sm text-gray-500 hidden md:block">{formatDateLong(today)}</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard title="Total Clients" value={data.totalClients} subtitle="Assigned to you" icon={Users} accent="blue" />
            <KpiCard title="Active Clients" value={data.activeClients} subtitle="Investment done / interested" icon={Activity} accent="green" />
            <KpiCard title="Inactive Clients" value={data.inactiveClients} subtitle="Needs follow-up" icon={UserX} accent="red" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <KpiCard title="Pending Tasks" value={data.pendingTasks} subtitle="Assigned to you" icon={Clock} accent="amber"
              actionLabel="View tasks" onAction={() => router.push('/mf/tasks')} />
            <KpiCard title="Completed Tasks" value={data.completedTasksThisMonth} subtitle="This month" icon={CheckCircle} accent="green" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">My Tasks</h2>
                <p className="text-xs text-gray-500">Your assigned tasks and their status</p>
              </div>
            </div>
            <div className="space-y-2">
              {data.recentTasks.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No tasks assigned.</p>
              ) : data.recentTasks.slice(0, 5).map((task) => (
                <TaskCard key={task.id} task={task} onClick={setSelectedTask} />
              ))}
            </div>
            <button onClick={() => router.push('/mf/tasks')} className="mt-3 text-sm text-blue-600 hover:underline font-medium">
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

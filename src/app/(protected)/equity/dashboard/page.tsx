'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Users, TrendingUp, TrendingDown, Clock, CheckCircle } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { TaskCard } from '@/components/tasks/task-card'
import { TaskDetailModal } from '@/components/tasks/task-detail-modal'
import { TaskWithRelations } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDateLong } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

interface EquityDashData {
  totalClients: number
  tradedClients: number
  notTraded: number
  pendingTasks: number
  completedTasksThisMonth: number
  recentTasks: TaskWithRelations[]
  dailyBrokerage: Array<{ day: number; amount: number }>
  mtdBrokerage: number
}

export default function EquityDashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [data, setData] = useState<EquityDashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null)
  const today = new Date()

  useEffect(() => {
    fetch('/api/dashboard/equity')
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [])

  const handleTaskCompleted = () => {
    fetch('/api/dashboard/equity').then(r => r.json()).then(d => { if (d.success) setData(d.data) })
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Banner */}
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
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard title="Total Clients" value={data.totalClients} subtitle="Assigned to you" icon={Users} accent="blue" />
            <KpiCard title="Traded Clients" value={data.tradedClients} subtitle="Active trading" icon={TrendingUp} accent="green" />
            <KpiCard title="Not Traded" value={data.notTraded} subtitle="Pending activation" icon={TrendingDown} accent="red" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <KpiCard title="Pending Tasks" value={data.pendingTasks} subtitle="Assigned to you" icon={Clock} accent="amber"
              actionLabel="View tasks" onAction={() => router.push('/equity/tasks')} />
            <KpiCard title="Completed Tasks" value={data.completedTasksThisMonth} subtitle="This month" icon={CheckCircle} accent="green" />
          </div>

          {/* My Tasks Preview */}
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
            <button
              onClick={() => router.push('/equity/tasks')}
              className="mt-3 text-sm text-blue-600 hover:underline font-medium"
            >
              View All Tasks →
            </button>
          </div>

          {/* Daily Brokerage Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-gray-700">
                  My Daily Brokerage — {today.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </CardTitle>
                <div className="text-right">
                  <p className="text-xs text-gray-500">MTD Total</p>
                  <p className="text-lg font-bold text-green-700">{formatCurrency(data.mtdBrokerage)}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.dailyBrokerage} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number | undefined) => [formatCurrency(v ?? 0), 'Brokerage']} />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
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

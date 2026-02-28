'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Download, ArrowLeft } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Link from 'next/link'

const YEARS = ['2024', '2025', '2026']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface TaskReportData {
  monthly: Array<{ month: string; completed: number; pending: number; expired: number; total: number; completionRate: number }>
  summary: { totalCompleted: number; totalPending: number; totalExpired: number; completionRate: number }
}

interface Employee { id: string; name: string }

export default function TasksReportPage() {
  const { data: session } = useSession()
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [employeeId, setEmployeeId] = useState('all')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [data, setData] = useState<TaskReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/employees?department=BACK_OFFICE&isActive=true')
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmployees(d.data) })
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ year })
    if (employeeId !== 'all') params.set('employeeId', employeeId)
    fetch(`/api/reports/tasks?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [year, employeeId])

  const handleExport = async () => {
    const res = await fetch('/api/reports/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'tasks', year }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `task_report_${year}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Task Report</h1>
          <p className="text-sm text-gray-500">Task completion performance</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Select Employee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5 h-9">
            <Download className="h-3.5 w-3.5" />Export Excel
          </Button>
          <Link href="/reports">
            <Button size="sm" variant="secondary" className="gap-1.5 h-9">
              <ArrowLeft className="h-3.5 w-3.5" />Back to Reports
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Total Completed</p><p className="text-2xl font-bold text-green-700 mt-1">{data.summary.totalCompleted}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Pending / Expired</p><p className="text-2xl font-bold text-amber-600 mt-1">{data.summary.totalPending + data.summary.totalExpired}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Completion Rate</p><p className="text-2xl font-bold text-blue-700 mt-1">{data.summary.completionRate.toFixed(1)}%</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-gray-500">Expired</p><p className="text-2xl font-bold text-red-600 mt-1">{data.summary.totalExpired}</p></CardContent></Card>
          </div>

          {/* Chart */}
          <div className="bg-white rounded-lg border p-4">
            <h2 className="text-base font-semibold text-gray-700 mb-4">Monthly Task Breakdown</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.monthly} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="completed" fill="#2E7D32" name="Completed" />
                <Bar dataKey="pending" fill="#F9A825" name="Pending" />
                <Bar dataKey="expired" fill="#D32F2F" name="Expired" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Month', 'Total', 'Completed', 'Pending', 'Expired', 'Completion Rate'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.monthly.map((row, idx) => (
                  <tr key={row.month} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{row.month}</td>
                    <td className="px-4 py-2.5 text-gray-700">{row.total}</td>
                    <td className="px-4 py-2.5 text-green-700 font-medium">{row.completed}</td>
                    <td className="px-4 py-2.5 text-amber-600">{row.pending}</td>
                    <td className="px-4 py-2.5 text-red-600">{row.expired}</td>
                    <td className="px-4 py-2.5 text-blue-700 font-medium">{row.completionRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

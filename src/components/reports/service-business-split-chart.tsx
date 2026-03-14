'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface Employee {
  id: string
  name: string
}

interface SplitData {
  employeeName: string
  businessCount: number
  serviceCount: number
}

interface ServiceBusinessSplitChartProps {
  month: string
  year: string
}

export function ServiceBusinessSplitChart({ month, year }: ServiceBusinessSplitChartProps) {
  const [mfEmployees, setMfEmployees] = useState<Employee[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [data, setData] = useState<SplitData | null>(null)
  const [loading, setLoading] = useState(false)

  // Load MF employees
  useEffect(() => {
    fetch('/api/employees?department=MUTUAL_FUND&isActive=true')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const employees: Employee[] = d.data.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name }))
          setMfEmployees(employees)
          if (employees.length > 0) setSelectedEmployee(employees[0].id)
        }
      })
  }, [])

  // Fetch split data when employee/month/year changes
  useEffect(() => {
    if (!selectedEmployee) return
    setLoading(true)
    const params = new URLSearchParams({ employeeId: selectedEmployee, month, year })
    fetch(`/api/reports/mf-service-business-split?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [selectedEmployee, month, year])

  const chartData = data ? [
    { name: data.employeeName.split(' ')[0], Business: data.businessCount, Service: data.serviceCount },
  ] : []

  const maxVal = data ? Math.max(data.businessCount, data.serviceCount, 1) : 1
  const yAxisMax = Math.ceil(maxVal * 1.3) || 5

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-semibold text-gray-700">Service-Business Split</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 font-medium">Employee:</span>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {mfEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-[250px] rounded-lg" />
        ) : !data || (data.businessCount === 0 && data.serviceCount === 0) ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-gray-400">No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }} barSize={50}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, yAxisMax]} allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend
                iconType="circle"
                iconSize={10}
                formatter={(value) => <span className="text-sm text-gray-600 ml-1">{value}</span>}
              />
              <Bar dataKey="Business" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Business Logs" />
              <Bar dataKey="Service" fill="#10b981" radius={[4, 4, 0, 0]} name="Service Logs" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

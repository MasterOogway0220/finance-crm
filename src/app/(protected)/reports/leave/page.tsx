'use client'
import { useState, useEffect, useCallback } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays, Users } from 'lucide-react'

interface LeaveRow {
  employeeId: string
  employeeName: string
  department: string
  designation: string
  totalLeaves: number
  leavesTaken: number
  leavesRemaining: number
}

interface Employee { id: string; name: string; department: string }

const YEARS = [2024, 2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) }))

export default function LeaveReportPage() {
  const now = new Date()
  const [year, setYear] = useState(String(now.getFullYear()))
  const [department, setDepartment] = useState('all')
  const [employeeId, setEmployeeId] = useState('all')
  const [data, setData] = useState<LeaveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<Employee[]>([])

  // Load employees for filter
  useEffect(() => {
    const deptParam = department !== 'all' ? `?department=${department}&isActive=true` : '?isActive=true'
    fetch(`/api/employees${deptParam}`)
      .then(r => r.json())
      .then(d => { if (d.success) setEmployees(d.data) })
    setEmployeeId('all')
  }, [department])

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('year', year)
    if (department !== 'all') params.set('department', department)
    if (employeeId !== 'all') params.set('employeeId', employeeId)
    fetch(`/api/reports/leave?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data) })
      .finally(() => setLoading(false))
  }, [year, department, employeeId])

  useEffect(() => { fetchData() }, [fetchData])

  const totalLeaves = data.reduce((s, r) => s + r.totalLeaves, 0)
  const totalTaken = data.reduce((s, r) => s + r.leavesTaken, 0)
  const totalRemaining = data.reduce((s, r) => s + r.leavesRemaining, 0)

  return (
    <div className="page-container space-y-5">
      <div>
        <h1 className="page-title">Employee Leave Report</h1>
        <p className="text-sm text-gray-500">Leave balance and usage overview</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={department} onValueChange={(v) => { setDepartment(v) }}>
            <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="EQUITY">Equity</SelectItem>
              <SelectItem value="MUTUAL_FUND">Mutual Fund</SelectItem>
              <SelectItem value="BACK_OFFICE">Back Office</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Employee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-500">Total Leaves</p>
              <p className="text-lg font-bold text-gray-800 mt-1">{totalLeaves}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-500">Leaves Taken</p>
              <p className="text-lg font-bold text-red-600 mt-1">{totalTaken}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-500">Leaves Remaining</p>
              <p className="text-lg font-bold text-green-600 mt-1">{totalRemaining}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Employee', 'Department', 'Designation', 'Total Leaves', 'Leaves Taken', 'Leaves Remaining'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
                ))
              : data.length === 0
              ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No employees found</p>
                  </td>
                </tr>
              )
              : data.map(row => (
                <tr key={row.employeeId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{row.employeeName}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      row.department === 'EQUITY' ? 'bg-blue-100 text-blue-700'
                      : row.department === 'MUTUAL_FUND' ? 'bg-green-100 text-green-700'
                      : row.department === 'BACK_OFFICE' ? 'bg-purple-100 text-purple-700'
                      : 'bg-gray-100 text-gray-700'
                    }`}>
                      {row.department.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{row.designation}</td>
                  <td className="px-4 py-3 text-center font-medium">{row.totalLeaves}</td>
                  <td className="px-4 py-3 text-center font-medium text-red-600">{row.leavesTaken}</td>
                  <td className="px-4 py-3 text-center font-medium text-green-600">{row.leavesRemaining}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

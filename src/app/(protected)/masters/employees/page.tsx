'use client'
import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { UserPlus, Pencil, Search } from 'lucide-react'
import { toast } from 'sonner'
import { getInitials } from '@/lib/utils'

interface Employee {
  id: string; name: string; email: string; phone: string
  department: string; designation: string; role: string; isActive: boolean
}

const DEPT_COLORS: Record<string, string> = {
  EQUITY: 'bg-blue-100 text-blue-700', MUTUAL_FUND: 'bg-green-100 text-green-700',
  BACK_OFFICE: 'bg-purple-100 text-purple-700', ADMIN: 'bg-orange-100 text-orange-700',
}

const schema = z.object({
  name: z.string().min(1), email: z.string().email(),
  phone: z.string().length(10).regex(/^\d{10}$/),
  department: z.enum(['EQUITY', 'MUTUAL_FUND', 'BACK_OFFICE', 'ADMIN']),
  designation: z.string().min(1),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EQUITY_DEALER', 'MF_DEALER', 'BACK_OFFICE']),
  password: z.string().min(8).optional().or(z.literal('')),
  isActive: z.boolean(),
})

type FormData = z.infer<typeof schema>

export default function EmployeeMasterPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isActive: true },
  })

  const fetchEmployees = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    fetch(`/api/employees?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmployees(d.data) })
      .finally(() => setLoading(false))
  }, [search])

  useEffect(() => {
    const t = setTimeout(fetchEmployees, 300)
    return () => clearTimeout(t)
  }, [fetchEmployees])

  const openAdd = () => { reset({ isActive: true }); setEditEmployee(null); setShowForm(true) }
  const openEdit = (e: Employee) => {
    setEditEmployee(e)
    reset({ name: e.name, email: e.email, phone: e.phone, department: e.department as FormData['department'], designation: e.designation, role: e.role as FormData['role'], isActive: e.isActive, password: '' })
    setShowForm(true)
  }

  const onSubmit = async (data: FormData) => {
    setSubmitting(true)
    const body = { ...data }
    if (!body.password) delete body.password
    try {
      const res = await fetch(editEmployee ? `/api/employees/${editEmployee.id}` : '/api/employees', {
        method: editEmployee ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (result.success) {
        toast.success(editEmployee ? 'Employee updated' : 'Employee created')
        setShowForm(false)
        fetchEmployees()
      } else {
        toast.error(result.error || 'Failed to save')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (emp: Employee) => {
    const res = await fetch(`/api/employees/${emp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !emp.isActive }),
    })
    const data = await res.json()
    if (data.success) {
      setEmployees((prev) => prev.map((e) => e.id === emp.id ? { ...e, isActive: !emp.isActive } : e))
      toast.success(`${emp.name} ${!emp.isActive ? 'activated' : 'deactivated'}`)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Master</h1>
          <p className="text-sm text-gray-500">Manage all employees and their access</p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Add Employee
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees..." className="pl-9 h-9" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Phone', 'Email', 'Department', 'Designation', 'Role', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
              ))
            ) : employees.map((emp) => (
              <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-medium">
                      {getInitials(emp.name)}
                    </div>
                    <span className="font-medium text-gray-800">{emp.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{emp.phone}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{emp.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${DEPT_COLORS[emp.department] || 'bg-gray-100 text-gray-600'}`}>
                    {emp.department.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{emp.designation}</td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{emp.role.replace('_', ' ')}</span>
                </td>
                <td className="px-4 py-3">
                  <Switch checked={emp.isActive} onCheckedChange={() => toggleActive(emp)} />
                </td>
                <td className="px-4 py-3">
                  <Button size="sm" variant="outline" onClick={() => openEdit(emp)} className="gap-1 h-7 text-xs">
                    <Pencil className="h-3 w-3" />Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEmployee ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {[
              { name: 'name', label: 'Full Name', type: 'text', placeholder: 'Enter full name' },
              { name: 'email', label: 'Email', type: 'email', placeholder: 'email@example.com' },
              { name: 'phone', label: 'Phone (10 digits)', type: 'tel', placeholder: '9876543210' },
              { name: 'designation', label: 'Designation', type: 'text', placeholder: 'e.g. Equity Dealer' },
            ].map(({ name, label, type, placeholder }) => (
              <div key={name} className="space-y-1.5">
                <Label>{label}</Label>
                <Input {...register(name as keyof FormData)} type={type} placeholder={placeholder}
                  className={errors[name as keyof FormData] ? 'border-red-500' : ''} />
                {errors[name as keyof FormData] && <p className="text-xs text-red-500">{errors[name as keyof FormData]?.message}</p>}
              </div>
            ))}

            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select onValueChange={(v) => setValue('department', v as FormData['department'])} defaultValue={editEmployee?.department}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {['EQUITY', 'MUTUAL_FUND', 'BACK_OFFICE', 'ADMIN'].map((d) => (
                    <SelectItem key={d} value={d}>{d.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select onValueChange={(v) => setValue('role', v as FormData['role'])} defaultValue={editEmployee?.role}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {['SUPER_ADMIN', 'ADMIN', 'EQUITY_DEALER', 'MF_DEALER', 'BACK_OFFICE'].map((r) => (
                    <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{editEmployee ? 'New Password (leave blank to keep)' : 'Password *'}</Label>
              <Input {...register('password')} type="password" placeholder="Min 8 characters" className={errors.password ? 'border-red-500' : ''} />
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Saving...' : editEmployee ? 'Update Employee' : 'Add Employee'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

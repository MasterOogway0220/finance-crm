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
import { UserPlus, Pencil, Search, X, Trash2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { getInitials } from '@/lib/utils'

interface Employee {
  id: string; name: string; email: string; phone: string
  department: string; designation: string; role: string; secondaryRole: string | null; isActive: boolean
}

const DEPT_COLORS: Record<string, string> = {
  EQUITY: 'bg-blue-100 text-blue-700', MUTUAL_FUND: 'bg-green-100 text-green-700',
  BACK_OFFICE: 'bg-purple-100 text-purple-700', ADMIN: 'bg-orange-100 text-orange-700',
}

const ROLE_OPTIONS = ['SUPER_ADMIN', 'ADMIN', 'EQUITY_DEALER', 'MF_DEALER', 'BACK_OFFICE'] as const

const schema = z.object({
  name: z.string().min(1), email: z.string().email(),
  phone: z.string().length(10).regex(/^\d{10}$/),
  department: z.enum(['EQUITY', 'MUTUAL_FUND', 'BACK_OFFICE', 'ADMIN']),
  designation: z.string().min(1),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EQUITY_DEALER', 'MF_DEALER', 'BACK_OFFICE']),
  secondaryRole: z.enum(['SUPER_ADMIN', 'ADMIN', 'EQUITY_DEALER', 'MF_DEALER', 'BACK_OFFICE']).nullable().optional(),
  password: z.string().min(8).optional().or(z.literal('')),
  isActive: z.boolean(),
})

type FormData = z.infer<typeof schema>

export default function EmployeeMasterPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('all')
  const [role, setRole] = useState('all')
  const [activeFilter, setActiveFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [deleteClientCount, setDeleteClientCount] = useState(0)
  const [transferToId, setTransferToId] = useState('')
  const [transferEmployees, setTransferEmployees] = useState<Employee[]>([])
  const [loadingDeleteInfo, setLoadingDeleteInfo] = useState(false)
  const [addingForTransfer, setAddingForTransfer] = useState(false)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isActive: true },
  })

  const fetchEmployees = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (dept !== 'all') params.set('department', dept)
    if (role !== 'all') params.set('role', role)
    if (activeFilter !== 'all') params.set('isActive', activeFilter)
    fetch(`/api/employees?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmployees(d.data) })
      .finally(() => setLoading(false))
  }, [search, dept, role, activeFilter])

  useEffect(() => {
    const t = setTimeout(fetchEmployees, 300)
    return () => clearTimeout(t)
  }, [fetchEmployees])

  const openAdd = () => { reset({ isActive: true }); setEditEmployee(null); setShowPassword(false); setAddingForTransfer(false); setShowForm(true) }
  const openEdit = (e: Employee) => {
    setEditEmployee(e)
    reset({ name: e.name, email: e.email, phone: e.phone, department: e.department as FormData['department'], designation: e.designation, role: e.role as FormData['role'], secondaryRole: (e.secondaryRole as FormData['secondaryRole']) ?? null, isActive: e.isActive, password: '' })
    setShowPassword(false); setShowForm(true)
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
        if (addingForTransfer && deleteTarget) {
          setAddingForTransfer(false)
          const newId = result.data.id
          fetch(`/api/employees?isActive=true`)
            .then((r) => r.json())
            .then((d) => {
              if (d.success) {
                setTransferEmployees(d.data.filter((e: Employee) => e.id !== deleteTarget.id))
                setTransferToId(newId)
              }
            })
        } else {
          fetchEmployees()
        }
      } else {
        toast.error(result.error || 'Failed to save')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const openDelete = async (emp: Employee) => {
    setDeleteTarget(emp)
    setTransferToId('')
    setDeleteClientCount(0)
    setLoadingDeleteInfo(true)
    try {
      const [empRes, listRes] = await Promise.all([
        fetch(`/api/employees/${emp.id}`),
        fetch(`/api/employees?isActive=true`),
      ])
      const empData = await empRes.json()
      const listData = await listRes.json()
      if (empData.success) setDeleteClientCount(empData.data._count?.assignedClients ?? 0)
      if (listData.success) setTransferEmployees(listData.data.filter((e: Employee) => e.id !== emp.id))
    } finally {
      setLoadingDeleteInfo(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    if (deleteClientCount > 0 && !transferToId) {
      toast.error('Please select an employee to transfer clients to')
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`/api/employees/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferToId: transferToId || undefined }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${deleteTarget.name} deleted`)
        setDeleteTarget(null)
        fetchEmployees()
      } else {
        toast.error(data.error || 'Failed to delete')
      }
    } finally {
      setDeleting(false)
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
    <div className="page-container space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Employee Master</h1>
          <p className="text-sm text-gray-500">Manage all employees and their access</p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Add Employee
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or phone…" className="pl-9 h-9 text-sm" />
          </div>

          {/* Department */}
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-38 h-9 text-sm"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="EQUITY">Equity</SelectItem>
              <SelectItem value="MUTUAL_FUND">Mutual Fund</SelectItem>
              <SelectItem value="BACK_OFFICE">Back Office</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>

          {/* Role */}
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="EQUITY_DEALER">Equity Dealer</SelectItem>
              <SelectItem value="MF_DEALER">MF Dealer</SelectItem>
              <SelectItem value="BACK_OFFICE">Back Office</SelectItem>
            </SelectContent>
          </Select>

          {/* Active / Inactive */}
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear */}
          {(search || dept !== 'all' || role !== 'all' || activeFilter !== 'all') && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setDept('all'); setRole('all'); setActiveFilter('all') }} className="h-9 gap-1.5 text-gray-500 hover:text-gray-800">
              <X className="h-3.5 w-3.5" />Clear
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Phone', 'Email', 'Department', 'Designation', 'Role', 'Secondary Role', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={9} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
              ))
            ) : employees.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">No employees found</td></tr>
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
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded whitespace-nowrap">{emp.role.replace(/_/g, ' ')}</span>
                </td>
                <td className="px-4 py-3">
                  {emp.secondaryRole ? (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded whitespace-nowrap">{emp.secondaryRole.replace(/_/g, ' ')}</span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Switch checked={emp.isActive} onCheckedChange={() => toggleActive(emp)} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => openEdit(emp)} className="gap-1 h-7 text-xs">
                      <Pencil className="h-3 w-3" />Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openDelete(emp)} className="gap-1 h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Employee</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to permanently delete <strong>{deleteTarget.name}</strong>?
                This cannot be undone.
              </p>

              {loadingDeleteInfo ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : deleteClientCount > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    This employee has <strong>{deleteClientCount} client{deleteClientCount > 1 ? 's' : ''}</strong> assigned. Transfer them to another employee before deleting.
                  </div>
                  <Label className="text-sm">Transfer clients to</Label>
                  <Select value={transferToId} onValueChange={(v) => {
                    if (v === '__add_new__') {
                      reset({ isActive: true })
                      setEditEmployee(null)
                      setShowPassword(false)
                      setAddingForTransfer(true)
                      setShowForm(true)
                    } else {
                      setTransferToId(v)
                    }
                  }}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select employee…" />
                    </SelectTrigger>
                    <SelectContent>
                      {transferEmployees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name}
                          <span className="text-gray-400 ml-1 text-xs">({emp.designation})</span>
                        </SelectItem>
                      ))}
                      <SelectItem value="__add_new__" className="text-blue-600 font-medium">
                        + Add New Employee
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  Employees with tasks or brokerage data cannot be deleted. Deactivate them instead using the toggle.
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDelete}
                  disabled={deleting || loadingDeleteInfo || (deleteClientCount > 0 && !transferToId)}
                >
                  {deleting ? 'Deleting…' : deleteClientCount > 0 && transferToId ? 'Transfer & Delete' : 'Delete'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
              <Select value={watch('department') ?? ''} onValueChange={(v) => setValue('department', v as FormData['department'])}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {['EQUITY', 'MUTUAL_FUND', 'BACK_OFFICE', 'ADMIN'].map((d) => (
                    <SelectItem key={d} value={d}>{d.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Primary Role</Label>
              <Select value={watch('role') ?? ''} onValueChange={(v) => setValue('role', v as FormData['role'])}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Secondary Role <span className="text-gray-400 font-normal text-xs">(optional — for dual-role employees)</span></Label>
              <Select
                value={watch('secondaryRole') ?? 'none'}
                onValueChange={(v) => setValue('secondaryRole', v === 'none' ? null : v as FormData['secondaryRole'])}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">Allows this employee to switch between two roles without separate accounts.</p>
            </div>

            <div className="space-y-1.5">
              <Label>{editEmployee ? 'New Password (leave blank to keep)' : 'Password *'}</Label>
              <div className="relative">
                <Input {...register('password')} type={showPassword ? 'text' : 'password'} placeholder="Min 8 characters" className={`pr-10 ${errors.password ? 'border-red-500' : ''}`} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
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

'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useSession } from 'next-auth/react'

const schema = z.object({
  department: z.string().min(1, 'Select department'),
  assignedToId: z.string().min(1, 'Select an employee'),
  title: z.string().min(1, 'Title is required').max(100),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
})

type FormData = z.infer<typeof schema>

interface Employee {
  id: string
  name: string
  department: string
  designation: string
}

const DEPARTMENTS = [
  { value: 'EQUITY', label: 'Equity' },
  { value: 'MUTUAL_FUND', label: 'Mutual Fund' },
  { value: 'BACK_OFFICE', label: 'Back Office' },
  { value: 'ADMIN', label: 'Admin' },
]

const PRIORITY_OPTIONS = [
  { value: 'HIGH', label: 'High', color: 'text-red-600' },
  { value: 'MEDIUM', label: 'Medium', color: 'text-yellow-600' },
  { value: 'LOW', label: 'Low', color: 'text-green-600' },
]

export function TaskAssignmentForm({ onSuccess }: { onSuccess?: () => void }) {
  const { data: session } = useSession()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [deadline, setDeadline] = useState<Date | undefined>()
  const [deadlineError, setDeadlineError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { department: '', assignedToId: '', title: '', description: '', priority: 'MEDIUM' },
  })

  const selectedDepartment = watch('department')

  useEffect(() => {
    if (!selectedDepartment) return
    setLoadingEmployees(true)
    setValue('assignedToId', '')
    fetch(`/api/employees?department=${selectedDepartment}&isActive=true`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setEmployees(d.data)
      })
      .finally(() => setLoadingEmployees(false))
  }, [selectedDepartment, setValue])

  const onSubmit = async (data: FormData) => {
    if (!deadline) {
      setDeadlineError('Deadline is required')
      return
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (deadline < today) {
      setDeadlineError('Deadline cannot be in the past')
      return
    }
    setDeadlineError('')
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, deadline: deadline.toISOString() }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success('Task assigned successfully!')
        reset()
        setDeadline(undefined)
        onSuccess?.()
      } else {
        toast.error(result.error || 'Failed to assign task')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-gray-800">Assign New Task</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Department */}
          <div className="space-y-1.5">
            <Label>Department <span className="text-red-500">*</span></Label>
            <Select onValueChange={(v) => setValue('department', v)}>
              <SelectTrigger className={errors.department ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.department && <p className="text-xs text-red-500">{errors.department.message}</p>}
          </div>

          {/* Assign To */}
          <div className="space-y-1.5">
            <Label>Assign To <span className="text-red-500">*</span></Label>
            <Select
              disabled={!selectedDepartment || loadingEmployees}
              onValueChange={(v) => setValue('assignedToId', v)}
            >
              <SelectTrigger className={errors.assignedToId ? 'border-red-500' : ''}>
                <SelectValue placeholder={loadingEmployees ? 'Loading...' : 'Select employee'} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.assignedToId && <p className="text-xs text-red-500">{errors.assignedToId.message}</p>}
          </div>

          {/* Assigned By (read-only) */}
          <div className="space-y-1.5">
            <Label>Assigned By</Label>
            <Input
              value={`${session?.user?.name || ''} (${session?.user?.department?.replace('_', ' ') || ''})`}
              readOnly
              className="bg-gray-50 text-gray-600"
            />
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Task Title <span className="text-red-500">*</span></Label>
            <Input {...register('title')} placeholder="Enter task title" className={errors.title ? 'border-red-500' : ''} />
            {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Task Description <span className="text-red-500">*</span></Label>
            <Textarea {...register('description')} placeholder="Describe the task in detail..." rows={4} className={errors.description ? 'border-red-500' : ''} />
            {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
          </div>

          {/* Start Date (read-only) */}
          <div className="space-y-1.5">
            <Label>Start Date</Label>
            <Input value={format(new Date(), 'd MMM yyyy')} readOnly className="bg-gray-50 text-gray-600" />
          </div>

          {/* Deadline */}
          <div className="space-y-1.5">
            <Label>Deadline <span className="text-red-500">*</span></Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start font-normal', !deadline && 'text-gray-400', deadlineError && 'border-red-500')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {deadline ? format(deadline, 'd MMM yyyy') : 'Select deadline date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={deadline}
                  onSelect={setDeadline}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {deadlineError && <p className="text-xs text-red-500">{deadlineError}</p>}
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select defaultValue="MEDIUM" onValueChange={(v) => setValue('priority', v as 'HIGH' | 'MEDIUM' | 'LOW')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <span className={p.color}>{p.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Assign Task
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

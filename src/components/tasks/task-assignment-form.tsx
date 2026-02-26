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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { CalendarIcon, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const schema = z.object({
  department: z.string().min(1, 'Select department'),
  assignedToId: z.string().min(1, 'Select an employee'),
  title: z.string().min(1, 'Title is required').max(100),
  description: z.string().min(10, 'At least 10 characters'),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
})

type FormData = z.infer<typeof schema>

interface Employee {
  id: string
  name: string
  designation: string
}

const DEPARTMENTS = [
  { value: 'EQUITY', label: 'Equity' },
  { value: 'MUTUAL_FUND', label: 'Mutual Fund' },
  { value: 'BACK_OFFICE', label: 'Back Office' },
  { value: 'ADMIN', label: 'Admin' },
]

const PRIORITY_OPTIONS = [
  { value: 'HIGH', label: '🔴  High' },
  { value: 'MEDIUM', label: '🟡  Medium' },
  { value: 'LOW', label: '🟢  Low' },
]

export function TaskAssignmentForm({ onSuccess }: { onSuccess?: () => void }) {
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
      .then((d) => { if (d.success) setEmployees(d.data) })
      .finally(() => setLoadingEmployees(false))
  }, [selectedDepartment, setValue])

  const onSubmit = async (data: FormData) => {
    if (!deadline) { setDeadlineError('Deadline is required'); return }
    if (deadline < new Date()) { setDeadlineError('Deadline cannot be in the past'); return }
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
        toast.success('Task assigned successfully')
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
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* Row 1: Department + Assign To */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Department <span className="text-red-500 normal-case">*</span></Label>
            <Select onValueChange={(v) => setValue('department', v)}>
              <SelectTrigger className={cn('h-10', errors.department && 'border-red-400')}>
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

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assign To <span className="text-red-500 normal-case">*</span></Label>
            <Select
              disabled={!selectedDepartment || loadingEmployees}
              onValueChange={(v) => setValue('assignedToId', v)}
            >
              <SelectTrigger className={cn('h-10', errors.assignedToId && 'border-red-400')}>
                <SelectValue placeholder={loadingEmployees ? 'Loading…' : !selectedDepartment ? 'Select department first' : 'Select employee'} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span>{e.name}</span>
                    {e.designation && <span className="ml-1.5 text-xs text-gray-400">· {e.designation}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.assignedToId && <p className="text-xs text-red-500">{errors.assignedToId.message}</p>}
          </div>
        </div>

        {/* Row 2: Title */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Task Title <span className="text-red-500 normal-case">*</span></Label>
          <Input
            {...register('title')}
            placeholder="e.g. Follow up with HNI clients for Q4"
            className={cn('h-10', errors.title && 'border-red-400')}
          />
          {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
        </div>

        {/* Row 3: Description */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description <span className="text-red-500 normal-case">*</span></Label>
          <Textarea
            {...register('description')}
            placeholder="Describe what needs to be done…"
            rows={3}
            className={cn(errors.description && 'border-red-400')}
          />
          {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
        </div>

        {/* Row 4: Deadline + Priority */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Deadline <span className="text-red-500 normal-case">*</span></Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full h-10 justify-start font-normal text-sm',
                    !deadline && 'text-gray-400',
                    deadlineError && 'border-red-400',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-gray-400" />
                  {deadline ? format(deadline, 'd MMM yyyy, h:mm a') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={deadline}
                  onSelect={(date) => {
                    if (!date) { setDeadline(undefined); return }
                    const d = new Date(date)
                    d.setHours(17, 30, 0, 0)
                    setDeadline(d)
                  }}
                  disabled={(date) => {
                    const d = new Date(date)
                    d.setHours(17, 30, 0, 0)
                    return d < new Date()
                  }}
                  initialFocus
                />
                <div className="px-3 py-2 border-t bg-gray-50 text-xs text-gray-500 text-center">
                  Tasks expire at <span className="font-semibold text-gray-700">5:30 PM</span> on the deadline date
                </div>
              </PopoverContent>
            </Popover>
            {deadlineError && <p className="text-xs text-red-500">{deadlineError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Priority</Label>
            <Select defaultValue="MEDIUM" onValueChange={(v) => setValue('priority', v as 'HIGH' | 'MEDIUM' | 'LOW')}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-1">
          <Button type="submit" disabled={isSubmitting} className="px-8 h-10">
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isSubmitting ? 'Assigning…' : 'Assign Task'}
          </Button>
        </div>
      </form>
    </div>
  )
}

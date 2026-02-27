'use client'
import { useState, useEffect } from 'react'
import { TaskWithRelations } from '@/types'
import { formatDate, getDaysRemaining } from '@/lib/utils'
import { format } from 'date-fns'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle, Loader2, Pencil, X, CalendarIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface TaskDetailModalProps {
  task: TaskWithRelations | null
  open: boolean
  onClose: () => void
  onTaskCompleted?: (taskId: string) => void
  onTaskUpdated?: (updatedTask: TaskWithRelations) => void
  canComplete?: boolean
  canEdit?: boolean
}

const priorityColor: Record<string, string> = {
  HIGH:   'bg-red-100 text-red-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW:    'bg-green-100 text-green-700',
}
const statusColor: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-green-100 text-green-800',
  EXPIRED:   'bg-red-100 text-red-800',
}

interface DraftState {
  title: string
  description: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  deadline: Date
}

export function TaskDetailModal({
  task,
  open,
  onClose,
  onTaskCompleted,
  onTaskUpdated,
  canComplete = true,
  canEdit = false,
}: TaskDetailModalProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [draft, setDraft] = useState<DraftState>({
    title: '',
    description: '',
    priority: 'MEDIUM',
    deadline: new Date(),
  })

  // Reset edit state when modal opens for a different task
  useEffect(() => {
    setIsEditing(false)
  }, [task?.id])

  if (!task) return null

  const daysLeft = getDaysRemaining(task.deadline)

  const startEditing = () => {
    setDraft({
      title: task.title,
      description: task.description,
      priority: task.priority as 'HIGH' | 'MEDIUM' | 'LOW',
      deadline: new Date(task.deadline),
    })
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!draft.title.trim()) { toast.error('Task Work is required'); return }
    if (draft.description.trim().length < 10) { toast.error('Description must be at least 10 characters'); return }
    setIsSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description.trim(),
          priority: draft.priority,
          deadline: draft.deadline.toISOString(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Task updated successfully')
        setIsEditing(false)
        onTaskUpdated?.(data.data)
      } else {
        toast.error(data.error || 'Failed to update task')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleComplete = async () => {
    setIsCompleting(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Task marked as completed')
        onTaskCompleted?.(task.id)
        onClose()
      } else {
        toast.error(data.error || 'Failed to complete task')
      }
    } finally {
      setIsCompleting(false)
      setShowConfirm(false)
    }
  }

  const showEditButton = canEdit && task.status === 'PENDING'

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setIsEditing(false); onClose() } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <DialogTitle className="text-xl font-bold text-gray-800 pr-4">{task.title}</DialogTitle>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', statusColor[task.status])}>
                  {task.status}
                </span>
                {showEditButton && !isEditing && (
                  <Button variant="outline" size="sm" onClick={startEditing} className="h-7 gap-1.5 text-xs">
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                )}
                {isEditing && (
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="h-7 gap-1.5 text-xs text-gray-500">
                    <X className="h-3 w-3" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            {/* Meta info */}
            <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-4">
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide">Assigned By</span>
                <p className="font-medium text-gray-800">{task.assignedBy.name}</p>
                <p className="text-xs text-gray-500">{task.assignedBy.department.replace('_', ' ')}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide">Assigned To</span>
                <p className="font-medium text-gray-800">{task.assignedTo.name}</p>
                <p className="text-xs text-gray-500">{task.assignedTo.department.replace('_', ' ')}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide">Date Assigned</span>
                <p className="font-medium text-gray-800">{formatDate(task.startDate)}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide">Deadline</span>
                {isEditing ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="mt-1 h-8 w-full justify-start gap-2 font-normal text-sm">
                        <CalendarIcon className="h-3.5 w-3.5 text-gray-400" />
                        {format(draft.deadline, 'd MMM yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={draft.deadline}
                        onSelect={(date) => {
                          if (!date) return
                          const d = new Date(date)
                          d.setHours(17, 30, 0, 0)
                          setDraft((prev) => ({ ...prev, deadline: d }))
                        }}
                        disabled={(date) => {
                          const d = new Date(date)
                          d.setHours(17, 30, 0, 0)
                          return d < new Date()
                        }}
                        initialFocus
                      />
                      <div className="px-3 py-2 border-t bg-gray-50 text-xs text-gray-500 text-center">
                        Tasks expire at <span className="font-semibold text-gray-700">5:30 PM</span>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <>
                    <p className="font-medium text-gray-800">{format(new Date(task.deadline), 'd MMM yyyy')}</p>
                    <p className="text-xs text-gray-500">Expires at {format(new Date(task.deadline), 'h:mm a')}</p>
                  </>
                )}
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide">Time to Expiry</span>
                <p className={cn('font-medium', daysLeft < 0 ? 'text-red-600' : daysLeft === 0 ? 'text-orange-500' : daysLeft <= 3 ? 'text-amber-600' : 'text-green-600')}>
                  {task.status === 'COMPLETED' ? 'Completed' :
                   daysLeft < 0 ? `Expired by ${Math.abs(daysLeft)} days` :
                   daysLeft === 0 ? 'Today at 5:30 PM' :
                   `${daysLeft} days remaining`}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide">Priority</span>
                {isEditing ? (
                  <Select
                    value={draft.priority}
                    onValueChange={(v) => setDraft((prev) => ({ ...prev, priority: v as 'HIGH' | 'MEDIUM' | 'LOW' }))}
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className={cn('inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded', priorityColor[task.priority])}>
                    {task.priority}
                  </span>
                )}
              </div>
            </div>

            {/* Task Work (title) — editable */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Task Work</h4>
              {isEditing ? (
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                  maxLength={100}
                  className="h-10 text-sm"
                />
              ) : (
                <p className="text-sm text-gray-800 font-medium bg-white border rounded-lg p-3">{task.title}</p>
              )}
            </div>

            {/* Description — editable */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Task Description</h4>
              {isEditing ? (
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="text-sm"
                />
              ) : (
                <p className="text-sm text-gray-600 bg-white border rounded-lg p-3 whitespace-pre-wrap">{task.description}</p>
              )}
            </div>

            {/* Edit save button */}
            {isEditing && (
              <div className="flex justify-end gap-2 pt-1 border-t">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={isSaving} className="gap-1.5">
                  {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            )}

            {/* Complete button */}
            {canComplete && task.status === 'PENDING' && !isEditing && (
              <div className="pt-2 border-t">
                <Button
                  onClick={() => setShowConfirm(true)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  size="lg"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete Task
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Completion confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Complete Task</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be reversed. Once marked as complete, the task status is permanent.
              Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCompleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleComplete}
              disabled={isCompleting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isCompleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

'use client'
import { useState } from 'react'
import { TaskWithRelations, TaskCommentItem } from '@/types'
import { formatDate, getDaysRemaining } from '@/lib/utils'
import { format } from 'date-fns'
import { TaskComments } from './task-comments'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface TaskDetailModalProps {
  task: TaskWithRelations | null
  open: boolean
  onClose: () => void
  onTaskCompleted?: (taskId: string) => void
  canComplete?: boolean
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

export function TaskDetailModal({ task, open, onClose, onTaskCompleted, canComplete = true }: TaskDetailModalProps) {
  const [comments, setComments] = useState<TaskCommentItem[]>(task?.comments || [])
  const [showConfirm, setShowConfirm] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)

  // Sync comments when task changes
  if (task?.comments && task.comments !== comments) {
    setComments(task.comments)
  }

  if (!task) return null

  const daysLeft = getDaysRemaining(task.deadline)

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

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <DialogTitle className="text-xl font-bold text-gray-800 pr-4">{task.title}</DialogTitle>
              <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0', statusColor[task.status])}>
                {task.status}
              </span>
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
                <p className="font-medium text-gray-800">{format(new Date(task.deadline), 'd MMM yyyy')}</p>
                <p className="text-xs text-gray-500">Expires at {format(new Date(task.deadline), 'h:mm a')}</p>
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
                <span className={cn('inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded', priorityColor[task.priority])}>
                  {task.priority}
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Task Description</h4>
              <p className="text-sm text-gray-600 bg-white border rounded-lg p-3 whitespace-pre-wrap">{task.description}</p>
            </div>

            {/* Comments */}
            <TaskComments
              taskId={task.id}
              comments={comments}
              onCommentAdded={(c) => setComments((prev) => [...prev, c])}
            />

            {/* Complete button */}
            {canComplete && task.status === 'PENDING' && (
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

      {/* Confirmation dialog */}
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

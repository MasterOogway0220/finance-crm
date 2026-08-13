'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Pencil, Repeat, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { TaskAssignmentForm, PRIORITY_OPTIONS } from './task-assignment-form'

interface RecurringTask {
  id: string
  title: string
  description: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  assignDay: number
  dueDay: number
  assignedTo: { id: string; name: string; department: string }
  assignedBy: { id: string; name: string }
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function RecurringTaskList({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<RecurringTask[]>([])
  const [editing, setEditing] = useState<RecurringTask | null>(null)
  const [stopping, setStopping] = useState<RecurringTask | null>(null)
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', assignDay: '', dueDay: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch('/api/recurring-tasks')
      .then((r) => r.json())
      .then((d) => { if (d.success) setItems(d.data) })
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const openEdit = (rt: RecurringTask) => {
    setForm({
      title: rt.title,
      description: rt.description,
      priority: rt.priority,
      assignDay: String(rt.assignDay),
      dueDay: String(rt.dueDay),
    })
    setEditing(rt)
  }

  const saveEdit = async () => {
    if (!editing) return
    const a = parseInt(form.assignDay, 10)
    const d = parseInt(form.dueDay, 10)
    if (!a || a < 1 || a > 31 || !d || d < 1 || d > 31) { toast.error('Enter days between 1 and 31'); return }
    if (d < a) { toast.error('Due date must be on or after the assignment date'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/recurring-tasks/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, assignDay: a, dueDay: d }),
      })
      const result = await res.json()
      if (result.success) {
        toast.success('Monthly task assignment updated')
        setEditing(null)
        load()
      } else {
        toast.error(result.error || 'Failed to update')
      }
    } finally {
      setSaving(false)
    }
  }

  const confirmStop = async () => {
    if (!stopping) return
    try {
      const res = await fetch(`/api/recurring-tasks/${stopping.id}`, { method: 'DELETE' })
      const result = await res.json()
      if (result.success) {
        toast.success('Monthly task assignment stopped')
        load()
      } else {
        toast.error(result.error || 'Failed to stop')
      }
    } catch {
      toast.error('Failed to stop — check your connection and try again')
    } finally {
      setStopping(null)
    }
  }

  if (items.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Repeat className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">Active Monthly Task Assignments</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {items.map((rt) => (
          <div key={rt.id} className="py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 truncate">{rt.title}</p>
              <p className="text-xs text-gray-500">
                {rt.assignedTo.name} · assigns {ordinal(rt.assignDay)}, due {ordinal(rt.dueDay)} of every month ·{' '}
                {PRIORITY_OPTIONS.find((p) => p.value === rt.priority)?.label}
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-8" onClick={() => openEdit(rt)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-red-600 hover:text-red-700" onClick={() => setStopping(rt)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Stop
            </Button>
          </div>
        ))}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Monthly Task Assignment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Task Work</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assignment Date</Label>
                <Input type="number" min={1} max={31} value={form.assignDay} onChange={(e) => setForm({ ...form, assignDay: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Due Date</Label>
                <Input type="number" min={1} max={31} value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-gray-500">Day of the month (1–31). Dates falling on a weekend auto-shift to Monday.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stop confirmation */}
      <AlertDialog open={!!stopping} onOpenChange={(open) => { if (!open) setStopping(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop this monthly assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              “{stopping?.title}” will no longer be auto-assigned to {stopping?.assignedTo.name} each month.
              Already-created tasks are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmStop}>Stop</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Form + list with a shared refresh so a newly created monthly assignment appears immediately
export function TaskAssignSection() {
  const [refreshKey, setRefreshKey] = useState(0)
  return (
    <div className="space-y-6">
      <TaskAssignmentForm onSuccess={() => setRefreshKey((k) => k + 1)} />
      <RecurringTaskList refreshKey={refreshKey} />
    </div>
  )
}

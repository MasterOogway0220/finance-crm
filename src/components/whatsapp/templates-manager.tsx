'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pencil, Trash2, Plus, X, Check, MessageSquareText } from 'lucide-react'
import { toast } from 'sonner'

export interface WhatsappTemplate {
  id: string
  name: string
  body: string
}

interface TemplatesManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: WhatsappTemplate[]
  reload: () => void
  currentMessage: string
  onUse: (body: string) => void
}

export function TemplatesManager({ open, onOpenChange, templates, reload, currentMessage, onUse }: TemplatesManagerProps) {
  const [newName, setNewName] = useState('')
  const [newBody, setNewBody] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editBody, setEditBody] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const create = async () => {
    if (!newName.trim() || !newBody.trim()) { toast.error('Name and message are both required'); return }
    setSaving(true)
    try {
      const d = await (await fetch('/api/whatsapp/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), body: newBody }),
      })).json()
      if (d.success) { toast.success('Template created'); setNewName(''); setNewBody(''); reload() }
      else toast.error(d.error || 'Failed to create template')
    } catch { toast.error('Failed to create template') } finally { setSaving(false) }
  }

  const startEdit = (t: WhatsappTemplate) => { setEditingId(t.id); setEditName(t.name); setEditBody(t.body) }

  const saveEdit = async (id: string) => {
    if (!editName.trim() || !editBody.trim()) { toast.error('Name and message are both required'); return }
    setBusyId(id)
    try {
      const d = await (await fetch(`/api/whatsapp/templates/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), body: editBody }),
      })).json()
      if (d.success) { toast.success('Template updated'); setEditingId(null); reload() }
      else toast.error(d.error || 'Failed to update template')
    } catch { toast.error('Failed to update template') } finally { setBusyId(null) }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this template? This cannot be undone.')) return
    setBusyId(id)
    try {
      const d = await (await fetch(`/api/whatsapp/templates/${id}`, { method: 'DELETE' })).json()
      if (d.success) { toast.success('Template deleted'); reload() }
      else toast.error(d.error || 'Failed to delete template')
    } catch { toast.error('Failed to delete template') } finally { setBusyId(null) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Message templates</DialogTitle>
          <DialogDescription>
            Save reusable messages. Use <code>{'{{name}}'}</code> to insert the recipient&apos;s first name.
          </DialogDescription>
        </DialogHeader>

        {/* Create new */}
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2 text-sm font-medium"><Plus className="h-4 w-4" /> New template</div>
          <Input placeholder="Template name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Textarea rows={4} placeholder="Message body… use {{name}}" value={newBody} onChange={(e) => setNewBody(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Button>
            <Button size="sm" variant="outline" type="button" disabled={!currentMessage.trim()} onClick={() => setNewBody(currentMessage)}>
              Use current message
            </Button>
          </div>
        </div>

        {/* Existing */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Saved templates ({templates.length})</div>
          {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet — create one above.</p>}
          {templates.map((t) => (
            <div key={t.id} className="space-y-2 rounded-md border p-3">
              {editingId === t.id ? (
                <>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <Textarea rows={4} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(t.id)} disabled={busyId === t.id}><Check className="mr-1 h-4 w-4" /> Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="mr-1 h-4 w-4" /> Cancel</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => { onUse(t.body); onOpenChange(false) }}>
                        <MessageSquareText className="mr-1 h-4 w-4" /> Use
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(t)} aria-label="Edit template"><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(t.id)} disabled={busyId === t.id} aria-label="Delete template">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{t.body}</p>
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ClientSearchCombobox } from '@/components/mf/client-search-combobox'
import { ServicePreviewDialog } from '@/components/mf/service-preview-dialog'
import { toast } from 'sonner'

export default function RecordServicePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Form state
  const [clientCode, setClientCode] = useState('')
  const [clientName, setClientName] = useState('')
  const [description, setDescription] = useState('')

  const canPreview = clientCode && clientName && description.trim()

  const handlePreview = () => {
    if (!canPreview) return
    setPreviewOpen(true)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/mf-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientCode,
          clientName,
          description: description.trim(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Service recorded successfully')
        router.push('/mf/service/log')
      } else {
        toast.error(data.error || 'Failed to record service')
      }
    } catch {
      toast.error('Failed to record service')
    } finally {
      setSubmitting(false)
      setPreviewOpen(false)
    }
  }

  const previewData = canPreview ? {
    clientCode,
    clientName,
    employeeName: session?.user?.name || '',
    description: description.trim(),
  } : null

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="page-title">Record Service</h1>
        <p className="text-sm text-gray-500 mt-0.5">Record a new mutual fund service entry</p>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="p-6 space-y-5">
          {/* Client Code */}
          <div className="space-y-1.5">
            <Label>Client Code *</Label>
            <ClientSearchCombobox
              value={clientCode}
              onSelect={(client) => {
                if (client) {
                  setClientCode(client.clientCode)
                  setClientName(client.name)
                } else {
                  setClientCode('')
                  setClientName('')
                }
              }}
            />
          </div>

          {/* Client Name (auto-filled) */}
          <div className="space-y-1.5">
            <Label>Client Name</Label>
            <Input value={clientName} readOnly className="bg-gray-50" />
          </div>

          {/* MF Employee Name (read-only from session) */}
          <div className="space-y-1.5">
            <Label>MF Employee Name</Label>
            <Input value={session?.user?.name || ''} readOnly className="bg-gray-50" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the service provided..."
              rows={4}
            />
          </div>

          {/* Actions */}
          <div className="pt-2">
            <Button onClick={handlePreview} disabled={!canPreview} className="w-full">
              Record Service
            </Button>
          </div>
        </CardContent>
      </Card>

      <ServicePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        data={previewData}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </div>
  )
}

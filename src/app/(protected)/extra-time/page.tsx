'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { istDateKey } from '@/lib/work-hours'

interface ExtraTimeRequest {
  id: string
  startAt: string
  endAt: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  reviewNote: string | null
  employee: { id: string; name: string }
  reviewedBy: { id: string; name: string } | null
}

const STATUS_STYLES: Record<ExtraTimeRequest['status'], string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })

function duration(startAt: string, endAt: string) {
  const min = Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60000)
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`
}

export default function ExtraTimePage() {
  const { data: session } = useSession()
  const today = istDateKey(new Date())

  const [requests, setRequests] = useState<ExtraTimeRequest[]>([])
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ date: today, from: '18:00', to: '', reason: '' })
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState<{ id: string; note: string } | null>(null)

  const fetchRequests = useCallback(() => {
    setLoading(true)
    fetch('/api/extra-time')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setRequests(d.data)
          setIsSuperAdmin(d.isSuperAdmin)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/extra-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!d.success) {
        toast.error(d.error ?? 'Could not submit request')
        return
      }
      toast.success('Extra time request sent for approval')
      setForm({ date: today, from: '18:00', to: '', reason: '' })
      fetchRequests()
    } finally {
      setSubmitting(false)
    }
  }

  const act = async (id: string, action: 'APPROVED' | 'REJECTED' | 'CANCELLED', reviewNote?: string) => {
    setActionLoading(id + action)
    try {
      const res = await fetch(`/api/extra-time/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewNote }),
      })
      const d = await res.json()
      if (!d.success) {
        toast.error(d.error ?? 'Action failed')
        return
      }
      toast.success(`Request ${action.toLowerCase()}`)
      setRejectNote(null)
      fetchRequests()
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="page-container space-y-6">
      <div>
        <h1 className="page-title">Extra Time</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Time after 6:00 PM is not recorded automatically. Request it here — it counts once a Super Admin approves it.
        </p>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-border bg-card shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label htmlFor="et-date" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
            <input
              id="et-date"
              type="date"
              required
              max={today}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm h-9"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="et-from" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">From</label>
            <input
              id="et-from"
              type="time"
              required
              min="18:00"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm h-9"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="et-to" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To</label>
            <input
              id="et-to"
              type="time"
              required
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm h-9"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 flex-1 min-w-56">
            <label htmlFor="et-reason" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason</label>
            <input
              id="et-reason"
              type="text"
              required
              placeholder="What did you work on?"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm h-9"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
          <Button type="submit" size="sm" className="h-9" disabled={submitting}>
            {submitting ? 'Sending…' : 'Request'}
          </Button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <p className="px-5 py-3 border-b text-sm font-semibold text-gray-700">
          {isSuperAdmin ? 'All Requests' : 'My Requests'}
        </p>
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No extra time requests</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {isSuperAdmin && <th className="px-5 py-3 text-left">Employee</th>}
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-left">Time</th>
                  <th className="px-5 py-3 text-left">Duration</th>
                  <th className="px-5 py-3 text-left">Reason</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Review</th>
                  <th className="px-5 py-3 text-left"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    {isSuperAdmin && <td className="px-5 py-3 font-medium text-gray-900">{r.employee.name}</td>}
                    <td className="px-5 py-3 text-gray-700">{istDateKey(new Date(r.startAt))}</td>
                    <td className="px-5 py-3 text-gray-700">{istTime(r.startAt)} – {istTime(r.endAt)}</td>
                    <td className="px-5 py-3 text-gray-700">{duration(r.startAt, r.endAt)}</td>
                    <td className="px-5 py-3 text-gray-600 max-w-xs">{r.reason}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                        {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {r.reviewedBy ? `${r.reviewedBy.name}${r.reviewNote ? `: ${r.reviewNote}` : ''}` : '—'}
                    </td>
                    <td className="px-5 py-3">
                      {r.status === 'PENDING' && (
                        <div className="flex gap-2 justify-end">
                          {isSuperAdmin && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 bg-green-600 hover:bg-green-700"
                                disabled={actionLoading === r.id + 'APPROVED'}
                                onClick={() => act(r.id, 'APPROVED')}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-red-600"
                                onClick={() => setRejectNote({ id: r.id, note: '' })}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {r.employee.id === session?.user?.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7"
                              disabled={actionLoading === r.id + 'CANCELLED'}
                              onClick={() => act(r.id, 'CANCELLED')}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject note dialog */}
      {rejectNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Reject Extra Time</h3>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              rows={3}
              placeholder="Reason for rejection (optional)..."
              value={rejectNote.note}
              onChange={(e) => setRejectNote({ ...rejectNote, note: e.target.value })}
            />
            <div className="flex gap-3 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setRejectNote(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={actionLoading === rejectNote.id + 'REJECTED'}
                onClick={() => act(rejectNote.id, 'REJECTED', rejectNote.note)}
              >
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useState } from 'react'

/** Inline-editable client note. Saves on blur only when the text actually changed. */
export function NotesCell({ value, onSave, readOnly }: {
  value: string | null | undefined
  onSave: (notes: string) => void
  readOnly?: boolean
}) {
  const [notes, setNotes] = useState(value || '')
  const [editing, setEditing] = useState(false)

  if (readOnly) {
    return (
      <span className="text-xs text-gray-500 block max-w-[130px] truncate" title={notes}>
        {notes || <span className="text-gray-300">—</span>}
      </span>
    )
  }

  return editing ? (
    <input
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      onBlur={() => { setEditing(false); if (notes !== (value || '')) onSave(notes) }}
      autoFocus
      className="w-full text-xs border rounded px-1.5 py-1 outline-none focus:border-blue-400"
    />
  ) : (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-gray-500 hover:text-blue-600 text-left max-w-[130px] truncate block"
      title={notes}
    >
      {notes || <span className="text-gray-300 italic">Click to add</span>}
    </button>
  )
}

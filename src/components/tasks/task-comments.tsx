'use client'
import { useState } from 'react'
import { TaskCommentItem } from '@/types'
import { formatTimeAgo, getInitials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface TaskCommentsProps {
  taskId: string
  comments: TaskCommentItem[]
  onCommentAdded: (comment: TaskCommentItem) => void
}

export function TaskComments({ taskId, comments, onCommentAdded }: TaskCommentsProps) {
  const [content, setContent] = useState('')
  const [isPosting, setIsPosting] = useState(false)

  const handlePost = async () => {
    if (!content.trim()) return
    setIsPosting(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json()
      if (data.success) {
        onCommentAdded(data.data)
        setContent('')
        toast.success('Comment posted')
      } else {
        toast.error(data.error)
      }
    } finally {
      setIsPosting(false)
    }
  }

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Comments ({comments.length})</h4>

      {/* Existing comments */}
      <div className="space-y-3 max-h-48 overflow-y-auto mb-4">
        {comments.length === 0 && (
          <p className="text-xs text-gray-400 italic">No comments yet.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium">
              {getInitials(c.author.name)}
            </div>
            <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700">{c.author.name}</span>
                <span className="text-xs text-gray-400">{formatTimeAgo(c.createdAt)}</span>
              </div>
              <p className="text-xs text-gray-600">{c.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Add comment */}
      <div className="border-t pt-3">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a comment..."
          rows={2}
          className="text-sm"
        />
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={handlePost} disabled={isPosting || !content.trim()}>
            {isPosting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Post
          </Button>
        </div>
      </div>
    </div>
  )
}

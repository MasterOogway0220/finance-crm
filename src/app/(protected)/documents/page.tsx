'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Folder, FolderOpen, FileText, FileSpreadsheet, File, Image,
  Upload, FolderPlus, Download, Trash2, Loader2, X, ChevronRight,
  Pencil, Check, FileUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { cn, formatTimeAgo, getInitials } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FolderSummary {
  id: string
  name: string
  createdAt: string
  createdBy: { id: string; name: string; department: string }
  _count: { documents: number }
}

interface DocumentFile {
  id: string
  name: string
  mimeType: string
  size: number
  createdAt: string
  uploadedBy: { id: string; name: string; department: string }
}

interface FolderDetail extends Omit<FolderSummary, '_count'> {
  documents: DocumentFile[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mimeType, name }: { mimeType: string; name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const cls = 'h-5 w-5 shrink-0'

  if (mimeType === 'application/pdf' || ext === 'pdf')
    return <FileText className={cn(cls, 'text-red-500')} />
  if (
    mimeType.includes('spreadsheet') || mimeType.includes('excel') ||
    ext === 'xlsx' || ext === 'xls' || ext === 'csv'
  )
    return <FileSpreadsheet className={cn(cls, 'text-green-600')} />
  if (mimeType.startsWith('image/'))
    return <Image className={cn(cls, 'text-blue-500')} />
  if (mimeType.includes('word') || ext === 'doc' || ext === 'docx')
    return <FileText className={cn(cls, 'text-blue-600')} />
  return <File className={cn(cls, 'text-gray-400')} />
}

const DEPT_COLOR: Record<string, string> = {
  EQUITY:      'text-blue-600',
  MUTUAL_FUND: 'text-green-600',
  BACK_OFFICE: 'text-purple-600',
  ADMIN:       'text-orange-600',
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DocumentPoolPage() {
  const [folders, setFolders] = useState<FolderSummary[]>([])
  const [looseFiles, setLooseFiles] = useState<DocumentFile[]>([])
  const [foldersLoading, setFoldersLoading] = useState(true)

  const [selectedFolder, setSelectedFolder] = useState<FolderDetail | null>(null)
  const [showLooseFiles, setShowLooseFiles] = useState(false)
  const [folderLoading, setFolderLoading] = useState(false)

  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const newFolderInputRef = useRef<HTMLInputElement>(null)

  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)

  // Rename state
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const looseFileInputRef = useRef<HTMLInputElement>(null)

  // ── Fetch folder list ──────────────────────────────────────────────────────

  const fetchFolders = useCallback(async () => {
    setFoldersLoading(true)
    try {
      const res = await fetch('/api/documents')
      const data = await res.json()
      if (data.success) {
        setFolders(data.data)
        setLooseFiles(data.looseFiles || [])
      }
    } finally {
      setFoldersLoading(false)
    }
  }, [])

  useEffect(() => { fetchFolders() }, [fetchFolders])

  useEffect(() => {
    if (showNewFolder) setTimeout(() => newFolderInputRef.current?.focus(), 50)
  }, [showNewFolder])

  useEffect(() => {
    if (renamingFolderId || renamingFileId) {
      setTimeout(() => renameInputRef.current?.focus(), 50)
    }
  }, [renamingFolderId, renamingFileId])

  // ── Open folder ────────────────────────────────────────────────────────────

  const openFolder = useCallback(async (folder: FolderSummary) => {
    setShowLooseFiles(false)
    setFolderLoading(true)
    setSelectedFolder(null)
    try {
      const res = await fetch(`/api/documents/folders/${folder.id}`)
      const data = await res.json()
      if (data.success) setSelectedFolder(data.data)
      else toast.error(data.error)
    } finally {
      setFolderLoading(false)
    }
  }, [])

  const openLooseFiles = () => {
    setSelectedFolder(null)
    setShowLooseFiles(true)
  }

  // ── Create folder ──────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    setCreatingFolder(true)
    try {
      const res = await fetch('/api/documents/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Folder "${name}" created`)
        setNewFolderName('')
        setShowNewFolder(false)
        await fetchFolders()
      } else {
        toast.error(data.error || 'Failed to create folder')
      }
    } finally {
      setCreatingFolder(false)
    }
  }

  // ── Delete folder ──────────────────────────────────────────────────────────

  const handleDeleteFolder = async (folder: FolderSummary) => {
    if (!confirm(`Delete folder "${folder.name}" and ALL files inside it? This cannot be undone.`)) return
    setDeletingFolderId(folder.id)
    try {
      const res = await fetch(`/api/documents/folders/${folder.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('Folder deleted')
        setFolders((prev) => prev.filter((f) => f.id !== folder.id))
        if (selectedFolder?.id === folder.id) setSelectedFolder(null)
      } else {
        toast.error(data.error || 'Failed to delete folder')
      }
    } finally {
      setDeletingFolderId(null)
    }
  }

  // ── Rename folder ──────────────────────────────────────────────────────────

  const handleRenameFolder = async (folderId: string) => {
    const name = renameValue.trim()
    if (!name) return
    setSavingRename(true)
    try {
      const res = await fetch(`/api/documents/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Folder renamed')
        setFolders((prev) => prev.map((f) => f.id === folderId ? { ...f, name } : f))
        if (selectedFolder?.id === folderId) {
          setSelectedFolder((prev) => prev ? { ...prev, name } : prev)
        }
        setRenamingFolderId(null)
      } else {
        toast.error(data.error || 'Failed to rename folder')
      }
    } finally {
      setSavingRename(false)
    }
  }

  // ── Rename file ────────────────────────────────────────────────────────────

  const handleRenameFile = async (fileId: string) => {
    const name = renameValue.trim()
    if (!name) return
    setSavingRename(true)
    try {
      const res = await fetch(`/api/documents/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('File renamed')
        if (selectedFolder) {
          setSelectedFolder((prev) =>
            prev ? { ...prev, documents: prev.documents.map((d) => d.id === fileId ? { ...d, name } : d) } : prev
          )
        }
        if (showLooseFiles) {
          setLooseFiles((prev) => prev.map((d) => d.id === fileId ? { ...d, name } : d))
        }
        setRenamingFileId(null)
      } else {
        toast.error(data.error || 'Failed to rename file')
      }
    } finally {
      setSavingRename(false)
    }
  }

  // ── Upload file ────────────────────────────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, folderId?: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (file.size > 20 * 1024 * 1024) {
      toast.error('File exceeds the 20 MB limit')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (folderId) formData.append('folderId', folderId)

      const res = await fetch('/api/documents/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        toast.success(`"${file.name}" uploaded`)
        if (folderId && selectedFolder?.id === folderId) {
          setSelectedFolder((prev) =>
            prev ? { ...prev, documents: [data.data, ...prev.documents] } : prev
          )
          setFolders((prev) =>
            prev.map((f) =>
              f.id === folderId
                ? { ...f, _count: { documents: f._count.documents + 1 } }
                : f
            )
          )
        } else if (!folderId) {
          setLooseFiles((prev) => [data.data, ...prev])
        }
      } else {
        toast.error(data.error || 'Upload failed')
      }
    } finally {
      setUploading(false)
    }
  }

  // ── Delete file ────────────────────────────────────────────────────────────

  const handleDeleteFile = async (doc: DocumentFile) => {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return
    setDeletingFileId(doc.id)
    try {
      const res = await fetch(`/api/documents/files/${doc.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('File deleted')
        if (selectedFolder) {
          setSelectedFolder((prev) =>
            prev ? { ...prev, documents: prev.documents.filter((d) => d.id !== doc.id) } : prev
          )
          setFolders((prev) =>
            prev.map((f) =>
              f.id === selectedFolder.id
                ? { ...f, _count: { documents: Math.max(0, f._count.documents - 1) } }
                : f
            )
          )
        }
        if (showLooseFiles) {
          setLooseFiles((prev) => prev.filter((d) => d.id !== doc.id))
        }
      } else {
        toast.error(data.error || 'Failed to delete file')
      }
    } finally {
      setDeletingFileId(null)
    }
  }

  // ── Download file ──────────────────────────────────────────────────────────

  const handleDownload = async (doc: DocumentFile) => {
    setDownloadingFileId(doc.id)
    try {
      const res = await fetch(`/api/documents/files/${doc.id}/download`)
      if (!res.ok) {
        toast.error('Download failed')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Download failed')
    } finally {
      setDownloadingFileId(null)
    }
  }

  // ── File row renderer ──────────────────────────────────────────────────────

  const renderFileRow = (doc: DocumentFile) => (
    <div
      key={doc.id}
      className="group flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all"
    >
      <FileIcon mimeType={doc.mimeType} name={doc.name} />

      {/* File info */}
      <div className="flex-1 min-w-0">
        {renamingFileId === doc.id ? (
          <div className="flex items-center gap-1.5">
            <Input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="h-7 text-sm flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameFile(doc.id)
                if (e.key === 'Escape') setRenamingFileId(null)
              }}
            />
            <button
              type="button"
              onClick={() => handleRenameFile(doc.id)}
              disabled={savingRename || !renameValue.trim()}
              className="p-1 rounded hover:bg-green-50 text-green-600 transition-colors"
              title="Save"
            >
              {savingRename ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setRenamingFileId(null)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-400">{formatBytes(doc.size)}</span>
          <span className="text-gray-200">&middot;</span>
          <div className="flex items-center gap-1">
            <div className={cn('w-4 h-4 rounded-full bg-gray-200 text-[9px] flex items-center justify-center font-bold text-white shrink-0',
              doc.uploadedBy.department === 'EQUITY' ? 'bg-blue-500' :
              doc.uploadedBy.department === 'MUTUAL_FUND' ? 'bg-green-500' :
              doc.uploadedBy.department === 'BACK_OFFICE' ? 'bg-purple-500' : 'bg-orange-500'
            )}>
              {getInitials(doc.uploadedBy.name)}
            </div>
            <span className={cn('text-xs font-medium', DEPT_COLOR[doc.uploadedBy.department])}>
              {doc.uploadedBy.name}
            </span>
          </div>
          <span className="text-gray-200">&middot;</span>
          <span className="text-xs text-gray-400">{formatTimeAgo(doc.createdAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {renamingFileId !== doc.id && (
          <button
            type="button"
            onClick={() => { setRenamingFileId(doc.id); setRenamingFolderId(null); setRenameValue(doc.name) }}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-amber-600 transition-colors"
            title="Rename"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {downloadingFileId === doc.id ? (
          <Loader2 className="h-4 w-4 text-blue-500 animate-spin mx-1.5" />
        ) : (
          <button
            type="button"
            onClick={() => handleDownload(doc)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
        {deletingFileId === doc.id ? (
          <Loader2 className="h-4 w-4 text-gray-400 animate-spin mx-1.5" />
        ) : (
          <button
            type="button"
            onClick={() => handleDeleteFile(doc)}
            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">

      {/* ── Left panel: folder list ── */}
      <aside className="w-64 shrink-0 border-r border-gray-200 flex flex-col bg-gray-50">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200 bg-white">
          <h2 className="text-sm font-semibold text-gray-800">Document Pool</h2>
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="px-3 py-2 border-b border-gray-200 bg-white">
            <Input
              ref={newFolderInputRef}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name…"
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
              }}
            />
            <div className="flex gap-2 mt-1.5">
              <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreateFolder} disabled={creatingFolder || !newFolderName.trim()}>
                {creatingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowNewFolder(false); setNewFolderName('') }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* All Files entry */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors text-sm border-b border-gray-100',
            showLooseFiles
              ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-500'
              : 'hover:bg-gray-100 text-gray-700'
          )}
          onClick={openLooseFiles}
        >
          <FileUp className="h-4 w-4 shrink-0 text-gray-500" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">All Files</p>
            <p className="text-[11px] text-gray-400 truncate">
              {looseFiles.length} file{looseFiles.length !== 1 ? 's' : ''} · No folder
            </p>
          </div>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto py-1">
          {foldersLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-3 py-2">
                <Skeleton className="h-8 w-full rounded" />
              </div>
            ))
          ) : folders.length === 0 ? (
            <p className="px-4 py-6 text-xs text-gray-400 text-center">No folders yet</p>
          ) : (
            folders.map((folder) => {
              const isSelected = selectedFolder?.id === folder.id
              return (
                <div
                  key={folder.id}
                  className={cn(
                    'group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors text-sm',
                    isSelected
                      ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-500'
                      : 'hover:bg-gray-100 text-gray-700'
                  )}
                  onClick={() => openFolder(folder)}
                >
                  {isSelected
                    ? <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
                    : <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                  }
                  <div className="flex-1 min-w-0">
                    {renamingFolderId === folder.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="h-6 text-xs flex-1"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameFolder(folder.id)
                            if (e.key === 'Escape') setRenamingFolderId(null)
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRenameFolder(folder.id) }}
                          disabled={savingRename || !renameValue.trim()}
                          className="p-0.5 rounded hover:text-green-600 text-gray-400 shrink-0"
                        >
                          {savingRename ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setRenamingFolderId(null) }}
                          className="p-0.5 rounded hover:text-gray-600 text-gray-400 shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium truncate">{folder.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {folder._count.documents} file{folder._count.documents !== 1 ? 's' : ''} · {folder.createdBy.name}
                        </p>
                      </>
                    )}
                  </div>
                  {renamingFolderId !== folder.id && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setRenamingFolderId(folder.id); setRenamingFileId(null); setRenameValue(folder.name) }}
                        className="p-0.5 rounded hover:text-amber-500 transition-colors text-gray-400"
                        title="Rename folder"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {deletingFolderId === folder.id ? (
                        <Loader2 className="h-3.5 w-3.5 text-gray-400 animate-spin" />
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder) }}
                          className="p-0.5 rounded hover:text-red-500 transition-colors text-gray-400"
                          title="Delete folder"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* New folder button */}
        <div className="p-3 border-t border-gray-200 bg-white">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs h-8"
            onClick={() => setShowNewFolder(true)}
            disabled={showNewFolder}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New Folder
          </Button>
        </div>
      </aside>

      {/* ── Right panel: file list ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Loose files view */}
        {showLooseFiles ? (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileUp className="h-5 w-5 text-gray-500 shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 truncate">All Files</h1>
                  <p className="text-xs text-gray-400">
                    Files uploaded without a folder · {looseFiles.length} file{looseFiles.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div>
                <input
                  ref={looseFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleUpload(e)}
                />
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => looseFileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Upload className="h-4 w-4" />
                  }
                  {uploading ? 'Uploading…' : 'Upload File'}
                </Button>
              </div>
            </div>

            <div className="px-6 py-2 flex items-center gap-1 text-xs text-gray-400 border-b border-gray-100 bg-gray-50 shrink-0">
              <span>Document Pool</span>
              <ChevronRight className="h-3 w-3" />
              <span className="font-medium text-gray-600">All Files</span>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {looseFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16">
                  <Upload className="h-12 w-12 mb-3 text-gray-200" />
                  <p className="font-medium text-gray-500">No files yet</p>
                  <p className="text-sm mt-1">Click <span className="font-medium">Upload File</span> to add documents directly</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {looseFiles.map(renderFileRow)}
                </div>
              )}
            </div>
          </>
        ) : !selectedFolder && !folderLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400">
            <FolderOpen className="h-16 w-16 mb-4 text-gray-200" />
            <p className="text-base font-medium text-gray-500">Select a folder</p>
            <p className="text-sm mt-1">Choose a folder from the left to view its files, or select &quot;All Files&quot; for direct uploads</p>
          </div>
        ) : folderLoading ? (
          <div className="flex-1 flex flex-col p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : selectedFolder ? (
          <>
            {/* Folder header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen className="h-5 w-5 text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 truncate">{selectedFolder.name}</h1>
                  <p className="text-xs text-gray-400">
                    Created by{' '}
                    <span className={cn('font-medium', DEPT_COLOR[selectedFolder.createdBy.department])}>
                      {selectedFolder.createdBy.name}
                    </span>
                    {' · '}
                    {selectedFolder.documents.length} file{selectedFolder.documents.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Upload button */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleUpload(e, selectedFolder.id)}
                />
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Upload className="h-4 w-4" />
                  }
                  {uploading ? 'Uploading…' : 'Upload File'}
                </Button>
              </div>
            </div>

            {/* Breadcrumb */}
            <div className="px-6 py-2 flex items-center gap-1 text-xs text-gray-400 border-b border-gray-100 bg-gray-50 shrink-0">
              <span>Document Pool</span>
              <ChevronRight className="h-3 w-3" />
              <span className="font-medium text-gray-600">{selectedFolder.name}</span>
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedFolder.documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16">
                  <Upload className="h-12 w-12 mb-3 text-gray-200" />
                  <p className="font-medium text-gray-500">No files yet</p>
                  <p className="text-sm mt-1">Click <span className="font-medium">Upload File</span> to add documents</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {selectedFolder.documents.map(renderFileRow)}
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}

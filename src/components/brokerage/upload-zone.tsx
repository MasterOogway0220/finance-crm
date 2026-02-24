'use client'
import { useState, useRef, DragEvent } from 'react'
import { Upload, FileSpreadsheet, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface UploadZoneProps {
  onFile: (file: File) => void
  accept?: string
  maxSizeMB?: number
}

export function UploadZone({ onFile, accept = '.csv,.xlsx,.xls', maxSizeMB = 10 }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    setError('')
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File size must be under ${maxSizeMB}MB`)
      return
    }
    setSelectedFile(file)
    onFile(file)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const clearFile = () => {
    setSelectedFile(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  if (selectedFile) {
    return (
      <div className="border-2 border-green-300 bg-green-50 rounded-lg p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-8 w-8 text-green-600" />
          <div>
            <p className="font-medium text-gray-800">{selectedFile.name}</p>
            <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={clearFile}>
          <X className="h-4 w-4 text-gray-500" />
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        )}
      >
        <Upload className={cn('h-10 w-10 mx-auto mb-3', isDragging ? 'text-blue-500' : 'text-gray-400')} />
        <p className="text-sm font-medium text-gray-700">
          Drop your brokerage file here or{' '}
          <span className="text-blue-600 underline">click to browse</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">Accepts: CSV, XLSX, XLS — Max {maxSizeMB}MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}

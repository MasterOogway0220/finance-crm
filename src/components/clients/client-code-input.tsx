'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { validateClientCode } from '@/lib/client-code-validator'
import { CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClientCodeInputProps {
  value: string
  onChange: (value: string) => void
  error?: string
  className?: string
}

export function ClientCodeInput({ value, onChange, error, className }: ClientCodeInputProps) {
  const [touched, setTouched] = useState(false)
  const isValid = value.length > 0 && validateClientCode(value.toUpperCase())
  const isInvalid = touched && value.length > 0 && !validateClientCode(value.toUpperCase())

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>
        Client Code <span className="text-red-500">*</span>
        <span className="ml-2 text-xs text-gray-400 font-normal">(e.g. 18K099, 91383117, 18KS008)</span>
      </Label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onBlur={() => setTouched(true)}
          placeholder="Enter client code"
          className={cn(
            'pr-8',
            isValid && 'border-green-500 focus-visible:ring-green-500',
            isInvalid && 'border-red-500 focus-visible:ring-red-500',
            error && 'border-red-500'
          )}
        />
        {value.length > 0 && touched && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            {isValid ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
          </div>
        )}
      </div>
      {(isInvalid || error) && (
        <p className="text-xs text-red-500">
          {error || 'Invalid client code format. Accepted: 18K099 (2 digits + letter + 3 digits), 91383117 (8 digits), 18KS008 (2 digits + 1–5 letters + 3 digits)'}
        </p>
      )}
    </div>
  )
}

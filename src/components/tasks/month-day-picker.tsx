'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

// Picks a day of the month (1–31), not a calendar date — a recurring assignment
// repeats every month, so weekday columns would be wrong for every month but one.
export function MonthDayPicker({
  value,
  onChange,
  min,
  error,
  placeholder = 'Pick a day',
}: {
  value: string
  onChange: (day: string) => void
  min?: number
  error?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const day = parseInt(value, 10)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'w-full h-10 justify-start font-normal text-sm',
            !day && 'text-gray-400',
            error && 'border-red-400',
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-gray-400" />
          {day ? `${ordinal(day)} of every month` : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <Button
              key={d}
              type="button"
              variant={d === day ? 'default' : 'ghost'}
              size="icon"
              disabled={min ? d < min : false}
              className="h-8 w-8 text-sm font-normal"
              onClick={() => { onChange(String(d)); setOpen(false) }}
            >
              {d}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

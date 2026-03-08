'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronsUpDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

interface ClientOption {
  id: string
  clientCode: string
  name: string
}

interface ClientSearchComboboxProps {
  value: string
  onSelect: (client: ClientOption | null) => void
  department?: string
  disabled?: boolean
}

export function ClientSearchCombobox({ value, onSelect, department, disabled }: ClientSearchComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (search.length < 1) {
      setOptions([])
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams({ q: search })
      if (department) params.set('department', department)
      fetch(`/api/clients/search?${params}`)
        .then((r) => r.json())
        .then((d) => { if (d.success) setOptions(d.data) })
        .finally(() => setLoading(false))
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, department])

  const selectedLabel = value || 'Select client...'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type client code..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Searching...</div>
            ) : options.length === 0 ? (
              <CommandEmpty>{search.length < 1 ? 'Start typing...' : 'No clients found.'}</CommandEmpty>
            ) : (
              <CommandGroup>
                {options.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={client.clientCode}
                    onSelect={() => {
                      onSelect(client)
                      setOpen(false)
                      setSearch('')
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === client.clientCode ? 'opacity-100' : 'opacity-0')} />
                    <span className="font-medium">{client.clientCode}</span>
                    <span className="ml-2 text-muted-foreground">{client.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

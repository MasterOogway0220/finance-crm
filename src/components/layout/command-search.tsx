'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Users, CheckSquare, UserCog, Loader2 } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResultItem {
  id: string
  primaryText: string
  secondaryText?: string
  href: string
}

interface SearchResults {
  clients: SearchResultItem[]
  tasks: SearchResultItem[]
  employees: SearchResultItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ResultSkeleton() {
  return (
    <div className="space-y-2 px-2 py-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 flex-1 rounded" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CommandSearch
// ---------------------------------------------------------------------------

interface CommandSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  // Debounced search
  const runSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null)
      setIsLoading(false)
      return
    }

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
      const data = await res.json()
      if (data.success) {
        setResults(data.data as SearchResults)
      }
    } catch (err: unknown) {
      // Ignore abort errors
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Search failed', err)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runSearch(query)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  const handleSelect = (href: string) => {
    router.push(href)
    onOpenChange(false)
    setQuery('')
    setResults(null)
  }

  const handleOpenChange = (value: boolean) => {
    onOpenChange(value)
    if (!value) {
      setQuery('')
      setResults(null)
    }
  }

  const hasResults =
    results &&
    (results.clients.length > 0 || results.tasks.length > 0 || results.employees.length > 0)

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} title="Global Search">
      <CommandInput
        placeholder="Search clients, tasks, employees…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {isLoading && <ResultSkeleton />}

        {!isLoading && query.length >= 2 && !hasResults && (
          <CommandEmpty>No results found for &quot;{query}&quot;.</CommandEmpty>
        )}

        {!isLoading && query.length < 2 && (
          <CommandEmpty className="text-gray-400">
            Type at least 2 characters to search…
          </CommandEmpty>
        )}

        {!isLoading && results && results.clients.length > 0 && (
          <>
            <CommandGroup heading="Clients">
              {results.clients.map((item) => (
                <CommandItem
                  key={`client-${item.id}`}
                  value={`client-${item.id}-${item.primaryText}`}
                  onSelect={() => handleSelect(item.href)}
                >
                  <Users className="h-4 w-4 shrink-0 text-blue-500" />
                  <span className="flex-1 truncate font-medium text-sm">{item.primaryText}</span>
                  {item.secondaryText && (
                    <span className="ml-2 truncate text-xs text-gray-400">
                      {item.secondaryText}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {(results.tasks.length > 0 || results.employees.length > 0) && (
              <CommandSeparator />
            )}
          </>
        )}

        {!isLoading && results && results.tasks.length > 0 && (
          <>
            <CommandGroup heading="Tasks">
              {results.tasks.map((item) => (
                <CommandItem
                  key={`task-${item.id}`}
                  value={`task-${item.id}-${item.primaryText}`}
                  onSelect={() => handleSelect(item.href)}
                >
                  <CheckSquare className="h-4 w-4 shrink-0 text-amber-500" />
                  <span className="flex-1 truncate font-medium text-sm">{item.primaryText}</span>
                  {item.secondaryText && (
                    <span className="ml-2 truncate text-xs text-gray-400">
                      {item.secondaryText}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {results.employees.length > 0 && <CommandSeparator />}
          </>
        )}

        {!isLoading && results && results.employees.length > 0 && (
          <CommandGroup heading="Employees">
            {results.employees.map((item) => (
              <CommandItem
                key={`employee-${item.id}`}
                value={`employee-${item.id}-${item.primaryText}`}
                onSelect={() => handleSelect(item.href)}
              >
                <UserCog className="h-4 w-4 shrink-0 text-purple-500" />
                <span className="flex-1 truncate font-medium text-sm">{item.primaryText}</span>
                {item.secondaryText && (
                  <span className="ml-2 truncate text-xs text-gray-400">
                    {item.secondaryText}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

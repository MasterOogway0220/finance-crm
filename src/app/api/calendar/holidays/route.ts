import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// NSE/BSE trading holidays hardcoded for reliability (official list per NSE circulars)
const NSE_HOLIDAYS: Record<string, string> = {
  // 2025
  '2025-02-26': 'Mahashivratri',
  '2025-03-14': 'Holi',
  '2025-03-31': 'Id-Ul-Fitr (Ramzan Id)',
  '2025-04-10': 'Shri Mahavir Jayanti',
  '2025-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
  '2025-04-18': 'Good Friday',
  '2025-05-01': 'Maharashtra Day',
  '2025-06-07': 'Id-Ul-Adha (Bakri Id)',
  '2025-07-06': 'Muharram',
  '2025-08-15': 'Independence Day',
  '2025-08-27': 'Ganesh Chaturthi',
  '2025-10-02': 'Mahatma Gandhi Jayanti / Dussehra',
  '2025-10-20': 'Diwali - Laxmi Pujan',
  '2025-10-21': 'Diwali - Balipratipada',
  '2025-11-05': 'Prakash Gurpurb Sri Guru Nanak Dev Ji',
  '2025-12-25': 'Christmas',
  // 2026
  '2026-01-14': 'Makar Sankranti / Pongal',
  '2026-01-26': 'Republic Day',
  '2026-03-03': 'Holi',
  '2026-03-20': 'Id-Ul-Fitr (Ramzan Id)',
  '2026-04-02': 'Shri Ram Navami',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
  '2026-05-01': 'Maharashtra Day',
  '2026-06-27': 'Id-Ul-Adha (Bakri Id)',
  '2026-07-25': 'Muharram',
  '2026-08-15': 'Independence Day',
  '2026-09-14': 'Ganesh Chaturthi',
  '2026-10-02': 'Mahatma Gandhi Jayanti',
  '2026-10-19': 'Dussehra',
  '2026-11-08': 'Diwali - Laxmi Pujan',
  '2026-11-09': 'Diwali - Balipratipada',
  '2026-11-25': 'Prakash Gurpurb Sri Guru Nanak Dev Ji',
  '2026-12-25': 'Christmas',
}

// In-memory cache: { year -> { holidays, fetchedAt } }
const cache = new Map<number, { holidays: HolidayEntry[]; fetchedAt: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

interface HolidayEntry {
  date: string   // YYYY-MM-DD
  name: string
  type: 'market' | 'bank'
}

async function fetchHolidays(year: number): Promise<HolidayEntry[]> {
  const cached = cache.get(year)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.holidays
  }

  const merged = new Map<string, HolidayEntry>()

  // Add hardcoded NSE holidays for the requested year
  for (const [date, name] of Object.entries(NSE_HOLIDAYS)) {
    if (date.startsWith(String(year))) {
      merged.set(date, { date, name, type: 'market' })
    }
  }

  // Fetch Indian public holidays from nager.at (free, no API key)
  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/IN`,
      { next: { revalidate: 86400 } }
    )
    if (res.ok) {
      const data: { date: string; name: string; localName: string }[] = await res.json()
      for (const h of data) {
        if (!merged.has(h.date)) {
          merged.set(h.date, { date: h.date, name: h.localName || h.name, type: 'bank' })
        }
      }
    }
  } catch {
    // If network fails, fall back to hardcoded list only
  }

  const holidays = Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date))
  cache.set(year, { holidays, fetchedAt: Date.now() })
  return holidays
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const year = parseInt(request.nextUrl.searchParams.get('year') ?? String(new Date().getFullYear()))
    if (isNaN(year) || year < 2020 || year > 2030) {
      return NextResponse.json({ success: false, error: 'Invalid year' }, { status: 400 })
    }

    const holidays = await fetchHolidays(year)
    return NextResponse.json({ success: true, data: holidays })
  } catch (error) {
    console.error('[GET /api/calendar/holidays]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

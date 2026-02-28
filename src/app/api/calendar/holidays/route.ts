import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// Simplified holidays API — returns only Saturday/Sunday as non-working days.
// Stock market holiday API was inaccurate; this will be upgraded to a paid API
// if approved. For now, only weekends are treated as holidays.
// The frontend already handles weekend styling via isWeekend() in date-fns.

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

    // Return empty holidays — weekends (Sat/Sun) are handled on the frontend
    // When a paid holiday API is integrated, populate this array with market/bank holidays
    return NextResponse.json({ success: true, data: [] })
  } catch (error) {
    console.error('[GET /api/calendar/holidays]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

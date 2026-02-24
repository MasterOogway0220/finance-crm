import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const isLoggedIn = !!session

  const isAuthRoute = nextUrl.pathname.startsWith('/login')
  const isApiRoute = nextUrl.pathname.startsWith('/api')
  const isPublicRoute = isAuthRoute || isApiRoute

  if (isPublicRoute) {
    if (isAuthRoute && isLoggedIn) {
      const role = session?.user?.role
      return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl))
    }
    return NextResponse.next()
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', nextUrl))
  }

  const role = session?.user?.role
  const path = nextUrl.pathname

  // Role-based access control
  if (path.startsWith('/equity') && role !== 'EQUITY_DEALER') {
    return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl))
  }
  if (path.startsWith('/mf') && role !== 'MF_DEALER') {
    return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl))
  }
  if (path.startsWith('/backoffice') && role !== 'BACK_OFFICE') {
    return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl))
  }
  if ((path.startsWith('/dashboard') || path.startsWith('/brokerage') || path.startsWith('/masters')) &&
    role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl))
  }

  return NextResponse.next()
})

function getDashboardPath(role?: string): string {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return '/dashboard'
    case 'EQUITY_DEALER':
      return '/equity/dashboard'
    case 'MF_DEALER':
      return '/mf/dashboard'
    case 'BACK_OFFICE':
      return '/backoffice/dashboard'
    default:
      return '/login'
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

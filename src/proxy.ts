import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { canViewAdmin, shouldBlockMutation } from '@/lib/roles'

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const isLoggedIn = !!session

  const isAuthRoute = nextUrl.pathname === '/login' || nextUrl.pathname.startsWith('/login/')
  const isApiRoute = nextUrl.pathname.startsWith('/api')
  const isPublicRoute = isAuthRoute || isApiRoute

  // Read-only (Chartered Accountant) write boundary — runs for API *and* page
  // routes, before the API short-circuit below. Any state-changing method is
  // rejected; /api/auth/* is exempt so the CA can still log out.
  if (isLoggedIn && shouldBlockMutation(session?.user?.role, req.method, nextUrl.pathname)) {
    return NextResponse.json({ success: false, error: 'Read-only access' }, { status: 403 })
  }

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
  const secondaryRole = session?.user?.secondaryRole
  const path = nextUrl.pathname

  // Role-based access control — check both primary and secondary roles so dual-role
  // employees can access pages for either of their roles
  if (path.startsWith('/equity') && role !== 'EQUITY_DEALER' && secondaryRole !== 'EQUITY_DEALER') {
    return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl))
  }
  if (path.startsWith('/mf') && role !== 'MF_DEALER' && secondaryRole !== 'MF_DEALER') {
    return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl))
  }
  if (path.startsWith('/backoffice') && role !== 'BACK_OFFICE' && secondaryRole !== 'BACK_OFFICE') {
    return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl))
  }
  if ((path.startsWith('/dashboard') || path.startsWith('/brokerage') || path.startsWith('/masters')) &&
    !canViewAdmin(role) && !canViewAdmin(secondaryRole)) {
    return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl))
  }

  return NextResponse.next()
})

function getDashboardPath(role?: string): string {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'CHARTERED_ACCOUNTANT':
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
  // Exclude Next internals and static public assets (images, fonts) so requests
  // for files like /logo.png aren't run through auth and redirected to /login.
  // Page and /api routes have no file extension, so they are still matched and
  // the read-only mutation block stays in force.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|bmp|avif|woff2?|ttf)$).*)'],
}

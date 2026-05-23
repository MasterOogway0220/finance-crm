import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Role, Department } from '@prisma/client'
import { getEffectiveRole } from '@/lib/roles'
export { getEffectiveRole } from '@/lib/roles'

/**
 * Returns the role the user is currently acting as in the UI.
 *
 * Reads the `activeRole` cookie (set by the client when the user picks a role
 * via the login picker or topbar switcher). If the cookie names one of the
 * user's actual roles (primary or secondary) we honour it. Otherwise we fall
 * back to the highest-priority role from getEffectiveRole().
 *
 * Use this in API routes for "is this user currently acting as admin?" checks.
 * Use getEffectiveRole when you need the user's maximum privilege regardless
 * of UI state.
 */
export async function getActiveRole(
  user: { role: Role; secondaryRole?: Role | null },
): Promise<Role> {
  try {
    const cookieStore = await cookies()
    const cookieRole = cookieStore.get('activeRole')?.value as Role | undefined
    if (cookieRole) {
      const validRoles = [user.role, user.secondaryRole].filter(Boolean) as Role[]
      if (validRoles.includes(cookieRole)) return cookieRole
    }
  } catch {
    // cookies() can throw outside a request scope — fall through to the default
  }
  return getEffectiveRole(user)
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          const employee = await prisma.employee.findUnique({
            where: { email: credentials.email as string },
          })

          if (!employee || !employee.isActive) {
            return null
          }

          const isValid = await bcrypt.compare(credentials.password as string, employee.password)
          if (!isValid) return null

          return {
            id: employee.id,
            email: employee.email,
            name: employee.name,
            role: employee.role,
            secondaryRole: employee.secondaryRole ?? null,
            department: employee.department,
            designation: employee.designation,
          }
        } catch (err) {
          console.error('[authorize] DB error:', err)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: Role }).role
        token.secondaryRole = (user as { secondaryRole: Role | null }).secondaryRole ?? null
        token.department = (user as { department: Department }).department
        token.designation = (user as { designation: string }).designation
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as Role
        session.user.secondaryRole = (token.secondaryRole as Role | null) ?? null
        session.user.department = token.department as Department
        session.user.designation = token.designation as string
      }
      return session
    },
  },
  events: {
    async signIn({ user }) {
      try {
        const userId = user.id!
        // Close any previously open login logs (orphaned from crashes / missed logouts)
        await prisma.employeeLoginLog.updateMany({
          where: { employeeId: userId, logoutAt: null },
          data: { logoutAt: new Date() },
        })
        // Create fresh login log
        await prisma.employeeLoginLog.create({
          data: { employeeId: userId },
        })
        await prisma.employee.update({
          where: { id: userId },
          data: { lastSeenAt: new Date() },
        })
      } catch (err) {
        console.error('[auth:signIn event]', err)
      }
    },
    async signOut(message) {
      const token = 'token' in message ? message.token : null
      const userId = token?.id as string | undefined
      if (!userId) return
      try {
        // Close all open login logs for this user
        await prisma.employeeLoginLog.updateMany({
          where: { employeeId: userId, logoutAt: null },
          data: { logoutAt: new Date() },
        })
      } catch (err) {
        console.error('[auth:signOut event]', err)
      }
    },
  },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
})

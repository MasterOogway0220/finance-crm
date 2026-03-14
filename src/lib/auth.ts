import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { Role, Department } from '@prisma/client'
export { getEffectiveRole } from '@/lib/roles'

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

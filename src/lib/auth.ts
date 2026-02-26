import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { Role, Department } from '@prisma/client'

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
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
})

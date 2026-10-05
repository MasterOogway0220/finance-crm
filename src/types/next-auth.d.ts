import { Role, Department } from '@prisma/client'

declare module 'next-auth' {
  interface User {
    id: string
    role: Role
    secondaryRole: Role | null
    department: Department
    designation: string
  }

  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: Role
      secondaryRole: Role | null
      department: Department
      designation: string
      sessionEndsAt: string // ISO; the 6 PM (or, after 6 PM, midnight) IST cut-off
      recorded: boolean // false for a login after 6 PM, whose time isn't recorded
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: Role
    secondaryRole: Role | null
    department: Department
    designation: string
  }
}

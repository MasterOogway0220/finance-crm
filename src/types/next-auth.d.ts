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

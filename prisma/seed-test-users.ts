/**
 * Local-only test users — one per role.
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-test-users.ts
 *
 * All accounts share the same password: Test@123
 * Emails are *@test.local so they are clearly non-prod.
 *
 * Upsert is idempotent: re-running won't create duplicates, and will
 * NOT overwrite the password if you've since changed it.
 */
import { PrismaClient, Department, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const TEST_PASSWORD = 'Test@123'

const USERS: Array<{
  name: string
  email: string
  phone: string
  department: Department
  designation: string
  role: Role
  secondaryRole?: Role
}> = [
  {
    name: 'Test Super Admin',
    email: 'superadmin@test.local',
    phone: '0000000001',
    department: Department.ADMIN,
    designation: 'Super Admin',
    role: Role.SUPER_ADMIN,
  },
  {
    name: 'Test Admin',
    email: 'admin@test.local',
    phone: '0000000002',
    department: Department.ADMIN,
    designation: 'Admin',
    role: Role.ADMIN,
  },
  {
    name: 'Test Equity Dealer',
    email: 'equity@test.local',
    phone: '0000000003',
    department: Department.EQUITY,
    designation: 'Equity Dealer',
    role: Role.EQUITY_DEALER,
  },
  {
    name: 'Test MF Dealer',
    email: 'mf@test.local',
    phone: '0000000004',
    department: Department.MUTUAL_FUND,
    designation: 'Mutual Fund Dealer',
    role: Role.MF_DEALER,
  },
  {
    name: 'Test Back Office',
    email: 'backoffice@test.local',
    phone: '0000000005',
    department: Department.BACK_OFFICE,
    designation: 'Back Office',
    role: Role.BACK_OFFICE,
  },
]

async function main() {
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12)

  for (const u of USERS) {
    await prisma.employee.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        phone: u.phone,
        department: u.department,
        designation: u.designation,
        role: u.role,
        secondaryRole: u.secondaryRole ?? null,
        isActive: true,
      },
      create: {
        name: u.name,
        email: u.email,
        phone: u.phone,
        password: hashedPassword,
        department: u.department,
        designation: u.designation,
        role: u.role,
        secondaryRole: u.secondaryRole ?? null,
      },
    })
    console.log(`  ✓ ${u.role.padEnd(14)}  ${u.email}`)
  }

  console.log('')
  console.log(`  Password for all test users: ${TEST_PASSWORD}`)
  console.log('')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

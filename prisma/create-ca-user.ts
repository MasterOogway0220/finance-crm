import { PrismaClient, Role, Department } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

/**
 * Creates (or updates) the read-only Chartered Accountant login.
 *
 * Credentials are read from environment variables so no personal data or
 * passwords live in the repo. Idempotent: re-running with the same email
 * updates the existing record.
 *
 * Usage:
 *   CA_NAME='...' CA_EMAIL='...' CA_PHONE='...' CA_PASSWORD='...' \
 *     npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/create-ca-user.ts
 */
async function main() {
  const name = process.env.CA_NAME
  const email = process.env.CA_EMAIL
  const phone = process.env.CA_PHONE
  const password = process.env.CA_PASSWORD

  if (!name || !email || !phone || !password) {
    throw new Error('Set CA_NAME, CA_EMAIL, CA_PHONE and CA_PASSWORD env vars')
  }

  const hashedPassword = await bcrypt.hash(password, 12)

  const data = {
    name,
    phone,
    password: hashedPassword,
    role: Role.CHARTERED_ACCOUNTANT,
    secondaryRole: null,
    department: Department.ADMIN,
    designation: 'Chartered Accountant',
    isActive: true,
  }

  const employee = await prisma.employee.upsert({
    where: { email },
    update: data,
    create: { email, ...data },
  })

  console.log(`CA account ready: ${employee.email} (id ${employee.id})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

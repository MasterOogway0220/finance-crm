import { PrismaClient, Department, Role, ClientStatus, ClientRemark, MFClientStatus, MFClientRemark, TaskStatus, TaskPriority } from '@prisma/client'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash('Finance@123', 12)

  // Seed Employees
  const employees = await Promise.all([
    // Equity Department
    prisma.employee.upsert({
      where: { email: 'kedaroak_13@rediffmail.com' },
      update: {},
      create: {
        name: 'Kedar Dattatraya Oak',
        email: 'kedaroak_13@rediffmail.com',
        phone: '9820769466',
        password: hashedPassword,
        department: Department.EQUITY,
        designation: 'Director',
        role: Role.EQUITY_DEALER,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'sarveshoak3@gmail.com' },
      update: {},
      create: {
        name: 'Sarvesh Kedar Oak',
        email: 'sarveshoak3@gmail.com',
        phone: '7506878954',
        password: hashedPassword,
        department: Department.EQUITY,
        designation: 'Director',
        role: Role.EQUITY_DEALER,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'reshmamyerunkar@gmail.com' },
      update: {},
      create: {
        name: 'Reshma Manoj Verunkar',
        email: 'reshmamyerunkar@gmail.com',
        phone: '9870304188',
        password: hashedPassword,
        department: Department.EQUITY,
        designation: 'Equity Dealer',
        role: Role.EQUITY_DEALER,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'patilkaran128@gmail.com' },
      update: {},
      create: {
        name: 'Karan Ganesh Patil',
        email: 'patilkaran128@gmail.com',
        phone: '8355906043',
        password: hashedPassword,
        department: Department.EQUITY,
        designation: 'Equity Dealer',
        role: Role.EQUITY_DEALER,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'vinitgollar07@gmail.com' },
      update: {},
      create: {
        name: 'Vinit Vijay Gollar',
        email: 'vinitgollar07@gmail.com',
        phone: '9920854923',
        password: hashedPassword,
        department: Department.EQUITY,
        designation: 'Equity Dealer',
        role: Role.EQUITY_DEALER,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'pethe.shweta95@gmail.com' },
      update: {},
      create: {
        name: 'Shweta Arvind Pethe',
        email: 'pethe.shweta95@gmail.com',
        phone: '9820401832',
        password: hashedPassword,
        department: Department.EQUITY,
        designation: 'Equity Dealer',
        role: Role.EQUITY_DEALER,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'kedarmulyeo1@gmail.com' },
      update: {},
      create: {
        name: 'Kedar Niranjan Mulye',
        email: 'kedarmulyeo1@gmail.com',
        phone: '7506149415',
        password: hashedPassword,
        department: Department.EQUITY,
        designation: 'Equity Dealer',
        role: Role.EQUITY_DEALER,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'vedant_dummy18@gmail.com' },
      update: {},
      create: {
        name: 'Vedant',
        email: 'vedant_dummy18@gmail.com',
        phone: '0000000000',
        password: hashedPassword,
        department: Department.EQUITY,
        designation: 'Equity Dealer',
        role: Role.EQUITY_DEALER,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'karad_dummy18@gmail.com' },
      update: {},
      create: {
        name: 'Karad',
        email: 'karad_dummy18@gmail.com',
        phone: '9998887771',
        password: hashedPassword,
        department: Department.EQUITY,
        designation: 'Equity Dealer',
        role: Role.EQUITY_DEALER,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'pruthav111@gmail.com' },
      update: {},
      create: {
        name: 'Pune',
        email: 'pruthav111@gmail.com',
        phone: '8668547746',
        password: hashedPassword,
        department: Department.EQUITY,
        designation: 'Equity Dealer',
        role: Role.EQUITY_DEALER,
      },
    }),
    // Mutual Fund Department
    prisma.employee.upsert({
      where: { email: 'gayatri.ghadi123@gmail.com' },
      update: {},
      create: {
        name: 'Gayatri Ganesh Ghadi',
        email: 'gayatri.ghadi123@gmail.com',
        phone: '9870696706',
        password: hashedPassword,
        department: Department.MUTUAL_FUND,
        designation: 'Mutual Fund Dealer',
        role: Role.MF_DEALER,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'risha.tawade@yahoo.co.in' },
      update: {},
      create: {
        name: 'Rishita Rajesh Tawde',
        email: 'risha.tawade@yahoo.co.in',
        phone: '9869081424',
        password: hashedPassword,
        department: Department.MUTUAL_FUND,
        designation: 'Mutual Fund Dealer',
        role: Role.MF_DEALER,
      },
    }),
    // Back-Office Department
    prisma.employee.upsert({
      where: { email: 'akshita15work@gmail.com' },
      update: {},
      create: {
        name: 'Akshita Raju Ramugade',
        email: 'akshita15work@gmail.com',
        phone: '9326212377',
        password: hashedPassword,
        department: Department.BACK_OFFICE,
        designation: 'Back Office',
        role: Role.BACK_OFFICE,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'vishakha.kul.work@gmail.com' },
      update: {},
      create: {
        name: 'Vishakha Narayan Kulkarni',
        email: 'vishakha.kul.work@gmail.com',
        phone: '9730072211',
        password: hashedPassword,
        department: Department.BACK_OFFICE,
        designation: 'Admin',
        role: Role.ADMIN,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'pradipmahadik1982@gmail.com' },
      update: {},
      create: {
        name: 'Pradip Vinayak Mahadik',
        email: 'pradipmahadik1982@gmail.com',
        phone: '9867179860',
        password: hashedPassword,
        department: Department.BACK_OFFICE,
        designation: 'Back Office',
        role: Role.BACK_OFFICE,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'adeshmhatre008@gmail.com' },
      update: {},
      create: {
        name: 'Adesh Datta Mhatre',
        email: 'adeshmhatre008@gmail.com',
        phone: '7219026123',
        password: hashedPassword,
        department: Department.BACK_OFFICE,
        designation: 'Back Office',
        role: Role.BACK_OFFICE,
      },
    }),
    prisma.employee.upsert({
      where: { email: 'rutviksovilkar2000@gmail.com' },
      update: {},
      create: {
        name: 'Rutvik Pravin Sovilkar',
        email: 'rutviksovilkar2000@gmail.com',
        phone: '8767549873',
        password: hashedPassword,
        department: Department.BACK_OFFICE,
        designation: 'Back Office',
        role: Role.BACK_OFFICE,
      },
    }),
  ])

  console.log(`Seeded ${employees.length} employees`)

  // Get operator IDs for client seeding
  const operatorEmailMap: Record<string, string> = {
    'Shweta': 'pethe.shweta95@gmail.com',
    'KM': 'kedarmulyeo1@gmail.com',
    'Reshma': 'reshmamyerunkar@gmail.com',
    'Sarvesh': 'sarveshoak3@gmail.com',
    'Karan': 'patilkaran128@gmail.com',
    'Vinit': 'vinitgollar07@gmail.com',
    'Kedar Sir': 'kedaroak_13@rediffmail.com',
    'Vedant': 'vedant_dummy18@gmail.com',
    'Karad': 'karad_dummy18@gmail.com',
    'Pune': 'pruthav111@gmail.com',
  }

  const operatorIdMap: Record<string, string> = {}
  for (const [name, email] of Object.entries(operatorEmailMap)) {
    const emp = await prisma.employee.findUnique({ where: { email } })
    if (!emp) throw new Error(`Employee not found for operator "${name}" (${email})`)
    operatorIdMap[name] = emp.id
  }

  const admin = await prisma.employee.findUnique({ where: { email: 'vishakha.kul.work@gmail.com' } })
  const backOffice1 = await prisma.employee.findUnique({ where: { email: 'akshita15work@gmail.com' } })

  if (!admin || !backOffice1) {
    throw new Error('Required employees not found')
  }

  // Unlink clients from brokerage details, then delete all existing clients
  await prisma.brokerageDetail.updateMany({
    where: { clientId: { not: null } },
    data: { clientId: null },
  })
  await prisma.client.deleteMany({})
  console.log('Cleared existing clients')

  // Load clients from CLIENT_MASTER.csv
  const csvPath = path.join(__dirname, '..', 'crm-documents', 'CLIENT_MASTER.csv')
  const csvContent = fs.readFileSync(csvPath, 'utf8')
  const csvLines = csvContent.split('\n').slice(1).filter(l => l.trim())

  function parseName(fullName: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 2) {
      return { firstName: parts[0], middleName: undefined, lastName: parts[1] }
    }
    // 3+ words: first = firstName, last = lastName, middle = everything in between
    const firstName = parts[0]
    const lastName = parts[parts.length - 1]
    const middleName = parts.slice(1, -1).join(' ')
    return { firstName, middleName, lastName }
  }

  let imported = 0
  let skipped = 0

  for (const line of csvLines) {
    const cols = line.replace(/\r/g, '').replace(/\uFEFF/g, '').split(',')
    const clientCode = (cols[0] || '').trim()
    const clientName = (cols[1] || '').trim()
    const operator = (cols[2] || '').trim()

    if (!clientCode || !clientName || !operator) {
      skipped++
      continue
    }

    const operatorId = operatorIdMap[operator]
    if (!operatorId) {
      console.warn(`Skipping client ${clientCode}: unknown operator "${operator}"`)
      skipped++
      continue
    }

    const { firstName, middleName, lastName } = parseName(clientName)

    await prisma.client.upsert({
      where: { clientCode },
      update: {},
      create: {
        clientCode,
        firstName,
        middleName,
        lastName,
        phone: '0000000000',
        department: Department.EQUITY,
        operatorId,
        status: ClientStatus.NOT_TRADED,
        remark: ClientRemark.DID_NOT_ANSWER,
      },
    })
    imported++
  }

  console.log(`Imported ${imported} clients from CSV (${skipped} skipped)`)

  // Seed sample tasks
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const sampleTasks = [
    {
      title: 'Follow up with inactive equity clients',
      description: 'Call all clients with DID_NOT_ANSWER status and update their trading status. Focus on clients who have not traded this month.',
      assignedToId: operatorIdMap['Reshma'],
      assignedById: admin.id,
      deadline: nextWeek,
      status: TaskStatus.PENDING,
      priority: TaskPriority.HIGH,
    },
    {
      title: 'Reconcile brokerage data for January',
      description: 'Cross-check all brokerage entries for January with the SNAP ERP system and report discrepancies.',
      assignedToId: backOffice1.id,
      assignedById: admin.id,
      deadline: tomorrow,
      status: TaskStatus.PENDING,
      priority: TaskPriority.HIGH,
    },
    {
      title: 'Update client KYC documents',
      description: 'Collect and upload updated KYC documents for all clients whose documents expire this quarter.',
      assignedToId: operatorIdMap['Karan'],
      assignedById: admin.id,
      deadline: nextWeek,
      status: TaskStatus.PENDING,
      priority: TaskPriority.MEDIUM,
    },
    {
      title: 'Monthly MF performance report',
      description: 'Prepare the monthly mutual fund performance report for all active clients and share with the admin team.',
      assignedToId: operatorIdMap['Reshma'],
      assignedById: admin.id,
      deadline: tomorrow,
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.MEDIUM,
      completedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    },
    {
      title: 'Process pending client transfers',
      description: 'Process the backlog of client transfer requests that were submitted last week.',
      assignedToId: backOffice1.id,
      assignedById: admin.id,
      deadline: yesterday,
      status: TaskStatus.EXPIRED,
      priority: TaskPriority.LOW,
    },
  ]

  for (const task of sampleTasks) {
    const existing = await prisma.task.findFirst({ where: { title: task.title } })
    if (!existing) {
      await prisma.task.create({ data: task })
    }
  }

  console.log('Seeded tasks')
  console.log('✅ Database seeded successfully!')
  console.log('Default password for all users: Finance@123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

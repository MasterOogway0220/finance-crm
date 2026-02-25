import { PrismaClient, Department, Role, ClientStatus, ClientRemark, MFClientStatus, MFClientRemark, TaskStatus, TaskPriority } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
  const reshma = await prisma.employee.findUnique({ where: { email: 'reshmamyerunkar@gmail.com' } })
  const karan = await prisma.employee.findUnique({ where: { email: 'patilkaran128@gmail.com' } })
  const vinit = await prisma.employee.findUnique({ where: { email: 'vinitgollar07@gmail.com' } })
  const shweta = await prisma.employee.findUnique({ where: { email: 'pethe.shweta95@gmail.com' } })
  const kedarM = await prisma.employee.findUnique({ where: { email: 'kedarmulyeo1@gmail.com' } })
  const gayatri = await prisma.employee.findUnique({ where: { email: 'gayatri.ghadi123@gmail.com' } })
  const rishita = await prisma.employee.findUnique({ where: { email: 'risha.tawade@yahoo.co.in' } })
  const admin = await prisma.employee.findUnique({ where: { email: 'vishakha.kul.work@gmail.com' } })
  const backOffice1 = await prisma.employee.findUnique({ where: { email: 'akshita15work@gmail.com' } })

  if (!reshma || !karan || !vinit || !shweta || !kedarM || !gayatri || !rishita || !admin || !backOffice1) {
    throw new Error('Required employees not found')
  }

  // Seed Equity Clients
  const equityClients = [
    { clientCode: '18K001', firstName: 'Amit', middleName: 'Ramesh', lastName: 'Sharma', phone: '9876543210', operatorId: reshma.id, status: ClientStatus.TRADED, remark: ClientRemark.SUCCESSFULLY_TRADED },
    { clientCode: '18K002', firstName: 'Priya', middleName: 'Suresh', lastName: 'Patel', phone: '9876543211', operatorId: reshma.id, status: ClientStatus.NOT_TRADED, remark: ClientRemark.DID_NOT_ANSWER },
    { clientCode: '18K003', firstName: 'Rahul', middleName: '', lastName: 'Verma', phone: '9876543212', operatorId: reshma.id, status: ClientStatus.NOT_TRADED, remark: ClientRemark.NO_FUNDS_FOR_TRADING },
    { clientCode: '18K004', firstName: 'Sunita', middleName: 'Prakash', lastName: 'Singh', phone: '9876543213', operatorId: reshma.id, status: ClientStatus.TRADED, remark: ClientRemark.SUCCESSFULLY_TRADED },
    { clientCode: '91383117', firstName: 'Vikram', middleName: '', lastName: 'Mehta', phone: '9876543214', operatorId: karan.id, status: ClientStatus.TRADED, remark: ClientRemark.SUCCESSFULLY_TRADED },
    { clientCode: '91383118', firstName: 'Kavita', middleName: 'Anil', lastName: 'Joshi', phone: '9876543215', operatorId: karan.id, status: ClientStatus.NOT_TRADED, remark: ClientRemark.DID_NOT_ANSWER },
    { clientCode: '91383119', firstName: 'Deepak', middleName: '', lastName: 'Kumar', phone: '9876543216', operatorId: karan.id, status: ClientStatus.NOT_TRADED, remark: ClientRemark.SELF_TRADING },
    { clientCode: '18KS001', firstName: 'Anjali', middleName: 'Ravi', lastName: 'Gupta', phone: '9876543217', operatorId: karan.id, status: ClientStatus.TRADED, remark: ClientRemark.SUCCESSFULLY_TRADED },
    { clientCode: '18KS002', firstName: 'Suresh', middleName: '', lastName: 'Nair', phone: '9876543218', operatorId: vinit.id, status: ClientStatus.TRADED, remark: ClientRemark.SUCCESSFULLY_TRADED },
    { clientCode: '18KS003', firstName: 'Meena', middleName: 'Vijay', lastName: 'Reddy', phone: '9876543219', operatorId: vinit.id, status: ClientStatus.NOT_TRADED, remark: ClientRemark.DID_NOT_ANSWER },
    { clientCode: '18K005', firstName: 'Ravi', middleName: '', lastName: 'Pillai', phone: '9876543220', operatorId: vinit.id, status: ClientStatus.NOT_TRADED, remark: ClientRemark.NO_FUNDS_FOR_TRADING },
    { clientCode: '18K006', firstName: 'Pooja', middleName: 'Sanjay', lastName: 'Desai', phone: '9876543221', operatorId: shweta.id, status: ClientStatus.TRADED, remark: ClientRemark.SUCCESSFULLY_TRADED },
    { clientCode: '18K007', firstName: 'Nikhil', middleName: '', lastName: 'Jain', phone: '9876543222', operatorId: shweta.id, status: ClientStatus.NOT_TRADED, remark: ClientRemark.DID_NOT_ANSWER },
    { clientCode: '91383120', firstName: 'Smita', middleName: 'Mohan', lastName: 'Kulkarni', phone: '9876543223', operatorId: shweta.id, status: ClientStatus.TRADED, remark: ClientRemark.SUCCESSFULLY_TRADED },
    { clientCode: '18KS004', firstName: 'Arun', middleName: '', lastName: 'Bose', phone: '9876543224', operatorId: kedarM.id, status: ClientStatus.NOT_TRADED, remark: ClientRemark.DID_NOT_ANSWER },
    { clientCode: '18KS005', firstName: 'Neha', middleName: 'Girish', lastName: 'Shah', phone: '9876543225', operatorId: kedarM.id, status: ClientStatus.TRADED, remark: ClientRemark.SUCCESSFULLY_TRADED },
    { clientCode: '18K008', firstName: 'Rajesh', middleName: '', lastName: 'Iyer', phone: '9876543226', operatorId: kedarM.id, status: ClientStatus.NOT_TRADED, remark: ClientRemark.SELF_TRADING },
    { clientCode: '18K009', firstName: 'Lata', middleName: 'Krishnan', lastName: 'Menon', phone: '9876543227', operatorId: kedarM.id, status: ClientStatus.TRADED, remark: ClientRemark.SUCCESSFULLY_TRADED },
    { clientCode: '91383121', firstName: 'Vijay', middleName: '', lastName: 'Tiwari', phone: '9876543228', operatorId: reshma.id, status: ClientStatus.NOT_TRADED, remark: ClientRemark.DID_NOT_ANSWER },
    { clientCode: '18KS006', firstName: 'Sonal', middleName: 'Rakesh', lastName: 'Thakur', phone: '9876543229', operatorId: karan.id, status: ClientStatus.NOT_TRADED, remark: ClientRemark.NO_FUNDS_FOR_TRADING },
  ]

  for (const client of equityClients) {
    await prisma.client.upsert({
      where: { clientCode: client.clientCode },
      update: {},
      create: {
        ...client,
        middleName: client.middleName || undefined,
        department: Department.EQUITY,
      },
    })
  }

  // Seed MF Clients
  const mfClients = [
    { clientCode: '18MF001', firstName: 'Harish', middleName: 'Sunil', lastName: 'Pawar', phone: '9876543230', operatorId: gayatri.id, mfStatus: MFClientStatus.ACTIVE, mfRemark: MFClientRemark.INVESTMENT_DONE },
    { clientCode: '18MF002', firstName: 'Jyoti', middleName: '', lastName: 'Chauhan', phone: '9876543231', operatorId: gayatri.id, mfStatus: MFClientStatus.INACTIVE, mfRemark: MFClientRemark.FOLLOW_UP_REQUIRED },
    { clientCode: '18MF003', firstName: 'Mahesh', middleName: 'Balaji', lastName: 'Sawant', phone: '9876543232', operatorId: rishita.id, mfStatus: MFClientStatus.ACTIVE, mfRemark: MFClientRemark.INVESTMENT_DONE },
    { clientCode: '18MF004', firstName: 'Varsha', middleName: '', lastName: 'More', phone: '9876543233', operatorId: rishita.id, mfStatus: MFClientStatus.INACTIVE, mfRemark: MFClientRemark.NOT_INTERESTED },
    { clientCode: '18MF005', firstName: 'Ganesh', middleName: 'Dattatray', lastName: 'Bhosale', phone: '9876543234', operatorId: gayatri.id, mfStatus: MFClientStatus.INACTIVE, mfRemark: MFClientRemark.INTERESTED },
  ]

  for (const client of mfClients) {
    await prisma.client.upsert({
      where: { clientCode: client.clientCode },
      update: {},
      create: {
        ...client,
        middleName: client.middleName || undefined,
        department: Department.MUTUAL_FUND,
        status: ClientStatus.NOT_TRADED,
        remark: ClientRemark.DID_NOT_ANSWER,
      },
    })
  }

  console.log('Seeded clients')

  // Seed sample tasks
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const sampleTasks = [
    {
      title: 'Follow up with inactive equity clients',
      description: 'Call all clients with DID_NOT_ANSWER status and update their trading status. Focus on clients who have not traded this month.',
      assignedToId: reshma.id,
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
      assignedToId: karan.id,
      assignedById: admin.id,
      deadline: nextWeek,
      status: TaskStatus.PENDING,
      priority: TaskPriority.MEDIUM,
    },
    {
      title: 'Monthly MF performance report',
      description: 'Prepare the monthly mutual fund performance report for all active clients and share with the admin team.',
      assignedToId: gayatri.id,
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

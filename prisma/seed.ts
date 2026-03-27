import { PrismaClient, Department, Role, ClientStatus, ClientRemark, MFClientStatus, MFClientRemark } from '@prisma/client'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'

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
    operatorIdMap[name.toLowerCase()] = emp.id
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

  // Helper to parse full name into parts
  function parseName(fullName: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return { firstName: 'Unknown', middleName: undefined as string | undefined, lastName: '' }
    if (parts.length === 1) return { firstName: parts[0], middleName: undefined as string | undefined, lastName: parts[0] }
    if (parts.length === 2) return { firstName: parts[0], middleName: undefined as string | undefined, lastName: parts[1] }
    return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts[parts.length - 1] }
  }

  function normaliseEmail(raw: string): string | undefined {
    const cleaned = (raw || '').trim()
    if (!cleaned || cleaned === '0') return undefined
    return cleaned.split(';')[0].trim() || undefined
  }

  function normalisePan(raw: string): string | undefined {
    const cleaned = (raw || '').trim()
    if (!cleaned || cleaned === '0') return undefined
    return cleaned
  }

  function normaliseDob(raw: string): Date | undefined {
    const cleaned = (raw || '').trim()
    if (!cleaned || cleaned === '0' || cleaned === '00-01-1900') return undefined
    const [dd, mm, yyyy] = cleaned.split('-').map(Number)
    if (!dd || !mm || !yyyy || dd === 0 || yyyy < 1900 || yyyy > 2100) return undefined
    const d = new Date(yyyy, mm - 1, dd)
    if (isNaN(d.getTime())) return undefined
    return d
  }

  function normalisePhone(raw: string): string {
    const cleaned = (raw || '').trim()
    if (!cleaned || cleaned === '0') return '0000000000'
    return cleaned
  }

  function stripBOM(s: string): string {
    return s.replace(/^\uFEFF/, '')
  }

  function readCsv(filePath: string): Record<string, string>[] {
    const rawCsv = fs.readFileSync(filePath, 'utf8')
    const parsed = Papa.parse<Record<string, string>>(rawCsv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => stripBOM(h).trim(),
    })
    return parsed.data
  }

  // --- Import Equity clients from equity_client_master.csv ---
  const eqCsvPath = path.join(__dirname, '..', 'equity_client_master.csv')
  const eqRows = readCsv(eqCsvPath)
  let eqImported = 0
  let eqSkipped = 0

  for (const row of eqRows) {
    const clientCode = (row['CODE'] || '').trim().toUpperCase()
    const fullName = (row['NAME'] || '').trim()
    const operatorName = (row['OPERATOR'] || '').trim()

    if (!clientCode || !fullName || !operatorName) {
      eqSkipped++
      continue
    }

    const operatorId = operatorIdMap[operatorName.toLowerCase()]
    if (!operatorId) {
      console.warn(`Skipping client ${clientCode}: unknown operator "${operatorName}"`)
      eqSkipped++
      continue
    }

    const { firstName, middleName, lastName } = parseName(fullName)

    await prisma.client.upsert({
      where: { clientCode_department: { clientCode, department: Department.EQUITY } },
      update: {
        firstName, middleName, lastName,
        phone: normalisePhone(row['MOBILE'] || ''),
        email: normaliseEmail(row['MAIL'] || ''),
        dob: normaliseDob(row['DOB'] || ''),
        pan: normalisePan(row['PAN'] || ''),
        operatorId,
      },
      create: {
        clientCode, firstName, middleName, lastName,
        phone: normalisePhone(row['MOBILE'] || ''),
        email: normaliseEmail(row['MAIL'] || ''),
        dob: normaliseDob(row['DOB'] || ''),
        pan: normalisePan(row['PAN'] || ''),
        department: Department.EQUITY,
        operatorId,
        status: ClientStatus.NOT_TRADED,
        remark: ClientRemark.DID_NOT_ANSWER,
      },
    })
    eqImported++
  }

  console.log(`Imported ${eqImported} equity clients (${eqSkipped} skipped)`)

  // --- Import MF clients from Mutual_fund_client_master_new.csv ---
  const mfDealers = await prisma.employee.findMany({
    where: { role: Role.MF_DEALER },
    orderBy: { name: 'asc' },
  })

  if (mfDealers.length === 0) {
    console.warn('No MF dealers found, skipping MF client import')
  } else {
    const mfCsvPath = path.join(__dirname, '..', 'Mutual_fund_client_master_new.csv')
    const mfRows = readCsv(mfCsvPath)
    let mfImported = 0
    let mfSkipped = 0

    for (let i = 0; i < mfRows.length; i++) {
      const row = mfRows[i]
      const clientCode = (row['CODE'] || '').trim().toUpperCase()
      const fullName = (row['NAME'] || '').trim()

      if (!clientCode || !fullName) {
        mfSkipped++
        continue
      }

      const dealer = mfDealers[i % mfDealers.length]
      const { firstName, middleName, lastName } = parseName(fullName)

      await prisma.client.upsert({
        where: { clientCode_department: { clientCode, department: Department.MUTUAL_FUND } },
        update: {
          firstName, middleName, lastName,
          phone: normalisePhone(row['MOBILE'] || ''),
          email: normaliseEmail(row['MAIL'] || ''),
          dob: normaliseDob(row['DOB'] || ''),
          pan: normalisePan(row['PAN'] || ''),
        },
        create: {
          clientCode, firstName, middleName, lastName,
          phone: normalisePhone(row['MOBILE'] || ''),
          email: normaliseEmail(row['MAIL'] || ''),
          dob: normaliseDob(row['DOB'] || ''),
          pan: normalisePan(row['PAN'] || ''),
          department: Department.MUTUAL_FUND,
          operatorId: dealer.id,
          mfStatus: MFClientStatus.INACTIVE,
          mfRemark: MFClientRemark.DID_NOT_ANSWER,
        },
      })
      mfImported++
    }

    console.log(`Imported ${mfImported} MF clients (${mfSkipped} skipped)`)
  }

  // --- Import Account Closed clients into ClosedClient table ---
  const closedCsvPath = path.join(__dirname, '..', 'Account_closed_master.csv')
  if (fs.existsSync(closedCsvPath)) {
    await prisma.closedClient.deleteMany({})
    const closedRows = readCsv(closedCsvPath)
    let closedImported = 0
    let closedSkipped = 0

    for (const row of closedRows) {
      const clientCode = (row['CODE'] || '').trim().toUpperCase()
      const fullName = (row['NAME'] || '').trim()
      if (!clientCode || !fullName) { closedSkipped++; continue }

      const { firstName, middleName, lastName } = parseName(fullName)

      await prisma.closedClient.upsert({
        where: { clientCode },
        update: {
          firstName, middleName, lastName,
          phone: normalisePhone(row['MOBILE'] || ''),
          email: normaliseEmail(row['MAIL'] || ''),
          dob: normaliseDob(row['DOB'] || ''),
          pan: normalisePan(row['PAN'] || ''),
        },
        create: {
          clientCode, firstName, middleName, lastName,
          phone: normalisePhone(row['MOBILE'] || ''),
          email: normaliseEmail(row['MAIL'] || ''),
          dob: normaliseDob(row['DOB'] || ''),
          pan: normalisePan(row['PAN'] || ''),
        },
      })
      closedImported++
    }

    // Also mark matching active clients
    const closedCodes = closedRows.map(r => (r['CODE'] || '').trim().toUpperCase()).filter(Boolean)
    await prisma.client.updateMany({
      where: { clientCode: { in: closedCodes } },
      data: { notes: 'ACCOUNT CLOSED' },
    })

    console.log(`Imported ${closedImported} closed accounts (${closedSkipped} skipped)`)
  }

  // Load MF products from Mutual_Fund_Product_Master.csv
  const mfProductCsvPath = path.join(__dirname, '..', 'crm-documents', 'Mutual_Fund_Product_Master.csv')
  const mfProductCsvContent = fs.readFileSync(mfProductCsvPath, 'utf8')
  const mfProductLines = mfProductCsvContent.split('\n').slice(1).filter(l => l.trim())

  let productsImported = 0
  for (const line of mfProductLines) {
    const cols = line.replace(/\r/g, '').replace(/\uFEFF/g, '').split(',')
    const name = (cols[0] || '').trim()
    const investmentType = (cols[1] || '').trim()

    if (!name || !investmentType) continue

    await prisma.mFProduct.upsert({
      where: { name },
      update: { investmentType },
      create: { name, investmentType },
    })
    productsImported++
  }

  console.log(`Imported ${productsImported} MF products from CSV`)

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

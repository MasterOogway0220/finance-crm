import { PrismaClient, Department } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'

const prisma = new PrismaClient()

// Parse "DD-MM-YYYY" → Date | null
// Returns null for "00-01-1900" or "0" style invalid dates
function parseDob(raw: string): Date | null {
  if (!raw || raw === '0') return null
  const [dd, mm, yyyy] = raw.split('-').map(Number)
  if (!dd || !mm || !yyyy || dd === 0 || yyyy < 1900 || yyyy > 2100) return null
  const d = new Date(yyyy, mm - 1, dd)
  if (isNaN(d.getTime())) return null
  return d
}

function cleanPhone(raw: string): string {
  if (!raw || raw === '0') return '0000000000'
  return raw.trim().slice(0, 20)
}

function cleanEmail(raw: string): string | null {
  if (!raw || raw === '0') return null
  // Take first email if multiple separated by ;
  const first = raw.split(';')[0].trim()
  return first || null
}

function cleanPan(raw: string): string | null {
  if (!raw || raw === '0') return null
  const p = raw.trim().toUpperCase()
  return p || null
}

// Split "FIRSTNAME MIDDLENAME LASTNAME" → parts
function splitName(fullName: string): { firstName: string; middleName?: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] }
  return { firstName: parts[0], middleName: parts[1], lastName: parts.slice(2).join(' ') }
}

// Fuzzy match operator name to employee id
function findOperatorId(
  operatorName: string,
  employees: { id: string; name: string }[],
): string | null {
  const n = operatorName.trim().toLowerCase()
  if (!n) return null

  // Exact match first
  for (const e of employees) {
    if (e.name.toLowerCase() === n) return e.id
  }

  // First-name match
  for (const e of employees) {
    const firstName = e.name.split(' ')[0].toLowerCase()
    if (firstName === n) return e.id
  }

  // Contains match
  for (const e of employees) {
    if (e.name.toLowerCase().includes(n)) return e.id
  }

  // Initials match (e.g. "KM" → "Kedar Niranjan Mulye" → K.N.M. — try first+last initials)
  if (/^[A-Z]{2,3}$/i.test(operatorName.trim())) {
    const initials = operatorName.trim().toUpperCase()
    for (const e of employees) {
      const nameParts = e.name.split(' ')
      // First + last initials
      const fl = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      if (fl === initials) return e.id
      // All initials
      const all = nameParts.map((p) => p[0]).join('').toUpperCase()
      if (all === initials) return e.id
    }
  }

  // "Kedar Sir" → match "Kedar" part
  const firstWord = n.split(' ')[0]
  for (const e of employees) {
    if (e.name.toLowerCase().startsWith(firstWord)) return e.id
  }

  return null
}

function readCsv(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '') // strip BOM
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  })
  return result.data
}

async function main() {
  console.log('Fetching employees from DB...')
  const employees = await prisma.employee.findMany({ select: { id: true, name: true, role: true, department: true } })
  const equityEmployees = employees.filter((e) => e.department === Department.EQUITY)
  const mfEmployees = employees.filter((e) => e.department === Department.MUTUAL_FUND)

  console.log(`Found ${equityEmployees.length} equity employees, ${mfEmployees.length} MF employees`)

  // ─── Clear existing data ───────────────────────────────────────────────────
  console.log('\nClearing existing client data...')
  await prisma.mFService.deleteMany({})
  await prisma.mFBusiness.deleteMany({})
  await prisma.brokerageDetail.deleteMany({})
  await prisma.client.deleteMany({})
  await prisma.closedClient.deleteMany({})
  console.log('Cleared.')

  // ─── Import Equity Clients ────────────────────────────────────────────────
  console.log('\nImporting Equity clients...')
  const equityCsvPath = path.join(__dirname, '..', 'equity_client_master.csv')
  const equityRows = readCsv(equityCsvPath)

  let equityImported = 0
  let equitySkipped = 0
  const unmatchedOperators = new Set<string>()

  // Use first equity employee as fallback operator
  const fallbackEquityOp = equityEmployees[0]

  for (const row of equityRows) {
    const code = row['CODE']?.trim()
    if (!code) { equitySkipped++; continue }

    const operatorName = row['OPERATOR']?.trim() || ''
    let operatorId = findOperatorId(operatorName, equityEmployees)
    if (!operatorId) {
      unmatchedOperators.add(operatorName)
      operatorId = fallbackEquityOp?.id
    }
    if (!operatorId) { equitySkipped++; continue }

    const name = splitName(row['NAME'] || '')
    try {
      await prisma.client.upsert({
        where: { clientCode_department: { clientCode: code, department: Department.EQUITY } },
        update: {},
        create: {
          clientCode: code,
          firstName: name.firstName,
          middleName: name.middleName,
          lastName: name.lastName,
          phone: cleanPhone(row['MOBILE']),
          email: cleanEmail(row['MAIL']),
          dob: parseDob(row['DOB']),
          pan: cleanPan(row['PAN']),
          department: Department.EQUITY,
          operatorId,
        },
      })
      equityImported++
    } catch (e) {
      console.error(`Skip equity ${code}:`, (e as Error).message)
      equitySkipped++
    }
  }

  if (unmatchedOperators.size > 0) {
    console.log('  Unmatched operators (used fallback):', [...unmatchedOperators])
  }
  console.log(`  Equity: ${equityImported} imported, ${equitySkipped} skipped`)

  // ─── Import MF Clients ────────────────────────────────────────────────────
  console.log('\nImporting MF clients...')
  const mfCsvPath = path.join(__dirname, '..', 'Mutual_fund_client_master_new.csv')
  const mfRows = readCsv(mfCsvPath)

  // Round-robin MF operator assignment
  let mfOpIndex = 0
  let mfImported = 0
  let mfSkipped = 0

  for (const row of mfRows) {
    const code = row['CODE']?.trim()
    if (!code) { mfSkipped++; continue }

    const operatorId = mfEmployees[mfOpIndex % mfEmployees.length]?.id
    if (!operatorId) { mfSkipped++; continue }

    const name = splitName(row['NAME'] || '')
    try {
      await prisma.client.upsert({
        where: { clientCode_department: { clientCode: code, department: Department.MUTUAL_FUND } },
        update: {},
        create: {
          clientCode: code,
          firstName: name.firstName,
          middleName: name.middleName,
          lastName: name.lastName,
          phone: cleanPhone(row['MOBILE']),
          email: cleanEmail(row['MAIL']),
          dob: parseDob(row['DOB']),
          pan: cleanPan(row['PAN']),
          department: Department.MUTUAL_FUND,
          operatorId,
        },
      })
      mfImported++
      mfOpIndex++
    } catch (e) {
      console.error(`Skip MF ${code}:`, (e as Error).message)
      mfSkipped++
    }
  }
  console.log(`  MF: ${mfImported} imported, ${mfSkipped} skipped`)

  // ─── Import Closed Accounts ───────────────────────────────────────────────
  console.log('\nImporting Closed accounts...')
  const closedCsvPath = path.join(__dirname, '..', 'Account_closed_master.csv')
  const closedRows = readCsv(closedCsvPath)

  let closedImported = 0
  let closedSkipped = 0

  for (const row of closedRows) {
    const code = row['CODE']?.trim()
    if (!code) { closedSkipped++; continue }
    const name = splitName(row['NAME'] || '')
    try {
      await prisma.closedClient.upsert({
        where: { clientCode: code },
        update: {},
        create: {
          clientCode: code,
          firstName: name.firstName,
          middleName: name.middleName,
          lastName: name.lastName,
          phone: cleanPhone(row['MOBILE']),
          email: cleanEmail(row['MAIL']),
          dob: parseDob(row['DOB']),
          pan: cleanPan(row['PAN']),
        },
      })
      closedImported++
    } catch (e) {
      console.error(`Skip closed ${code}:`, (e as Error).message)
      closedSkipped++
    }
  }
  console.log(`  Closed: ${closedImported} imported, ${closedSkipped} skipped`)

  console.log('\nImport complete!')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

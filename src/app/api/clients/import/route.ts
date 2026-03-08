import { auth, getEffectiveRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { validateClientCode } from '@/lib/client-code-validator'
import { Department, Role } from '@prisma/client'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

interface RawRow {
  [key: string]: string | undefined
}

function getField(row: RawRow, ...keys: string[]): string {
  for (const k of keys) {
    const val = row[k]
    if (val !== undefined && val !== null && String(val).trim()) return String(val).trim()
  }
  return ''
}

function parseName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', middleName: undefined as string | undefined, lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], middleName: undefined as string | undefined, lastName: parts[0] }
  if (parts.length === 2) return { firstName: parts[0], middleName: undefined as string | undefined, lastName: parts[1] }
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts[parts.length - 1] }
}

function normaliseRow(row: RawRow, operatorNameToId: Map<string, string>) {
  const clientCode = getField(row, 'Client Code', 'clientCode', 'client_code', 'ClientCode', 'code', 'Code', 'Clients').toUpperCase()
  const phone = getField(row, 'Phone number', 'Phone', 'phone', 'Phone Number', 'phone_number', 'PhoneNumber', 'Mobile', 'mobile')
  const deptRaw = getField(row, 'Department', 'department', 'dept', 'Dept').toUpperCase()
  const department = deptRaw === 'MF' || deptRaw === 'MUTUAL FUND' ? 'MUTUAL_FUND' : deptRaw === 'EQ' ? 'EQUITY' : deptRaw

  // Support both full name and separate first/middle/last
  const fullName = getField(row, 'Name of client', 'Name', 'name', 'Client Name', 'client_name', 'ClientName', 'Full Name', 'full_name')
  let firstName: string, middleName: string | undefined, lastName: string

  if (fullName) {
    const parsed = parseName(fullName)
    firstName = parsed.firstName
    middleName = parsed.middleName
    lastName = parsed.lastName
  } else {
    firstName = getField(row, 'firstName', 'first_name', 'FirstName', 'First Name')
    middleName = getField(row, 'middleName', 'middle_name', 'MiddleName', 'Middle Name') || undefined
    lastName = getField(row, 'lastName', 'last_name', 'LastName', 'Last Name')
  }

  // Support operator name (resolve to ID) or direct operator ID
  const operatorName = getField(row, 'Assigned Operator', 'Operator', 'operator', 'assigned_operator', 'AssignedOperator')
  const operatorIdDirect = getField(row, 'operatorId', 'operator_id', 'OperatorId', 'Operator ID')
  let operatorId = operatorIdDirect
  if (!operatorId && operatorName) {
    operatorId = operatorNameToId.get(operatorName.toLowerCase()) || ''
  }

  return { clientCode, firstName, middleName, lastName, phone, department, operatorId, operatorName }
}

const VALID_DEPARTMENTS: string[] = ['EQUITY', 'MUTUAL_FUND']

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = getEffectiveRole(session.user)
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const confirm = formData.get('confirm') === 'true'

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
    }

    // Parse CSV or Excel
    let rows: RawRow[]
    const fileName = file.name.toLowerCase()

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      rows = XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets[sheetName], { defval: '' })
    } else {
      const text = await file.text()
      const parseResult = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true })
      if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
        return NextResponse.json({ success: false, error: 'Failed to parse CSV file' }, { status: 400 })
      }
      rows = parseResult.data
    }

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No data rows found in file' }, { status: 400 })
    }

    // Build operator name → ID lookup
    const allDealers = await prisma.employee.findMany({
      where: { role: { in: ['EQUITY_DEALER', 'MF_DEALER'] }, isActive: true },
      select: { id: true, name: true },
    })
    const operatorNameToId = new Map<string, string>()
    for (const d of allDealers) {
      operatorNameToId.set(d.name.toLowerCase(), d.id)
      // Also map by first name for convenience
      const firstName = d.name.split(' ')[0].toLowerCase()
      if (!operatorNameToId.has(firstName)) {
        operatorNameToId.set(firstName, d.id)
      }
    }

    // Pre-fetch existing client codes (per department)
    const codesInFile = rows.map(r => getField(r, 'Client Code', 'clientCode', 'client_code', 'ClientCode', 'code', 'Code', 'Clients').toUpperCase()).filter(Boolean)
    const existingClients = await prisma.client.findMany({
      where: { clientCode: { in: codesInFile } },
      select: { clientCode: true, department: true },
    })
    // Build a set of "clientCode:department" for duplicate checking
    const existingCodeDeptSet = new Set(existingClients.map(c => `${c.clientCode}:${c.department}`))

    const validRows: ReturnType<typeof normaliseRow>[] = []
    const invalidRows: { row: number; data: ReturnType<typeof normaliseRow>; errors: string[] }[] = []
    const seenCodes = new Set<string>()

    for (let i = 0; i < rows.length; i++) {
      const norm = normaliseRow(rows[i], operatorNameToId)
      const errors: string[] = []

      const codeDeptKey = `${norm.clientCode}:${norm.department}`
      if (!norm.clientCode) errors.push('Client code is required')
      else if (!validateClientCode(norm.clientCode)) errors.push('Invalid client code format')
      else if (existingCodeDeptSet.has(codeDeptKey)) errors.push('Client code already exists in database for this department')
      else if (seenCodes.has(codeDeptKey)) errors.push('Duplicate client code in file')

      if (!norm.firstName) errors.push('First name is required')
      if (!norm.lastName) errors.push('Last name is required')
      if (!norm.phone || !/^\d{10}$/.test(norm.phone)) errors.push('Phone must be 10 digits')
      if (!norm.department || !VALID_DEPARTMENTS.includes(norm.department)) {
        errors.push('Department must be EQUITY or MUTUAL_FUND')
      }
      if (!norm.operatorId) {
        errors.push(norm.operatorName ? `Operator "${norm.operatorName}" not found` : 'Operator is required')
      }

      if (errors.length > 0) {
        invalidRows.push({ row: i + 2, data: norm, errors })
      } else {
        validRows.push(norm)
        seenCodes.add(codeDeptKey)
      }
    }

    // Preview mode
    if (!confirm) {
      return NextResponse.json({
        success: true,
        data: {
          preview: true,
          totalRows: rows.length,
          validCount: validRows.length,
          invalidCount: invalidRows.length,
          validRows: validRows.slice(0, 50),
          invalidRows,
        },
      })
    }

    // Confirm mode
    if (validRows.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid rows to import' }, { status: 400 })
    }

    const created = await prisma.client.createMany({
      data: validRows.map(r => ({
        clientCode: r.clientCode,
        firstName: r.firstName,
        middleName: r.middleName,
        lastName: r.lastName,
        phone: r.phone,
        department: r.department as Department,
        operatorId: r.operatorId,
      })),
      skipDuplicates: true,
    })

    // Auto-add equity clients to MF master
    const equityRows = validRows.filter(r => r.department === 'EQUITY')
    if (equityRows.length > 0) {
      const mfDealers = await prisma.employee.findMany({
        where: { role: Role.MF_DEALER, isActive: true },
        select: { id: true },
      })

      if (mfDealers.length > 0) {
        await prisma.client.createMany({
          data: equityRows.map((r, i) => ({
            clientCode: r.clientCode,
            firstName: r.firstName,
            middleName: r.middleName,
            lastName: r.lastName,
            phone: r.phone || '0000000000',
            department: Department.MUTUAL_FUND as Department,
            operatorId: mfDealers[i % mfDealers.length].id,
          })),
          skipDuplicates: true,
        })
      }
    }

    await logActivity({
      userId: session.user.id,
      action: 'IMPORT',
      module: 'CLIENTS',
      details: `Imported ${created.count} clients from ${fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ? 'Excel' : 'CSV'}. Skipped ${invalidRows.length} invalid rows.`,
    })

    return NextResponse.json({
      success: true,
      data: {
        importedCount: created.count,
        invalidCount: invalidRows.length,
        invalidRows,
      },
    })
  } catch (error) {
    console.error('[POST /api/clients/import]', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

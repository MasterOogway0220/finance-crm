import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/activity-log'
import { validateClientCode } from '@/lib/client-code-validator'
import { Department, Role } from '@prisma/client'
import Papa from 'papaparse'

interface CSVRow {
  clientCode?: string
  client_code?: string
  ClientCode?: string
  firstName?: string
  first_name?: string
  FirstName?: string
  middleName?: string
  middle_name?: string
  MiddleName?: string
  lastName?: string
  last_name?: string
  LastName?: string
  phone?: string
  Phone?: string
  department?: string
  Department?: string
  operatorId?: string
  operator_id?: string
  OperatorId?: string
  [key: string]: string | undefined
}

function normaliseRow(row: CSVRow) {
  return {
    clientCode: (row.clientCode ?? row.client_code ?? row.ClientCode ?? '').trim().toUpperCase(),
    firstName: (row.firstName ?? row.first_name ?? row.FirstName ?? '').trim(),
    middleName: (row.middleName ?? row.middle_name ?? row.MiddleName ?? '').trim() || undefined,
    lastName: (row.lastName ?? row.last_name ?? row.LastName ?? '').trim(),
    phone: (row.phone ?? row.Phone ?? '').trim(),
    department: (row.department ?? row.Department ?? '').trim().toUpperCase(),
    operatorId: (row.operatorId ?? row.operator_id ?? row.OperatorId ?? '').trim(),
  }
}

const VALID_DEPARTMENTS: string[] = ['EQUITY', 'MUTUAL_FUND']

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = session.user.role as Role
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const confirm = formData.get('confirm') === 'true'

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
    }

    const text = await file.text()

    const parseResult = Papa.parse<CSVRow>(text, {
      header: true,
      skipEmptyLines: true,
    })

    if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
      return NextResponse.json({ success: false, error: 'Failed to parse CSV file' }, { status: 400 })
    }

    const validRows: ReturnType<typeof normaliseRow>[] = []
    const invalidRows: { row: number; data: ReturnType<typeof normaliseRow>; errors: string[] }[] = []

    // Pre-fetch existing client codes to detect duplicates in CSV
    const codesInCSV = parseResult.data.map((r) => normaliseRow(r).clientCode).filter(Boolean)
    const existingClients = await prisma.client.findMany({
      where: { clientCode: { in: codesInCSV } },
      select: { clientCode: true },
    })
    const existingCodes = new Set(existingClients.map((c) => c.clientCode))

    // Pre-fetch operator ids
    const operatorIdsInCSV = [...new Set(parseResult.data.map((r) => normaliseRow(r).operatorId).filter(Boolean))]
    const existingOperators = await prisma.employee.findMany({
      where: { id: { in: operatorIdsInCSV } },
      select: { id: true },
    })
    const validOperatorIds = new Set(existingOperators.map((e) => e.id))

    for (let i = 0; i < parseResult.data.length; i++) {
      const raw = parseResult.data[i]
      const norm = normaliseRow(raw)
      const errors: string[] = []

      if (!norm.clientCode) errors.push('Client code is required')
      else if (!validateClientCode(norm.clientCode)) errors.push('Invalid client code format')
      else if (existingCodes.has(norm.clientCode)) errors.push('Client code already exists in database')

      if (!norm.firstName) errors.push('First name is required')
      if (!norm.lastName) errors.push('Last name is required')
      if (!norm.phone || !/^\d{10}$/.test(norm.phone)) errors.push('Phone must be 10 digits')
      if (!norm.department || !VALID_DEPARTMENTS.includes(norm.department)) {
        errors.push('Department must be EQUITY or MUTUAL_FUND')
      }
      if (!norm.operatorId) errors.push('Operator ID is required')
      else if (!validOperatorIds.has(norm.operatorId)) errors.push('Operator not found')

      if (errors.length > 0) {
        invalidRows.push({ row: i + 2, data: norm, errors })
      } else {
        validRows.push(norm)
      }
    }

    // Preview mode — return results without inserting
    if (!confirm) {
      return NextResponse.json({
        success: true,
        data: {
          preview: true,
          totalRows: parseResult.data.length,
          validCount: validRows.length,
          invalidCount: invalidRows.length,
          validRows,
          invalidRows,
        },
      })
    }

    // Confirm mode — insert valid rows
    if (validRows.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid rows to import' }, { status: 400 })
    }

    const created = await prisma.client.createMany({
      data: validRows.map((r) => ({
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

    await logActivity({
      userId: session.user.id,
      action: 'IMPORT',
      module: 'CLIENTS',
      details: `Imported ${created.count} clients from CSV. Skipped ${invalidRows.length} invalid rows.`,
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

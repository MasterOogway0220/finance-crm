/**
 * reimport-clients.ts
 *
 * Run with:
 *   npx ts-node --project tsconfig.scripts.json scripts/reimport-clients.ts
 *
 * What it does:
 *  1. Reads equity_client_master.csv → upserts EQUITY clients with OPERATOR mapping.
 *  2. Reads Mutual_fund_client_master_new.csv → upserts MUTUAL_FUND clients (round-robin MF dealers).
 *  3. Clients in BOTH files get records in both departments (771 overlap).
 *  4. Reads Account_closed_master.csv → marks matching clients as closed (notes field).
 */

import { PrismaClient, Department, Role, ClientStatus, ClientRemark, MFClientStatus, MFClientRemark } from '@prisma/client';
import Papa from 'papaparse';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseName(fullName: string): {
  firstName: string;
  middleName: string | null;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Unknown', middleName: null, lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: null, lastName: parts[0] };
  if (parts.length === 2) return { firstName: parts[0], middleName: null, lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function normalisePhone(raw: string): string {
  const cleaned = (raw || '').trim();
  if (!cleaned || cleaned === '0') return '0000000000';
  return cleaned;
}

function normaliseEmail(raw: string): string | null {
  const cleaned = (raw || '').trim();
  if (!cleaned || cleaned === '0') return null;
  // Take first email if multiple separated by ;
  return cleaned.split(';')[0].trim() || null;
}

function normalisePan(raw: string): string | null {
  const cleaned = (raw || '').trim();
  if (!cleaned || cleaned === '0') return null;
  return cleaned;
}

function normaliseDob(raw: string): Date | null {
  const cleaned = (raw || '').trim();
  if (!cleaned || cleaned === '0' || cleaned === '00-01-1900') return null;
  const [dd, mm, yyyy] = cleaned.split('-').map(Number);
  if (!dd || !mm || !yyyy || dd === 0 || yyyy < 1900 || yyyy > 2100) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (isNaN(d.getTime())) return null;
  return d;
}

function stripBOM(s: string): string {
  return s.replace(/^\uFEFF/, '');
}

function readCsv(filePath: string): Record<string, string>[] {
  const rawCsv = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(rawCsv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => stripBOM(h).trim(),
  });
  if (parsed.errors.length > 0) {
    console.warn(`  CSV parse warnings (first 5):`);
    parsed.errors.slice(0, 5).forEach((e) => console.warn('  ', e.message));
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Operator name → employee ID map
// ---------------------------------------------------------------------------

const OPERATOR_EMAIL_MAP: Record<string, string> = {
  'shweta': 'pethe.shweta95@gmail.com',
  'km': 'kedarmulyeo1@gmail.com',
  'reshma': 'reshmamyerunkar@gmail.com',
  'sarvesh': 'sarveshoak3@gmail.com',
  'karan': 'patilkaran128@gmail.com',
  'vinit': 'vinitgollar07@gmail.com',
  'kedar sir': 'kedaroak_13@rediffmail.com',
  'vedant': 'vedant_dummy18@gmail.com',
  'karad': 'karad_dummy18@gmail.com',
  'pune': 'pruthav111@gmail.com',
};

// ---------------------------------------------------------------------------
// Part 1 — Equity CSV: upsert clients with operator
// ---------------------------------------------------------------------------

async function processEquityCsv(
  filePath: string,
  operatorIdMap: Record<string, string>
): Promise<void> {
  console.log('\n--- Part 1: Equity CSV import ---');
  console.log(`Reading: ${filePath}`);

  const rows = readCsv(filePath);
  console.log(`Rows found: ${rows.length}`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const clientCode = (row['CODE'] || '').trim().toUpperCase();
    const fullName = (row['NAME'] || '').trim();
    const mobile = row['MOBILE'] || '';
    const mail = row['MAIL'] || '';
    const dob = row['DOB'] || '';
    const pan = row['PAN'] || '';
    const operatorName = (row['OPERATOR'] || '').trim();

    if (!clientCode || !fullName) {
      skipped++;
      continue;
    }

    const operatorId = operatorIdMap[operatorName.toLowerCase()];
    if (!operatorId) {
      console.warn(`  [Row ${i + 2}] Skipping ${clientCode}: unknown operator "${operatorName}"`);
      skipped++;
      continue;
    }

    const { firstName, middleName, lastName } = parseName(fullName);

    try {
      await prisma.client.upsert({
        where: { clientCode_department: { clientCode, department: Department.EQUITY } },
        update: {
          firstName,
          middleName,
          lastName,
          phone: normalisePhone(mobile),
          email: normaliseEmail(mail),
          dob: normaliseDob(dob),
          pan: normalisePan(pan),
          operatorId,
        },
        create: {
          clientCode,
          firstName,
          middleName,
          lastName,
          phone: normalisePhone(mobile),
          email: normaliseEmail(mail),
          dob: normaliseDob(dob),
          pan: normalisePan(pan),
          department: Department.EQUITY,
          operatorId,
          status: ClientStatus.NOT_TRADED,
          remark: ClientRemark.DID_NOT_ANSWER,
        },
      });
      // Check if it was created or updated by looking at createdAt
      const existing = await prisma.client.findUnique({
        where: { clientCode_department: { clientCode, department: Department.EQUITY } },
        select: { createdAt: true, updatedAt: true },
      });
      if (existing && existing.createdAt.getTime() === existing.updatedAt.getTime()) {
        created++;
      } else {
        updated++;
      }
    } catch (err: unknown) {
      console.error(`  [Row ${i + 2}] Error for ${clientCode}:`, err instanceof Error ? err.message : err);
    }

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r  Processed ${i + 1}/${rows.length}...`);
    }
  }

  process.stdout.write('\r');
  console.log(`Equity: ${created} created, ${updated} updated, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// Part 2 — MF CSV: upsert clients with round-robin MF dealers
// ---------------------------------------------------------------------------

async function processMutualFundCsv(filePath: string): Promise<void> {
  console.log('\n--- Part 2: Mutual Fund CSV import ---');
  console.log(`Reading: ${filePath}`);

  const mfDealers = await prisma.employee.findMany({
    where: { role: Role.MF_DEALER, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  if (mfDealers.length === 0) {
    console.error('ERROR: No active MF_DEALER employees found. Aborting MF import.');
    return;
  }

  console.log(`Found ${mfDealers.length} MF dealer(s): ${mfDealers.map((e) => e.name).join(', ')}`);

  const rows = readCsv(filePath);
  console.log(`Rows found: ${rows.length}`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let rrIndex = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const clientCode = (row['CODE'] || '').trim().toUpperCase();
    const fullName = (row['NAME'] || '').trim();
    const mobile = row['MOBILE'] || '';
    const mail = row['MAIL'] || '';
    const dob = row['DOB'] || '';
    const pan = row['PAN'] || '';

    if (!clientCode || !fullName) {
      skipped++;
      continue;
    }

    const { firstName, middleName, lastName } = parseName(fullName);

    // Check if MF record already exists (preserve existing operator assignment)
    const existing = await prisma.client.findUnique({
      where: { clientCode_department: { clientCode, department: Department.MUTUAL_FUND } },
      select: { id: true, operatorId: true },
    });

    if (existing) {
      // Update contact info but keep operator assignment
      await prisma.client.update({
        where: { clientCode_department: { clientCode, department: Department.MUTUAL_FUND } },
        data: {
          firstName,
          middleName,
          lastName,
          phone: normalisePhone(mobile),
          email: normaliseEmail(mail),
          dob: normaliseDob(dob),
          pan: normalisePan(pan),
        },
      });
      updated++;
    } else {
      // New MF client — assign round-robin
      const dealer = mfDealers[rrIndex % mfDealers.length];
      rrIndex++;

      try {
        await prisma.client.create({
          data: {
            clientCode,
            firstName,
            middleName,
            lastName,
            phone: normalisePhone(mobile),
            email: normaliseEmail(mail),
            dob: normaliseDob(dob),
            pan: normalisePan(pan),
            department: Department.MUTUAL_FUND,
            operatorId: dealer.id,
            mfStatus: MFClientStatus.INACTIVE,
            mfRemark: MFClientRemark.DID_NOT_ANSWER,
          },
        });
        created++;
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        if (e.code === 'P2002') {
          skipped++;
        } else {
          console.error(`  [Row ${i + 2}] Error for ${clientCode}:`, e.message ?? err);
        }
      }
    }

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r  Processed ${i + 1}/${rows.length}...`);
    }
  }

  process.stdout.write('\r');
  console.log(`MF: ${created} created, ${updated} updated, ${skipped} skipped`);
}


// ---------------------------------------------------------------------------
// Part 4 — Account Closed: mark clients
// ---------------------------------------------------------------------------

async function processAccountClosed(filePath: string): Promise<void> {
  console.log('\n--- Part 4: Account Closed ---');
  console.log(`Reading: ${filePath}`);

  const rows = readCsv(filePath);
  console.log(`Rows found: ${rows.length}`);

  const closedCodes = new Set<string>();
  for (const row of rows) {
    const code = (row['CODE'] || '').trim().toUpperCase();
    if (code) closedCodes.add(code);
  }

  // Mark any existing clients with these codes
  const result = await prisma.client.updateMany({
    where: { clientCode: { in: Array.from(closedCodes) } },
    data: { notes: 'ACCOUNT CLOSED' },
  });

  console.log(`Marked ${result.count} client records as ACCOUNT CLOSED (${closedCodes.size} unique codes).`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const EQUITY_CSV = path.resolve(__dirname, '../equity_client_master.csv');
const MF_CSV = path.resolve(__dirname, '../Mutual_fund_client_master_new.csv');
const CLOSED_CSV = path.resolve(__dirname, '../Account_closed_master.csv');

async function main(): Promise<void> {
  console.log('=== reimport-clients (new master data) ===');

  // Verify files exist
  for (const [label, fp] of [['Equity CSV', EQUITY_CSV], ['MF CSV', MF_CSV], ['Closed CSV', CLOSED_CSV]]) {
    if (!fs.existsSync(fp)) {
      console.error(`${label} not found: ${fp}`);
      process.exit(1);
    }
  }

  // Build operator name → ID map
  const operatorIdMap: Record<string, string> = {};
  for (const [name, email] of Object.entries(OPERATOR_EMAIL_MAP)) {
    const emp = await prisma.employee.findUnique({ where: { email } });
    if (!emp) {
      console.warn(`Operator "${name}" (${email}) not found in DB — skipping`);
      continue;
    }
    operatorIdMap[name] = emp.id;
  }
  console.log(`Resolved ${Object.keys(operatorIdMap).length} equity operators.`);

  // Step 1: Import equity clients with operator assignments
  await processEquityCsv(EQUITY_CSV, operatorIdMap);

  // Step 2: Import MF clients with round-robin assignment
  await processMutualFundCsv(MF_CSV);

  // Step 3: Mark account closed clients
  await processAccountClosed(CLOSED_CSV);

  // Print final summary
  const equityCount = await prisma.client.count({ where: { department: Department.EQUITY } });
  const mfCount = await prisma.client.count({ where: { department: Department.MUTUAL_FUND } });
  console.log(`\n=== Final counts ===`);
  console.log(`  EQUITY clients: ${equityCount}`);
  console.log(`  MUTUAL_FUND clients: ${mfCount}`);
  console.log('\n=== Done ===');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * reimport-clients.ts
 *
 * Run with:
 *   npx ts-node --project tsconfig.scripts.json scripts/reimport-clients.ts
 *
 * What it does:
 *  1. Reads the Equity XLSX and updates `phone` on existing EQUITY clients by clientCode.
 *  2. Reads the MutualFund CSV and upserts MUTUAL_FUND clients (creates if not exists,
 *     skips if the [clientCode, MUTUAL_FUND] unique pair already exists).
 *     Operators are auto-assigned round-robin across active MF_DEALER employees from DB.
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
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
  if (parts.length === 0) {
    return { firstName: 'Unknown', middleName: null, lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], middleName: null, lastName: '' };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], middleName: null, lastName: parts[1] };
  }
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

/** Normalise a phone value that may arrive as a JS number or string. */
function normalisePhone(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '0000000000';
  // If xlsx parsed it as a number (e.g. 9773110486) convert to string.
  return String(raw).trim() || '0000000000';
}

/** Strip UTF-8 BOM from a string key (common in CSV first-column headers). */
function stripBOM(s: string): string {
  return s.replace(/^\uFEFF/, '');
}

// ---------------------------------------------------------------------------
// Part 1 — Equity XLSX: update phone
// ---------------------------------------------------------------------------

async function processEquityXlsx(filePath: string): Promise<void> {
  console.log('\n--- Part 1: Equity XLSX phone update ---');
  console.log(`Reading: ${filePath}`);

  const buffer = fs.readFileSync(filePath);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Parse with header row so we get named columns.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  console.log(`Rows found: ${rows.length}`);

  let updated = 0;
  let notFound = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Column names as they appear in the sheet (note possible leading/trailing spaces).
    // We try both trimmed and raw versions to be safe.
    const rawClientCode =
      (row['Client Code'] ?? row[' Client Code'] ?? '') as unknown;
    const rawPhone =
      (row['Phone Number'] ?? row[' Phone Number'] ?? '') as unknown;

    const clientCode = String(rawClientCode).trim();
    const phone = normalisePhone(rawPhone);

    if (!clientCode) {
      skipped++;
      continue;
    }

    try {
      const result = await prisma.client.updateMany({
        where: {
          clientCode,
          department: 'EQUITY',
        },
        data: { phone },
      });

      if (result.count > 0) {
        updated++;
      } else {
        notFound++;
        if (notFound <= 10) {
          console.warn(`  [Row ${i + 2}] No EQUITY client found for code: ${clientCode}`);
        }
      }
    } catch (err: unknown) {
      console.error(
        `  [Row ${i + 2}] Error updating ${clientCode}:`,
        err instanceof Error ? err.message : err
      );
    }

    // Progress every 100 rows
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r  Processed ${i + 1}/${rows.length}...`);
    }
  }

  process.stdout.write('\r');
  console.log(`Updated ${updated} equity phones.`);
  if (notFound > 0) console.log(`  (${notFound} client codes not found in DB)`);
  if (skipped > 0) console.log(`  (${skipped} rows skipped — missing client code)`);
}

// ---------------------------------------------------------------------------
// Part 2 — MutualFund CSV: upsert clients
// ---------------------------------------------------------------------------

async function processMutualFundCsv(filePath: string): Promise<void> {
  console.log('\n--- Part 2: MutualFund CSV upsert ---');
  console.log(`Reading: ${filePath}`);

  // Fetch active MF_DEALER employees for round-robin assignment.
  const mfDealers = await prisma.employee.findMany({
    where: { role: 'MF_DEALER', isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  if (mfDealers.length === 0) {
    console.error('ERROR: No active MF_DEALER employees found in DB. Cannot assign operators. Aborting MF import.');
    return;
  }

  console.log(
    `Found ${mfDealers.length} active MF_DEALER(s): ${mfDealers.map((e) => e.name).join(', ')}`
  );

  let rrIndex = 0; // round-robin cursor

  const rawCsv = fs.readFileSync(filePath, 'utf-8');

  const parsed = Papa.parse<Record<string, string>>(rawCsv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => stripBOM(h).trim(),
  });

  if (parsed.errors.length > 0) {
    console.warn(`CSV parse warnings (first 5):`);
    parsed.errors.slice(0, 5).forEach((e) => console.warn(' ', e.message));
  }

  const rows = parsed.data;
  console.log(`Rows found: ${rows.length}`);

  let created = 0;
  let skippedDuplicates = 0;
  let skippedInvalid = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Handle potential BOM on first column key.
    const clientCodeRaw =
      row['Client Code'] ??
      row['\uFEFFClient Code'] ??
      Object.values(row)[0]; // fallback: first column value

    const fullNameRaw =
      row['Name of Client (full)'] ??
      row['Name of Client(full)'] ??
      row['Name of Client'] ??
      '';

    const clientCode = (clientCodeRaw ?? '').toString().trim();
    const fullName = (fullNameRaw ?? '').toString().trim();

    if (!clientCode || !fullName) {
      skippedInvalid++;
      if (skippedInvalid <= 5) {
        console.warn(`  [Row ${i + 2}] Skipping — missing clientCode or name. Keys: ${Object.keys(row).join(', ')}`);
      }
      continue;
    }

    // Check if already exists.
    const existing = await prisma.client.findUnique({
      where: { clientCode_department: { clientCode, department: 'MUTUAL_FUND' } },
      select: { id: true },
    });

    if (existing) {
      skippedDuplicates++;
      continue;
    }

    // Assign operator round-robin.
    const operator = mfDealers[rrIndex % mfDealers.length];
    rrIndex++;

    const { firstName, middleName, lastName } = parseName(fullName);

    try {
      await prisma.client.create({
        data: {
          clientCode,
          firstName,
          middleName,
          lastName,
          phone: '0000000000',
          department: 'MUTUAL_FUND',
          operatorId: operator.id,
        },
      });
      created++;
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'P2002') {
        // Race condition / duplicate — treat as skipped.
        skippedDuplicates++;
      } else {
        console.error(
          `  [Row ${i + 2}] Error creating ${clientCode}:`,
          e.message ?? err
        );
      }
    }

    // Progress every 100 rows
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r  Processed ${i + 1}/${rows.length}...`);
    }
  }

  process.stdout.write('\r');
  console.log(`Created ${created} MF clients.`);
  console.log(`Skipped ${skippedDuplicates} duplicates.`);
  if (skippedInvalid > 0) {
    console.log(`Skipped ${skippedInvalid} invalid rows (missing code or name).`);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const EQUITY_XLSX = path.resolve(
  __dirname,
  '../crm-documents/Equity_Client_master(Client Master-955)..xlsx'
);

const MF_CSV = path.resolve(
  __dirname,
  '../crm-documents/MutualFund_client_master.csv'
);

async function main(): Promise<void> {
  console.log('=== reimport-clients ===');

  if (!fs.existsSync(EQUITY_XLSX)) {
    console.error(`Equity XLSX not found: ${EQUITY_XLSX}`);
    process.exit(1);
  }
  if (!fs.existsSync(MF_CSV)) {
    console.error(`MF CSV not found: ${MF_CSV}`);
    process.exit(1);
  }

  await processEquityXlsx(EQUITY_XLSX);
  await processMutualFundCsv(MF_CSV);

  console.log('\n=== Done ===');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

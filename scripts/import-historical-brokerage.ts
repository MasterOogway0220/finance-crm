/**
 * import-historical-brokerage.ts
 *
 * One-off backfill of Ventura Securities ledger XLSX files into BrokerageUpload + BrokerageDetail.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/import-historical-brokerage.ts \
 *     --files=24-25.xlsx,25-26.xlsx --dry-run
 *   npx ts-node --project tsconfig.scripts.json scripts/import-historical-brokerage.ts \
 *     --files=24-25.xlsx,25-26.xlsx
 *
 * Flags:
 *   --files=a.xlsx,b.xlsx     Comma-separated ledger files (paths relative to repo root)
 *   --dry-run                 Parse + aggregate + summarize, but DO NOT write to DB
 *   --force                   If a (month, branch) already has an active BrokerageUpload,
 *                             deactivate it and create a new version. Default: SKIP.
 *
 * Behavior:
 *   1. Filters ledger rows: keeps where date+narration+credit>0 are present
 *      AND Particulars is NOT IN ('CLIENTS','BROKERAGE','OPENING BALANCE').
 *   2. Extracts client code as last space-separated token of Narration.
 *   3. Matches codes against Client(EQUITY); attribution operator = client.operatorId.
 *      Branch derived from operator name: ' Karad' → 'Karad', 'Pune' → 'Pune', else 'Mumbai'.
 *   4. Unmatched codes attributed to a synthetic Employee 'Historical (Unattributed)'
 *      (created if missing, isActive=false). clientId stays null; branch defaults to 'Mumbai'.
 *   5. Aggregates by (month_start_UTC, branch, clientCode) — sums amounts.
 *   6. Writes one BrokerageUpload per (month, branch) with isActive=true.
 *      uploadDate = first of month at 00:00 UTC.
 *   7. NEVER touches Client.status — pure backfill.
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

// --- CLI parsing -----------------------------------------------------------

interface CliArgs {
  files: string[];
  dryRun: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { files: [], dryRun: false, force: false };
  for (const a of argv) {
    if (a.startsWith('--files=')) out.files = a.slice('--files='.length).split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
  }
  if (out.files.length === 0) {
    console.error('Error: --files=<comma-separated XLSX paths> is required');
    process.exit(1);
  }
  return out;
}

// --- Excel parsing helpers -------------------------------------------------

const SKIP_PARTICULARS = new Set(['CLIENTS', 'BROKERAGE', 'OPENING BALANCE']);

function detectHeaderRow(rows: unknown[][]): { headerRowIndex: number; headers: string[] } {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = (rows[i] || []).map((c) => String(c ?? '').toLowerCase());
    const hasDate = r.some((c) => c.includes('date'));
    const hasNarration = r.some((c) => c.includes('narration'));
    const hasCredit = r.some((c) => c.includes('credit'));
    if (hasDate && hasNarration && hasCredit) {
      return { headerRowIndex: i, headers: (rows[i] || []).map((h) => String(h ?? '')) };
    }
  }
  throw new Error('Could not detect header row — file lacks Date/Narration/Credit columns');
}

function findCol(headers: string[], substr: string): number {
  return headers.findIndex((h) => String(h).toLowerCase().includes(substr));
}

function extractCode(narration: string): string | null {
  const t = String(narration ?? '').trim();
  if (!t) return null;
  const i = t.lastIndexOf(' ');
  return (i === -1 ? t : t.slice(i + 1)).trim().toUpperCase() || null;
}

function excelSerialToUtcDate(serial: number): Date {
  // Excel serial 25569 = 1970-01-01 (Unix epoch). Each unit = 1 day.
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

function monthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function ymKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// --- Branch derivation -----------------------------------------------------

function deriveBranchFromOperatorName(name: string): 'Mumbai' | 'Karad' | 'Pune' {
  const n = String(name ?? '').trim().toLowerCase();
  if (n === 'karad') return 'Karad';
  if (n === 'pune') return 'Pune';
  return 'Mumbai';
}

// --- Synthetic operator for unmatched codes -------------------------------

const HISTORICAL_OPERATOR_EMAIL = 'historical-unattributed@kesar.internal';
const HISTORICAL_OPERATOR_NAME = 'Historical (Unattributed)';

async function ensureHistoricalOperator(dryRun: boolean): Promise<string> {
  const existing = await prisma.employee.findUnique({
    where: { email: HISTORICAL_OPERATOR_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;
  if (dryRun) return '__DRY_RUN_HISTORICAL_OPERATOR__';
  const created = await prisma.employee.create({
    data: {
      name: HISTORICAL_OPERATOR_NAME,
      email: HISTORICAL_OPERATOR_EMAIL,
      phone: '0000000000',
      // Random unusable password (never logs in). bcrypt-format placeholder.
      password: '$2a$10$DISABLED_HISTORICAL_PLACEHOLDER_NEVER_VALID_HASH_xxx',
      department: 'EQUITY',
      designation: 'Historical (Unattributed)',
      role: 'EQUITY_DEALER',
      isActive: false,
    },
    select: { id: true },
  });
  return created.id;
}

// --- Core import flow ------------------------------------------------------

interface ParsedRow {
  uploadDate: Date;        // month start UTC
  branch: 'Mumbai' | 'Karad' | 'Pune';
  clientCode: string;
  clientId: string | null;
  operatorId: string;
  amount: number;
}

interface FileSummary {
  file: string;
  totalRowsScanned: number;
  rowsKept: number;
  rowsSkippedNoDate: number;
  rowsSkippedNoNarration: number;
  rowsSkippedZeroCredit: number;
  rowsSkippedByParticulars: number;
  totalCredit: number;
  unmatchedCodes: Map<string, { rows: number; amount: number }>;
  matchedCodes: Set<string>;
}

async function parseFile(
  filePath: string,
  codeToClient: Map<string, { id: string; operatorId: string; operatorName: string }>,
  historicalOperatorId: string,
): Promise<{ rows: ParsedRow[]; summary: FileSummary }> {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

  const { headerRowIndex, headers } = detectHeaderRow(rawRows);
  const dIdx = findCol(headers, 'date');
  const nIdx = findCol(headers, 'narration');
  const cIdx = findCol(headers, 'credit');
  const pIdx = findCol(headers, 'particular');
  if (dIdx < 0 || nIdx < 0 || cIdx < 0) {
    throw new Error(`${filePath}: missing Date/Narration/Credit column`);
  }

  const out: ParsedRow[] = [];
  const summary: FileSummary = {
    file: filePath,
    totalRowsScanned: 0,
    rowsKept: 0,
    rowsSkippedNoDate: 0,
    rowsSkippedNoNarration: 0,
    rowsSkippedZeroCredit: 0,
    rowsSkippedByParticulars: 0,
    totalCredit: 0,
    unmatchedCodes: new Map(),
    matchedCodes: new Set(),
  };

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i] || [];
    summary.totalRowsScanned++;
    const dateRaw = row[dIdx];
    const narration = row[nIdx];
    const creditRaw = row[cIdx];
    const particulars = String(row[pIdx] ?? '').trim().toUpperCase();

    if (dateRaw === null || dateRaw === undefined || dateRaw === '') { summary.rowsSkippedNoDate++; continue; }
    if (!narration) { summary.rowsSkippedNoNarration++; continue; }
    if (particulars && SKIP_PARTICULARS.has(particulars)) { summary.rowsSkippedByParticulars++; continue; }
    const amt = parseFloat(String(creditRaw ?? '').replace(/,/g, ''));
    if (!amt || isNaN(amt) || amt <= 0) { summary.rowsSkippedZeroCredit++; continue; }

    const code = extractCode(String(narration));
    if (!code) { summary.rowsSkippedNoNarration++; continue; }

    const dateNum = typeof dateRaw === 'number' ? dateRaw : parseFloat(String(dateRaw));
    if (isNaN(dateNum)) { summary.rowsSkippedNoDate++; continue; }
    const txDate = excelSerialToUtcDate(dateNum);
    const uploadDate = monthStartUtc(txDate);

    const client = codeToClient.get(code);
    let clientId: string | null;
    let operatorId: string;
    let branch: 'Mumbai' | 'Karad' | 'Pune';
    if (client) {
      clientId = client.id;
      operatorId = client.operatorId;
      branch = deriveBranchFromOperatorName(client.operatorName);
      summary.matchedCodes.add(code);
    } else {
      clientId = null;
      operatorId = historicalOperatorId;
      branch = 'Mumbai';
      const ex = summary.unmatchedCodes.get(code) ?? { rows: 0, amount: 0 };
      ex.rows++;
      ex.amount += amt;
      summary.unmatchedCodes.set(code, ex);
    }

    out.push({ uploadDate, branch, clientCode: code, clientId, operatorId, amount: amt });
    summary.totalCredit += amt;
    summary.rowsKept++;
  }
  return { rows: out, summary };
}

interface GroupKey { uploadDate: Date; branch: string; }
interface AggregatedDetail { clientCode: string; clientId: string | null; operatorId: string; amount: number; }
interface AggregatedUpload {
  uploadDateISO: string; // YYYY-MM-DD month start
  uploadDate: Date;
  branch: string;
  details: Map<string, AggregatedDetail>; // by clientCode
  totalAmount: number;
}

function aggregate(rows: ParsedRow[]): Map<string, AggregatedUpload> {
  const out = new Map<string, AggregatedUpload>();
  for (const r of rows) {
    const key = `${r.uploadDate.toISOString()}::${r.branch}`;
    let bucket = out.get(key);
    if (!bucket) {
      bucket = {
        uploadDateISO: r.uploadDate.toISOString().slice(0, 10),
        uploadDate: r.uploadDate,
        branch: r.branch,
        details: new Map(),
        totalAmount: 0,
      };
      out.set(key, bucket);
    }
    const existing = bucket.details.get(r.clientCode);
    if (existing) {
      existing.amount += r.amount;
    } else {
      bucket.details.set(r.clientCode, {
        clientCode: r.clientCode,
        clientId: r.clientId,
        operatorId: r.operatorId,
        amount: r.amount,
      });
    }
    bucket.totalAmount += r.amount;
  }
  return out;
}

// --- Main ------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('=== Historical Brokerage Import ===');
  console.log('Files:', args.files);
  console.log('Mode :', args.dryRun ? 'DRY-RUN (no DB writes)' : 'LIVE');
  console.log('Force:', args.force ? 'yes (will deactivate existing versions for same month×branch)' : 'no (will skip existing)');
  console.log('');

  // Verify files exist
  for (const f of args.files) {
    const abs = path.resolve(f);
    if (!fs.existsSync(abs)) {
      console.error(`File not found: ${abs}`);
      process.exit(1);
    }
  }

  // Build code → client lookup ONCE (all equity clients)
  const clients = await prisma.client.findMany({
    where: { department: 'EQUITY' },
    select: { id: true, clientCode: true, operatorId: true, operator: { select: { name: true } } },
  });
  const codeToClient = new Map<string, { id: string; operatorId: string; operatorName: string }>();
  for (const c of clients) {
    codeToClient.set(c.clientCode.toUpperCase(), {
      id: c.id,
      operatorId: c.operatorId,
      operatorName: c.operator?.name ?? '',
    });
  }
  console.log(`Loaded ${codeToClient.size} EQUITY clients for code matching`);

  // Ensure synthetic operator
  const historicalOperatorId = await ensureHistoricalOperator(args.dryRun);
  console.log(`Synthetic operator id: ${historicalOperatorId}`);
  console.log('');

  // Parse files
  const allRows: ParsedRow[] = [];
  const fileSummaries: FileSummary[] = [];
  for (const f of args.files) {
    console.log(`-- Parsing ${f} --`);
    const { rows, summary } = await parseFile(path.resolve(f), codeToClient, historicalOperatorId);
    console.log(`   scanned=${summary.totalRowsScanned}  kept=${summary.rowsKept}  ` +
      `skipped: noDate=${summary.rowsSkippedNoDate} noNarration=${summary.rowsSkippedNoNarration} ` +
      `zeroCredit=${summary.rowsSkippedZeroCredit} byParticulars=${summary.rowsSkippedByParticulars}`);
    console.log(`   total credit kept: ₹${summary.totalCredit.toFixed(2)}`);
    console.log(`   matched codes=${summary.matchedCodes.size}  unmatched codes=${summary.unmatchedCodes.size}`);
    if (summary.unmatchedCodes.size > 0) {
      const top = [...summary.unmatchedCodes.entries()]
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 10);
      console.log(`   top 10 unmatched by amount:`);
      for (const [code, info] of top) {
        console.log(`     ${code.padEnd(15)} rows=${info.rows} amount=₹${info.amount.toFixed(2)}`);
      }
      const unmatchedTotal = [...summary.unmatchedCodes.values()].reduce((s, v) => s + v.amount, 0);
      console.log(`   unmatched total: ₹${unmatchedTotal.toFixed(2)} (${((unmatchedTotal / summary.totalCredit) * 100).toFixed(2)}% of kept)`);
    }
    console.log('');
    allRows.push(...rows);
    fileSummaries.push(summary);
  }

  // Aggregate into (month × branch) buckets
  const buckets = aggregate(allRows);
  console.log(`=== Aggregated into ${buckets.size} (month × branch) buckets ===`);
  const sortedKeys = [...buckets.keys()].sort();
  for (const key of sortedKeys) {
    const b = buckets.get(key)!;
    console.log(`  ${b.uploadDateISO}  ${b.branch.padEnd(7)}  clients=${String(b.details.size).padStart(4)}  total=₹${b.totalAmount.toFixed(2)}`);
  }
  console.log('');
  const grandTotal = [...buckets.values()].reduce((s, b) => s + b.totalAmount, 0);
  console.log(`Grand total to import: ₹${grandTotal.toFixed(2)}  across ${[...buckets.values()].reduce((s, b) => s + b.details.size, 0)} BrokerageDetail rows`);
  console.log('');

  if (args.dryRun) {
    console.log('DRY-RUN: no DB writes performed.');
    await prisma.$disconnect();
    return;
  }

  // --- Live write -----------------------------------------------------------
  console.log('=== Writing to DB ===');
  let createdUploads = 0;
  let skippedExisting = 0;
  let totalDetailsWritten = 0;

  for (const key of sortedKeys) {
    const b = buckets.get(key)!;

    // Check existing uploads for this (uploadDate, branch)
    const existing = await prisma.brokerageUpload.findMany({
      where: { uploadDate: b.uploadDate, branch: b.branch },
      select: { id: true, version: true, isActive: true },
      orderBy: { version: 'desc' },
    });

    if (existing.length > 0 && !args.force) {
      console.log(`  SKIP  ${b.uploadDateISO}  ${b.branch.padEnd(7)}  — ${existing.length} existing version(s), use --force to override`);
      skippedExisting++;
      continue;
    }

    const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
    const detailsArray = [...b.details.values()].map((d) => ({
      clientCode: d.clientCode,
      clientId: d.clientId,
      operatorId: d.operatorId,
      amount: d.amount,
    }));

    await prisma.$transaction(async (tx) => {
      if (existing.length > 0) {
        await tx.brokerageUpload.updateMany({
          where: { uploadDate: b.uploadDate, branch: b.branch },
          data: { isActive: false },
        });
      }
      await tx.brokerageUpload.create({
        data: {
          uploadDate: b.uploadDate,
          branch: b.branch,
          version: nextVersion,
          isActive: true,
          uploadedById: null,
          totalAmount: b.totalAmount,
          fileName: `HISTORICAL-BACKFILL-${b.uploadDateISO}-${b.branch}`,
          details: { create: detailsArray },
        },
      });
    }, { timeout: 60000 });

    console.log(`  WROTE ${b.uploadDateISO}  ${b.branch.padEnd(7)}  v${nextVersion}  details=${detailsArray.length}  total=₹${b.totalAmount.toFixed(2)}`);
    createdUploads++;
    totalDetailsWritten += detailsArray.length;
  }

  console.log('');
  console.log(`=== Done ===`);
  console.log(`Created BrokerageUpload rows: ${createdUploads}`);
  console.log(`Skipped (already exists): ${skippedExisting}`);
  console.log(`Total BrokerageDetail rows written: ${totalDetailsWritten}`);
  console.log(`Note: Client.status was NOT modified (historical backfill is non-side-effecting).`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

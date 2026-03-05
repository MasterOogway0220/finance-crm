import { PrismaClient } from '../node_modules/.prisma/client/index.js';
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

// Employee name → ID mapping (from DB)
const OPERATOR_MAP = {
  'KM': 'cmm0ab4240000jbzoykbfoljo',
  'Kedar Sir': 'cmm0ab4370001jbzorqttsyw0',
  'Karan': 'cmm0ab4380003jbzoj0uyr39u',
  'karan': 'cmm0ab4380003jbzoj0uyr39u',
  'Vinit': 'cmm0ab4390004jbzo65qz8may',
  'Reshma': 'cmm0ab4390005jbzofr7k0dvw',
  'Shweta': 'cmm0ab43b0007jbzog6oqj3pu',
  'Sarvesh': 'cmm0ab43c0009jbzo3zi18c34',
  'Pune': 'cmm7vhp130002l804xl5pyci4',
  'Vedant': 'cmmanijiv000alb04panqg5un',
  'Karad': 'cmmd0h1a4002gju04jnu1ckts', // clearconcepts.stock@gmail.com
};

function parseName(fullName) {
  const parts = fullName.trim().split(/\s+/);
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

async function main() {
  const fileBuffer = readFileSync('e:/freelance/finance-crm/crm-documents/Copy of Client Master updated.xlsx');
  const wb = XLSX.read(fileBuffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const clients = [];
  const skipped = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const clientCode = row[0]?.toString().trim();
    const fullName = row[1]?.toString().trim();
    const phone = row[2]?.toString().trim();
    const department = 'EQUITY'; // All are Equity
    const operatorName = row[4]?.toString().trim();

    if (!clientCode || !fullName || !operatorName) {
      skipped.push({ row: i + 1, reason: 'Missing required field', data: row });
      continue;
    }

    const operatorId = OPERATOR_MAP[operatorName];
    if (!operatorId) {
      skipped.push({ row: i + 1, reason: `Unknown operator: "${operatorName}"`, data: row });
      continue;
    }

    const { firstName, middleName, lastName } = parseName(fullName);

    clients.push({
      clientCode,
      firstName,
      middleName,
      lastName,
      phone: phone || '',
      department,
      operatorId,
    });
  }

  console.log(`Parsed ${clients.length} clients to import, ${skipped.length} skipped`);
  if (skipped.length > 0) {
    console.log('Skipped rows:');
    skipped.forEach(s => console.log(`  Row ${s.row}: ${s.reason}`));
  }

  // Batch insert in chunks of 100
  const CHUNK = 100;
  let inserted = 0;
  let duplicates = 0;

  for (let i = 0; i < clients.length; i += CHUNK) {
    const chunk = clients.slice(i, i + CHUNK);
    for (const c of chunk) {
      try {
        await prisma.client.create({ data: c });
        inserted++;
      } catch (err) {
        if (err.code === 'P2002') {
          duplicates++;
          console.warn(`  Duplicate clientCode: ${c.clientCode}`);
        } else {
          console.error(`  Error inserting ${c.clientCode}:`, err.message);
        }
      }
    }
    process.stdout.write(`\rInserted ${Math.min(i + CHUNK, clients.length)}/${clients.length}...`);
  }

  console.log(`\nDone! Inserted: ${inserted}, Duplicates skipped: ${duplicates}, Parsing skipped: ${skipped.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

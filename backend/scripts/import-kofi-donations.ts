/**
 * import ko-fi donations from csv export
 * usage: npx ts-node --esm scripts/import-kofi-donations.ts <csv-file>
 */
import { pool } from '../src/db/connection.js';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

interface KofiCsvRow {
  'DateTime (UTC)': string;
  From: string;
  Message: string;
  Item: string;
  Received: string;
  Given: string;
  Currency: string;
  TransactionType: string;
  TransactionId: string;
  Reference: string;
  SalesTax: string;
  SalesTaxPercentage: string;
  SalesTaxIncludesShipping: string;
  BuyerCountry: string;
  BuyerStateOrProvince: string;
  BuyerEmail: string;
  PaymentProvider: string;
}

interface AccountRow extends RowDataPacket {
  account_name: string;
}

interface DonationRow extends RowDataPacket {
  id: number;
}

async function findAccountByEmail(email: string): Promise<string | null> {
  const [rows] = await pool.query<AccountRow[]>(
    'SELECT account_name FROM accounts WHERE email = ? LIMIT 1',
    [email.toLowerCase()],
  );
  return rows.length > 0 ? rows[0].account_name : null;
}

async function isDuplicate(transactionId: string): Promise<boolean> {
  const [rows] = await pool.query<DonationRow[]>(
    'SELECT id FROM donations WHERE kofi_message_id = ?',
    [transactionId],
  );
  return rows.length > 0;
}

async function importDonations(csvPath: string) {
  console.log(`\nreading ${csvPath}...\n`);

  const csvContent = readFileSync(csvPath, 'utf-8');
  const records: KofiCsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });

  console.log(`found ${records.length} donations\n`);

  const matched: Array<{ from: string; amount: string; account: string; email: string }> = [];
  const unmatched: Array<{ from: string; amount: string; email: string }> = [];
  const skipped: Array<{ from: string; reason: string }> = [];

  for (const row of records) {
    const transactionId = row.TransactionId;
    const amount = parseFloat(row.Received);
    const email = row.BuyerEmail?.toLowerCase() || '';
    const fromName = row.From;
    const message = row.Message || null;
    const currency = row.Currency || 'USD';
    const timestamp = row['DateTime (UTC)'];

    // skip non-tip transactions
    if (row.TransactionType !== 'Tip') {
      skipped.push({ from: fromName, reason: `not a tip (${row.TransactionType})` });
      continue;
    }

    // check for duplicate
    if (await isDuplicate(transactionId)) {
      skipped.push({ from: fromName, reason: 'already imported' });
      continue;
    }

    // try to match account
    const accountName = await findAccountByEmail(email);

    // insert donation
    await pool.query<ResultSetHeader>(
      `INSERT INTO donations
       (kofi_message_id, account_name, kofi_email, kofi_name, amount, currency, type, message, is_public, is_subscription, is_first_subscription, tier_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Donation', ?, true, false, false, null, ?)`,
      [transactionId, accountName, email, fromName, amount, currency, message, new Date(timestamp)],
    );

    // update account total if matched
    if (accountName) {
      await pool.query(
        'UPDATE accounts SET total_donated = total_donated + ? WHERE account_name = ?',
        [amount, accountName],
      );
      matched.push({ from: fromName, amount: row.Received, account: accountName, email });
    } else {
      unmatched.push({ from: fromName, amount: row.Received, email });
    }
  }

  // print summary
  console.log('='.repeat(60));
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(60));

  if (matched.length > 0) {
    console.log(`\n✓ LINKED TO ACCOUNTS (${matched.length}):`);
    console.log('-'.repeat(60));
    for (const d of matched) {
      console.log(`  ${d.from.padEnd(20)} $${d.amount.padStart(8)} → ${d.account}`);
    }
  }

  if (unmatched.length > 0) {
    console.log(`\n✗ NO ACCOUNT MATCH (${unmatched.length}):`);
    console.log('-'.repeat(60));
    for (const d of unmatched) {
      console.log(`  ${d.from.padEnd(20)} $${d.amount.padStart(8)}   email: ${d.email}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\n⊘ SKIPPED (${skipped.length}):`);
    console.log('-'.repeat(60));
    for (const d of skipped) {
      console.log(`  ${d.from.padEnd(20)} - ${d.reason}`);
    }
  }

  console.log('\n');
  process.exit(0);
}

// run
const csvFile = process.argv[2];
if (!csvFile) {
  console.error('usage: npx ts-node --esm scripts/import-kofi-donations.ts <csv-file>');
  process.exit(1);
}

importDonations(csvFile).catch((err) => {
  console.error('import failed:', err);
  process.exit(1);
});

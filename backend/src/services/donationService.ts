import { pool } from '../db/connection.js';
import redis from '../db/redis.js';
import logger from '../utils/logger.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface KofiDonation {
  message_id: string;
  type: string;
  amount: string;
  currency: string;
  from_name: string;
  email: string;
  message: string | null;
  is_public: boolean;
  timestamp: string;
  is_subscription_payment: boolean;
  is_first_subscription_payment: boolean;
  tier_name: string | null;
}

interface AccountRow extends RowDataPacket {
  account_name: string;
}

interface DonationRow extends RowDataPacket {
  id: number;
}

interface CharacterRow extends RowDataPacket {
  char_name: string;
}

/**
 * check if donation already processed (by kofi message_id)
 */
export async function isDuplicateDonation(messageId: string): Promise<boolean> {
  const [rows] = await pool.query<DonationRow[]>(
    'SELECT id FROM donations WHERE kofi_message_id = ?',
    [messageId]
  );
  return rows.length > 0;
}

/**
 * find account by email
 */
export async function findAccountByEmail(email: string): Promise<string | null> {
  const [rows] = await pool.query<AccountRow[]>(
    'SELECT account_name FROM accounts WHERE email = ? LIMIT 1',
    [email.toLowerCase()]
  );
  return rows.length > 0 ? rows[0].account_name : null;
}

/**
 * get primary character name for account (most recently played)
 */
export async function getPrimaryCharacter(accountName: string): Promise<string | null> {
  const [rows] = await pool.query<CharacterRow[]>(
    `SELECT char_name FROM account_characters
     WHERE account_name = ? AND blocked = 0
     ORDER BY last_login DESC LIMIT 1`,
    [accountName]
  );
  return rows.length > 0 ? rows[0].char_name : null;
}

/**
 * store donation and update account total
 */
export async function processDonation(donation: KofiDonation): Promise<{
  accountName: string | null;
  characterName: string | null;
  amount: number;
}> {
  const amount = parseFloat(donation.amount);
  const accountName = await findAccountByEmail(donation.email);
  let characterName: string | null = null;

  if (accountName) {
    characterName = await getPrimaryCharacter(accountName);
  }

  // insert donation record
  await pool.query<ResultSetHeader>(
    `INSERT INTO donations
     (kofi_message_id, account_name, kofi_email, kofi_name, amount, currency, type, message, is_public, is_subscription, is_first_subscription, tier_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      donation.message_id,
      accountName,
      donation.email.toLowerCase(),
      donation.from_name,
      amount,
      donation.currency || 'USD',
      donation.type,
      donation.message,
      donation.is_public,
      donation.is_subscription_payment,
      donation.is_first_subscription_payment,
      donation.tier_name,
    ]
  );

  // update account total if matched
  if (accountName) {
    await pool.query(
      'UPDATE accounts SET total_donated = total_donated + ? WHERE account_name = ?',
      [amount, accountName]
    );
  }

  logger.info(`donation processed: $${amount} from ${donation.from_name} (account: ${accountName || 'unmatched'})`);

  return { accountName, characterName, amount };
}

/**
 * publish donation to redis for mud nchat
 */
export async function publishDonationToMud(
  characterName: string | null,
  amount: number,
  currency: string,
  message: string | null,
  isPublic: boolean
): Promise<void> {
  const payload = {
    racewar: 'all',
    type: 'donation',
    character_name: characterName,
    amount,
    currency,
    message: message || '',
    is_public: isPublic,
  };

  await redis.publish('mud:nchat', JSON.stringify(payload));
  logger.info(`donation published to mud:nchat: ${JSON.stringify(payload)}`);
}

/**
 * get donation stats for an account
 */
export async function getAccountDonationTotal(accountName: string): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT total_donated FROM accounts WHERE account_name = ?',
    [accountName]
  );
  return rows.length > 0 ? parseFloat(rows[0].total_donated) || 0 : 0;
}

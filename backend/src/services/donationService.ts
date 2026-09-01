import crypto from 'node:crypto';
import { pool as webPool, mudPool } from '../db/connection.js';
import logger from '../utils/logger.js';
import type { PoolConnection } from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { parseDonationAmountCents, sanitizeMudText } from '../utils/donationEvent.js';
import { validateDonationDeliveryConfiguration } from './donationOutboxService.js';

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

interface CharacterRow extends RowDataPacket {
  char_name: string;
}

interface DonationRow extends RowDataPacket {
  id: number;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY'
  );
}

/**
 * Find the account in the authoritative MUD database by email.
 */
export async function findAccountByEmail(email: string): Promise<string | null> {
  const [rows] = await mudPool.query<AccountRow[]>(
    'SELECT account_name FROM accounts WHERE email = ? LIMIT 1',
    [email.toLowerCase()],
  );
  return rows.length > 0 ? rows[0].account_name : null;
}

/**
 * Get the primary character from the authoritative MUD database.
 */
export async function getPrimaryCharacter(accountName: string): Promise<string | null> {
  const [rows] = await mudPool.query<CharacterRow[]>(
    `SELECT char_name FROM account_characters
     WHERE account_name = ? AND blocked = 0
     ORDER BY last_login DESC LIMIT 1`,
    [accountName],
  );
  return rows.length > 0 ? rows[0].char_name : null;
}

export interface DonationRecordResult {
  duplicate: boolean;
  eventId: string | null;
  accountName: string | null;
  characterName: string | null;
  amount: number;
  amountCents: number;
}

/**
 * Record a validated Ko-fi donation and enqueue its MUD event atomically in
 * the WebService database. Duplicate callbacks are resolved by the unique
 * provider message ID, not by a race-prone read-before-write check.
 */
export async function recordDonation(donation: KofiDonation): Promise<DonationRecordResult> {
  validateDonationDeliveryConfiguration();

  const amountCents = parseDonationAmountCents(donation.amount);
  const accountName = await findAccountByEmail(donation.email);
  const characterName = accountName ? await getPrimaryCharacter(accountName) : null;
  const safeCharacterName = sanitizeMudText(characterName, 32) || null;
  const safeMessage = sanitizeMudText(donation.message, 256) || null;
  const mudIsPublic = donation.is_public && safeCharacterName !== null;
  const eventId = crypto.randomUUID();
  const connection: PoolConnection = await webPool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO donations
       (kofi_message_id, account_name, kofi_email, kofi_name, amount, currency, type, message, is_public, is_subscription, is_first_subscription, tier_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        donation.message_id,
        accountName,
        donation.email.toLowerCase(),
        donation.from_name,
        (amountCents / 100).toFixed(2),
        donation.currency,
        donation.type,
        donation.message ?? null,
        donation.is_public,
        donation.is_subscription_payment,
        donation.is_first_subscription_payment,
        donation.tier_name ?? null,
      ],
    );

    if (accountName) {
      await connection.query(
        `INSERT INTO web_donation_totals (account_name, total_cents)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
           total_cents = total_cents + VALUES(total_cents),
           updated_at = UTC_TIMESTAMP()`,
        [accountName, amountCents],
      );
    }

    await connection.query(
      `INSERT INTO donation_outbox
       (donation_id, event_id, amount_cents, currency, is_public, character_name, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        eventId,
        amountCents,
        donation.currency,
        mudIsPublic,
        safeCharacterName,
        safeMessage,
      ],
    );

    await connection.commit();

    if (donation.is_public && !mudIsPublic) {
      logger.warn(
        `donation ${eventId} recorded privately because no safe MUD character identity was available`,
      );
    }
    logger.info(`donation recorded and queued: event_id=${eventId} amount_cents=${amountCents}`);

    return {
      duplicate: false,
      eventId,
      accountName,
      characterName,
      amount: amountCents / 100,
      amountCents,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      logger.error('donation transaction rollback failed:', rollbackError);
    }

    if (isDuplicateKeyError(error)) {
      try {
        const [duplicateRows] = await webPool.query<DonationRow[]>(
          'SELECT id FROM donations WHERE kofi_message_id = ? LIMIT 1',
          [donation.message_id],
        );
        if (duplicateRows.length > 0) {
          logger.info(`kofi webhook duplicate ignored: message_id=${donation.message_id}`);
          return {
            duplicate: true,
            eventId: null,
            accountName: null,
            characterName: null,
            amount: 0,
            amountCents: 0,
          };
        }
      } catch (duplicateCheckError) {
        logger.error('donation duplicate check failed:', duplicateCheckError);
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get the WebService-owned donation total for an account.
 */
export async function getAccountDonationTotal(accountName: string): Promise<number> {
  const [rows] = await webPool.query<RowDataPacket[]>(
    'SELECT total_cents FROM web_donation_totals WHERE account_name = ?',
    [accountName],
  );
  return rows.length > 0 ? Number(rows[0].total_cents) / 100 : 0;
}

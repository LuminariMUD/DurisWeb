import { pool as db } from '../db/connection.js';
import logger from '../utils/logger.js';

/**
 * Multi-Account Detection Service
 *
 * Provides algorithms for detecting suspicious multi-account behavior based on:
 * - Shared IP addresses
 * - Overlapping login sessions
 * - Rapid account switching
 * - Geographic patterns
 */

export interface SharedIPAccount {
  ip_address: string;
  account_count: number;
  accounts: string[];
  first_seen: Date;
  last_seen: Date;
  total_connections: number;
}

export interface OverlappingSession {
  ip_address: string;
  account1: string;
  account2: string;
  character1: string;
  character2: string;
  overlap_start: Date;
  overlap_end: Date;
  overlap_duration_minutes: number;
}

export interface SuspicionEvidence {
  shared_ip_accounts: number;
  overlapping_sessions: number;
  rapid_switches: number;
  same_ip_within_hour: boolean;
  total_ips_used: number;
  suspicious_ips: string[];
}

export interface SuspiciousAccount {
  account_name: string;
  suspicion_score: number;
  evidence: SuspicionEvidence;
  flagged_at?: Date;
  is_resolved?: boolean;
  reviewed_at?: Date | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
}

/**
 * Find all accounts that share IP addresses
 */
export async function findAccountsBySharedIP(minAccounts: number = 2): Promise<SharedIPAccount[]> {
  try {
    const [results] = await db.query(
      `
      SELECT
        ip_address,
        COUNT(DISTINCT account_name) as account_count,
        MIN(timestamp) as first_seen,
        MAX(timestamp) as last_seen,
        COUNT(*) as total_connections
      FROM account_login_history
      WHERE ip_address IS NOT NULL AND status = 'login'
      GROUP BY ip_address
      HAVING COUNT(DISTINCT account_name) >= ?
      ORDER BY account_count DESC
    `,
      [minAccounts],
    );

    // For each IP, get the list of accounts
    const sharedIPAccounts: SharedIPAccount[] = [];
    for (const row of results as any[]) {
      const [accounts] = await db.query(
        "SELECT DISTINCT account_name FROM account_login_history WHERE ip_address = ? AND status = 'login'",
        [row.ip_address],
      );

      sharedIPAccounts.push({
        ip_address: row.ip_address,
        account_count: parseInt(row.account_count),
        accounts: (accounts as any[]).map((a) => a.account_name),
        first_seen: new Date(row.first_seen),
        last_seen: new Date(row.last_seen),
        total_connections: parseInt(row.total_connections),
      });
    }

    return sharedIPAccounts;
  } catch (error) {
    logger.error('Error finding accounts by shared IP:', error);
    return [];
  }
}

/**
 * Find overlapping login sessions from the same IP
 */
export async function findOverlappingSessions(
  hoursBack: number = 24,
): Promise<OverlappingSession[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

    const query = `
      SELECT
        l1.ip_address,
        l1.account_name as account1,
        l1.character_name as character1,
        l1.timestamp as login1,
        COALESCE(
          (SELECT MIN(timestamp)
           FROM account_login_history lo1
           WHERE lo1.account_name = l1.account_name
             AND lo1.status = 'logout'
             AND lo1.timestamp > l1.timestamp
          ),
          NOW()
        ) as logout1,
        l2.account_name as account2,
        l2.character_name as character2,
        l2.timestamp as login2,
        COALESCE(
          (SELECT MIN(timestamp)
           FROM account_login_history lo2
           WHERE lo2.account_name = l2.account_name
             AND lo2.status = 'logout'
             AND lo2.timestamp > l2.timestamp
          ),
          NOW()
        ) as logout2
      FROM account_login_history l1
      JOIN account_login_history l2
        ON l1.ip_address = l2.ip_address
        AND l1.account_name < l2.account_name
        AND l1.status = 'login'
        AND l2.status = 'login'
      WHERE l1.timestamp >= ?
        AND l2.timestamp >= ?
        AND l1.ip_address IS NOT NULL
      HAVING (login1 < logout2 AND login2 < logout1)
      ORDER BY l1.timestamp DESC
      LIMIT 100
    `;

    const [results] = await db.query(query, [cutoffDate, cutoffDate]);

    return (results as any[]).map((row: any) => {
      const login1 = new Date(row.login1);
      const logout1 = new Date(row.logout1);
      const login2 = new Date(row.login2);
      const logout2 = new Date(row.logout2);

      const overlapStart = login1 > login2 ? login1 : login2;
      const overlapEnd = logout1 < logout2 ? logout1 : logout2;
      const durationMs = overlapEnd.getTime() - overlapStart.getTime();
      const durationMinutes = Math.floor(durationMs / (1000 * 60));

      return {
        ip_address: row.ip_address,
        account1: row.account1,
        account2: row.account2,
        character1: row.character1 || 'Unknown',
        character2: row.character2 || 'Unknown',
        overlap_start: overlapStart,
        overlap_end: overlapEnd,
        overlap_duration_minutes: durationMinutes,
      };
    });
  } catch (error) {
    logger.error('Error finding overlapping sessions:', error);
    return [];
  }
}

/**
 * Calculate suspicion score for an account
 */
export function calculateSuspicionScore(evidence: SuspicionEvidence): number {
  let score = 0;

  if (evidence.shared_ip_accounts >= 2) {
    score += Math.min(30, evidence.shared_ip_accounts * 10);
  }

  if (evidence.overlapping_sessions > 0) {
    score += Math.min(60, evidence.overlapping_sessions * 20);
  }

  if (evidence.rapid_switches > 0) {
    score += Math.min(25, evidence.rapid_switches * 5);
  }

  if (evidence.same_ip_within_hour) {
    score += 25;
  }

  if (evidence.total_ips_used > 3) {
    score -= 10;
  }

  return Math.min(Math.max(score, 0), 100);
}

/**
 * Gather evidence for a specific account
 */
export async function gatherAccountEvidence(accountName: string): Promise<SuspicionEvidence> {
  try {
    // Get all IPs used by this account
    const [ipsUsed] = await db.query(
      'SELECT DISTINCT ip_address FROM account_login_history WHERE account_name = ? AND ip_address IS NOT NULL',
      [accountName],
    );
    const ipList = (ipsUsed as any[]).map((r) => r.ip_address);

    // For each IP, check if other accounts use it
    const sharedIPAccounts = new Set<string>();
    for (const ip of ipList) {
      const [accounts] = await db.query(
        'SELECT DISTINCT account_name FROM account_login_history WHERE ip_address = ? AND account_name != ?',
        [ip, accountName],
      );
      (accounts as any[]).forEach((acc) => sharedIPAccounts.add(acc.account_name));
    }

    // Check for overlapping sessions
    const [overlappingSessions] = await db.query(
      `
      SELECT COUNT(*) as count
      FROM account_login_history l1
      JOIN account_login_history l2
        ON l1.ip_address = l2.ip_address
        AND l1.account_name = ?
        AND l2.account_name != ?
        AND l1.status = 'login'
        AND l2.status = 'login'
        AND l1.timestamp < (
          SELECT COALESCE(MIN(timestamp), NOW())
          FROM account_login_history
          WHERE account_name = l2.account_name
            AND status = 'logout'
            AND timestamp > l2.timestamp
        )
        AND l2.timestamp < (
          SELECT COALESCE(MIN(timestamp), NOW())
          FROM account_login_history
          WHERE account_name = l1.account_name
            AND status = 'logout'
            AND timestamp > l1.timestamp
        )
    `,
      [accountName, accountName],
    );

    const overlapCount = (overlappingSessions as any)[0].count;

    // Check for rapid account switching
    const [rapidSwitches] = await db.query(
      `
      SELECT COUNT(*) as count
      FROM account_login_history l1
      JOIN account_login_history l2
        ON l1.ip_address = l2.ip_address
        AND l1.account_name = ?
        AND l2.account_name != ?
        AND l1.status = 'login'
        AND l2.status = 'logout'
        AND l1.timestamp BETWEEN l2.timestamp AND DATE_ADD(l2.timestamp, INTERVAL 5 MINUTE)
    `,
      [accountName, accountName],
    );

    const rapidCount = (rapidSwitches as any)[0].count;

    // Check for same IP within 1 hour
    const [recentLogins] = await db.query(
      "SELECT ip_address, timestamp FROM account_login_history WHERE account_name = ? AND status = 'login' AND timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR) ORDER BY timestamp DESC LIMIT 10",
      [accountName],
    );

    let sameIPWithinHour = false;
    const recentArray = recentLogins as any[];
    for (let i = 0; i < recentArray.length - 1; i++) {
      if (recentArray[i].ip_address === recentArray[i + 1].ip_address) {
        sameIPWithinHour = true;
        break;
      }
    }

    return {
      shared_ip_accounts: sharedIPAccounts.size,
      overlapping_sessions: parseInt(overlapCount),
      rapid_switches: parseInt(rapidCount),
      same_ip_within_hour: sameIPWithinHour,
      total_ips_used: ipList.length,
      suspicious_ips: ipList.filter(() => sharedIPAccounts.size > 0),
    };
  } catch (error) {
    logger.error(`Error gathering evidence for account ${accountName}:`, error);
    return {
      shared_ip_accounts: 0,
      overlapping_sessions: 0,
      rapid_switches: 0,
      same_ip_within_hour: false,
      total_ips_used: 0,
      suspicious_ips: [],
    };
  }
}

/**
 * Analyze an account and flag if suspicious
 */
export async function analyzeAndFlagAccount(
  accountName: string,
): Promise<SuspiciousAccount | null> {
  try {
    const evidence = await gatherAccountEvidence(accountName);
    const score = calculateSuspicionScore(evidence);

    if (score >= 70) {
      // Check if already flagged
      const [existing] = await db.query(
        'SELECT * FROM suspicious_accounts WHERE account_name = ? AND is_resolved = FALSE',
        [accountName],
      );

      if ((existing as any[]).length === 0) {
        // Insert new flag
        await db.query(
          'INSERT INTO suspicious_accounts (account_name, suspicion_score, evidence, flagged_at, is_resolved) VALUES (?, ?, ?, NOW(), FALSE)',
          [accountName, score, JSON.stringify(evidence)],
        );

        logger.info(`flagged suspicious account: ${accountName} (score: ${score})`);
      } else {
        // Update existing flag
        await db.query(
          'UPDATE suspicious_accounts SET suspicion_score = ?, evidence = ? WHERE account_name = ? AND is_resolved = FALSE',
          [score, JSON.stringify(evidence), accountName],
        );

        logger.info(`updated suspicious account flag: ${accountName} (score: ${score})`);
      }

      return {
        account_name: accountName,
        suspicion_score: score,
        evidence: evidence,
        flagged_at: new Date(),
      };
    }

    return null;
  } catch (error) {
    logger.error(`Error analyzing account ${accountName}:`, error);
    return null;
  }
}

/**
 * Get all flagged suspicious accounts
 */
export async function getSuspiciousAccounts(
  includeResolved: boolean = false,
): Promise<SuspiciousAccount[]> {
  try {
    const query = includeResolved
      ? 'SELECT * FROM suspicious_accounts ORDER BY suspicion_score DESC, flagged_at DESC'
      : 'SELECT * FROM suspicious_accounts WHERE is_resolved = FALSE ORDER BY suspicion_score DESC, flagged_at DESC';

    const [results] = await db.query(query);

    return (results as any[]).map((row: any) => ({
      account_name: row.account_name,
      suspicion_score: row.suspicion_score,
      evidence: typeof row.evidence === 'string' ? JSON.parse(row.evidence) : row.evidence,
      flagged_at: new Date(row.flagged_at),
      is_resolved: row.is_resolved,
      reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
      reviewed_by: row.reviewed_by || null,
      review_notes: row.review_notes || null,
    }));
  } catch (error) {
    logger.error('Error getting suspicious accounts:', error);
    return [];
  }
}

/**
 * Mark a suspicious account as reviewed/resolved
 */
export async function resolveAccountFlag(
  accountName: string,
  reviewedBy: string,
  notes?: string,
): Promise<boolean> {
  try {
    const [result] = await db.query(
      'UPDATE suspicious_accounts SET is_resolved = TRUE, reviewed_at = NOW(), reviewed_by = ?, review_notes = ? WHERE account_name = ? AND is_resolved = FALSE',
      [reviewedBy, notes || null, accountName],
    );

    return (result as any).affectedRows > 0;
  } catch (error) {
    logger.error(`Error resolving account flag for ${accountName}:`, error);
    return false;
  }
}

/**
 * Get connection timeline for an account
 */
export async function getConnectionTimeline(
  accountName: string,
  daysBack: number = 30,
): Promise<any[]> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const [timeline] = await db.query(
      'SELECT timestamp, character_name, ip_address, status FROM account_login_history WHERE account_name = ? AND timestamp >= ? ORDER BY timestamp ASC',
      [accountName, cutoffDate],
    );

    return timeline as any[];
  } catch (error) {
    logger.error(`Error getting connection timeline for ${accountName}:`, error);
    return [];
  }
}

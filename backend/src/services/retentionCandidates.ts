import { DATA_HOLD_MATCH_SQL } from './dataHoldSnapshot.js';

/** Required for unambiguous indexed TIMESTAMP bounds, including repeated DST hours. */
export const RETENTION_SQL_TIME_ZONE = '+00:00';

/** Literal targets only: no input can supply a table, column, predicate or SQL fragment. */
export const retentionCandidateRules = {
  analytics_events: {
    table: 'page_views',
    remove: `DELETE FROM page_views WHERE id=? AND created_at>=FROM_UNIXTIME(?) AND created_at<FROM_UNIXTIME(?) AND NOT (${DATA_HOLD_MATCH_SQL.replaceAll('candidate.', 'page_views.')})`,
    highWater: 'SELECT CAST(id AS CHAR) AS cursor_id FROM page_views ORDER BY id DESC LIMIT 1',
    select: `SELECT CAST(candidate.id AS CHAR) AS cursor_id, UNIX_TIMESTAMP(candidate.created_at) AS epoch,
      ${DATA_HOLD_MATCH_SQL} AS is_held FROM page_views candidate FORCE INDEX (idx_created_at)
      WHERE candidate.created_at >= FROM_UNIXTIME(?) AND candidate.created_at < FROM_UNIXTIME(?) AND candidate.id <= ?
        AND (candidate.created_at > FROM_UNIXTIME(?) OR (candidate.created_at = FROM_UNIXTIME(?) AND candidate.id > ?))
      ORDER BY candidate.created_at,candidate.id LIMIT ?`,
  },
  login_history: {
    table: 'account_login_history',
    remove: `DELETE FROM account_login_history WHERE id=? AND timestamp>=FROM_UNIXTIME(?) AND timestamp<FROM_UNIXTIME(?) AND NOT (${DATA_HOLD_MATCH_SQL.replaceAll('candidate.', 'account_login_history.')})`,
    highWater:
      'SELECT CAST(id AS CHAR) AS cursor_id FROM account_login_history ORDER BY id DESC LIMIT 1',
    select: `SELECT CAST(candidate.id AS CHAR) AS cursor_id, UNIX_TIMESTAMP(candidate.timestamp) AS epoch,
      ${DATA_HOLD_MATCH_SQL} AS is_held FROM account_login_history candidate FORCE INDEX (idx_timestamp)
      WHERE candidate.timestamp >= FROM_UNIXTIME(?) AND candidate.timestamp < FROM_UNIXTIME(?) AND candidate.id <= ?
        AND (candidate.timestamp > FROM_UNIXTIME(?) OR (candidate.timestamp = FROM_UNIXTIME(?) AND candidate.id > ?))
      ORDER BY candidate.timestamp,candidate.id LIMIT ?`,
  },
} as const;

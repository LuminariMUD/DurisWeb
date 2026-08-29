import { pool } from '../db/connection.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { UserPermissions } from './permissionService.js';
import { getCategoryAccessForAccount } from './categoryService.js';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ForumPoll {
  id: number;
  thread_id: number;
  question: string;
  is_multiple_choice: boolean;
  min_choices: number;
  max_choices: number;
  is_anonymous: boolean;
  results_visibility: 'always' | 'after_voting' | 'after_expiration';
  expires_at: Date | null;
  created_by_account: string;
  created_at: Date;
  is_closed: boolean;
}

export interface PollOption {
  id: number;
  pollId: number;
  optionText: string;
  sortOrder: number;
  voteCount: number;
}

export interface PollVote {
  id: number;
  poll_id: number;
  option_id: number;
  voter_account: string;
  voted_at: Date;
  updated_at: Date;
}

export interface PollCreationData {
  question: string;
  options: string[]; // Option texts in display order
  isMultipleChoice: boolean;
  minChoices: number;
  maxChoices: number;
  isAnonymous: boolean;
  resultsVisibility: 'always' | 'after_voting' | 'after_expiration';
  expiresAt?: Date;
}

export interface PollResultData {
  poll: ForumPoll;
  options: Array<PollOption & { voters?: string[] }>;
  totalVotes: number;
  userHasVoted: boolean;
  userVotes: number[]; // Option IDs user voted for
  canViewResults: boolean;
  isActive: boolean;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a poll is currently active (accepting votes)
 */
export function isPollActive(poll: ForumPoll): boolean {
  if (poll.is_closed) return false;
  if (!poll.expires_at) return true;
  return new Date(poll.expires_at) > new Date();
}

/**
 * Check if user can view poll results based on visibility settings
 */
export function canViewResults(
  poll: ForumPoll,
  hasVoted: boolean
): boolean {
  switch (poll.results_visibility) {
    case 'always':
      return true;
    case 'after_voting':
      return hasVoted;
    case 'after_expiration':
      return !isPollActive(poll);
    default:
      return false;
  }
}

// ============================================
// AUTHORIZATION HELPERS
// ============================================

interface PollAccess {
  poll: ForumPoll | null;
  threadId: number;
  categoryId: number;
  canView: boolean;
  canPost: boolean;
  canModerate: boolean;
}

async function getThreadAccess(threadId: number, permissions: UserPermissions): Promise<Omit<PollAccess, 'poll'> | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT category_id, is_deleted FROM forum_threads WHERE id = ?',
    [threadId],
  );
  if (rows.length === 0 || rows[0].is_deleted) return null;

  const access = await getCategoryAccessForAccount(Number(rows[0].category_id), permissions);
  return {
    threadId,
    categoryId: Number(rows[0].category_id),
    canView: access.canView,
    canPost: access.canPost,
    canModerate: access.canModerate,
  };
}

async function getPollAccess(pollId: number, permissions: UserPermissions): Promise<PollAccess | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.*, t.category_id, t.is_deleted AS thread_deleted
     FROM forum_polls p
     JOIN forum_threads t ON t.id = p.thread_id
     WHERE p.id = ?`,
    [pollId],
  );
  if (rows.length === 0 || rows[0].thread_deleted) return null;

  const access = await getCategoryAccessForAccount(Number(rows[0].category_id), permissions);
  return {
    poll: rows[0] as ForumPoll,
    threadId: Number(rows[0].thread_id),
    categoryId: Number(rows[0].category_id),
    canView: access.canView,
    canPost: access.canPost,
    canModerate: access.canModerate,
  };
}

// ============================================
// POLL CRUD OPERATIONS
// ============================================

/**
 * Create a poll for a thread
 */
export async function createPoll(
  threadId: number,
  pollData: PollCreationData,
  creatorAccount: string,
  permissions: UserPermissions,
): Promise<number> {
  const threadAccess = await getThreadAccess(threadId, permissions);
  if (!threadAccess?.canPost) {
    throw new Error('You do not have permission to create a poll in this category');
  }

  if (pollData.options.length < 2 || pollData.options.length > 10) {
    throw new Error('Poll must have between 2 and 10 options');
  }

  if (pollData.isMultipleChoice) {
    if (pollData.minChoices < 1) {
      throw new Error('Minimum choices must be at least 1');
    }
    if (pollData.maxChoices > pollData.options.length) {
      throw new Error('Maximum choices cannot exceed number of options');
    }
    if (pollData.minChoices > pollData.maxChoices) {
      throw new Error('Minimum choices cannot exceed maximum choices');
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Insert poll
    const [pollResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO forum_polls
       (thread_id, question, is_multiple_choice, min_choices, max_choices,
        is_anonymous, results_visibility, expires_at, created_by_account)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        threadId,
        pollData.question,
        pollData.isMultipleChoice,
        pollData.minChoices,
        pollData.maxChoices,
        pollData.isAnonymous,
        pollData.resultsVisibility,
        pollData.expiresAt || null,
        creatorAccount,
      ]
    );

    const pollId = pollResult.insertId;

    // Insert options
    const optionValues = pollData.options.map((text, index) => [
      pollId,
      text,
      index,
    ]);

    await connection.query(
      'INSERT INTO forum_poll_options (poll_id, option_text, sort_order) VALUES ?',
      [optionValues]
    );

    await connection.commit();
    return pollId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get poll by thread ID
 */
export async function getPollByThreadId(
  threadId: number,
  voterAccount: string | undefined,
  permissions: UserPermissions,
): Promise<PollResultData | null> {
  const threadAccess = await getThreadAccess(threadId, permissions);
  if (!threadAccess?.canView) return null;

  const connection = await pool.getConnection();
  try {
    // Get poll
    const [polls] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM forum_polls WHERE thread_id = ?',
      [threadId]
    );

    if (polls.length === 0) return null;

    const poll = polls[0] as ForumPoll;

    // Get options with vote counts
    const [options] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM forum_poll_options WHERE poll_id = ? ORDER BY sort_order ASC',
      [poll.id]
    );

    // Calculate total votes
    const totalVotes = options.reduce(
      (sum: number, opt: any) => sum + opt.vote_count,
      0
    );

    // Check if user has voted
    let userHasVoted = false;
    let userVotes: number[] = [];

    if (voterAccount) {
      const [votes] = await connection.query<RowDataPacket[]>(
        'SELECT option_id FROM forum_poll_votes WHERE poll_id = ? AND voter_account = ?',
        [poll.id, voterAccount]
      );

      userHasVoted = votes.length > 0;
      userVotes = votes.map((v: RowDataPacket) => v.option_id);
    }

    // Determine if user can view results
    const viewResults = canViewResults(poll, userHasVoted);

    // Get voters for each option if poll is public AND user can view results
    const optionsWithVoters: Array<PollOption & { voters?: string[] }> = await Promise.all(
      options.map(async (opt: RowDataPacket) => {
        const option: PollOption & { voters?: string[] } = {
          id: opt.id,
          pollId: opt.poll_id,
          optionText: opt.option_text,
          sortOrder: opt.sort_order,
          voteCount: opt.vote_count,
        };

        if (!poll.is_anonymous && viewResults) {
          const [voters] = await connection.query<RowDataPacket[]>(
            'SELECT voter_account FROM forum_poll_votes WHERE option_id = ? ORDER BY voted_at DESC',
            [opt.id]
          );
          option.voters = voters.map((v: RowDataPacket) => v.voter_account);
        }

        return option;
      })
    );

    return {
      poll,
      options: optionsWithVoters,
      totalVotes,
      userHasVoted,
      userVotes,
      canViewResults: viewResults,
      isActive: isPollActive(poll),
    };
  } finally {
    connection.release();
  }
}

/**
 * Get poll by ID
 */
export async function getPollById(
  pollId: number,
  permissions: UserPermissions,
): Promise<ForumPoll | null> {
  const pollAccess = await getPollAccess(pollId, permissions);
  if (!pollAccess?.canView) return null;

  return pollAccess.poll;
}

// ============================================
// VOTING OPERATIONS
// ============================================

/**
 * Cast or update vote on a poll
 */
export async function castVote(
  pollId: number,
  optionIds: number[],
  voterAccount: string,
  permissions: UserPermissions,
): Promise<void> {
  const pollAccess = await getPollAccess(pollId, permissions);
  if (!pollAccess?.canView) {
    throw new Error('Poll not found or access denied');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get poll
    const [polls] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM forum_polls WHERE id = ?',
      [pollId]
    );

    if (polls.length === 0) {
      throw new Error('Poll not found');
    }

    const poll = polls[0] as ForumPoll;

    // Check if poll is active
    if (!isPollActive(poll)) {
      throw new Error('This poll is no longer accepting votes');
    }

    // Validate option IDs belong to this poll
    const [options] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM forum_poll_options WHERE poll_id = ? AND id IN (?)',
      [pollId, optionIds]
    );

    if (options.length !== optionIds.length) {
      throw new Error('Invalid option IDs');
    }

    // Validate selection count
    if (poll.is_multiple_choice) {
      if (optionIds.length < poll.min_choices) {
        throw new Error(`Please select at least ${poll.min_choices} option(s)`);
      }
      if (optionIds.length > poll.max_choices) {
        throw new Error(`You can select at most ${poll.max_choices} option(s)`);
      }
    } else {
      if (optionIds.length !== 1) {
        throw new Error('Please select exactly one option');
      }
    }

    // Get user's current votes
    const [oldVotes] = await connection.query<RowDataPacket[]>(
      'SELECT option_id FROM forum_poll_votes WHERE poll_id = ? AND voter_account = ?',
      [pollId, voterAccount]
    );

    const oldOptionIds = oldVotes.map((v: RowDataPacket) => v.option_id);

    // Decrement old vote counts
    if (oldOptionIds.length > 0) {
      await connection.query(
        'UPDATE forum_poll_options SET vote_count = vote_count - 1 WHERE id IN (?)',
        [oldOptionIds]
      );

      // Delete old votes
      await connection.query(
        'DELETE FROM forum_poll_votes WHERE poll_id = ? AND voter_account = ?',
        [pollId, voterAccount]
      );
    }

    // Insert new votes
    const voteValues = optionIds.map((optionId) => [
      pollId,
      optionId,
      voterAccount,
    ]);

    await connection.query(
      'INSERT INTO forum_poll_votes (poll_id, option_id, voter_account) VALUES ?',
      [voteValues]
    );

    // Increment new vote counts
    await connection.query(
      'UPDATE forum_poll_options SET vote_count = vote_count + 1 WHERE id IN (?)',
      [optionIds]
    );

    // Log vote change to history
    await connection.query(
      'INSERT INTO forum_poll_vote_history (poll_id, voter_account, old_option_ids, new_option_ids) VALUES (?, ?, ?, ?)',
      [
        pollId,
        voterAccount,
        JSON.stringify(oldOptionIds),
        JSON.stringify(optionIds),
      ]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Remove user's vote from a poll
 */
export async function removeVote(
  pollId: number,
  voterAccount: string,
  permissions: UserPermissions,
): Promise<void> {
  const pollAccess = await getPollAccess(pollId, permissions);
  if (!pollAccess?.canView) {
    throw new Error('Poll not found or access denied');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get poll
    const poll = pollAccess.poll;
    if (!poll) {
      throw new Error('Poll not found');
    }

    // Check if poll is active
    if (!isPollActive(poll)) {
      throw new Error('This poll is no longer accepting votes');
    }

    // Get user's current votes
    const [votes] = await connection.query<RowDataPacket[]>(
      'SELECT option_id FROM forum_poll_votes WHERE poll_id = ? AND voter_account = ?',
      [pollId, voterAccount]
    );

    if (votes.length === 0) {
      throw new Error('You have not voted on this poll');
    }

    const optionIds = votes.map((v: RowDataPacket) => v.option_id);

    // Decrement vote counts
    await connection.query(
      'UPDATE forum_poll_options SET vote_count = vote_count - 1 WHERE id IN (?)',
      [optionIds]
    );

    // Delete votes
    await connection.query(
      'DELETE FROM forum_poll_votes WHERE poll_id = ? AND voter_account = ?',
      [pollId, voterAccount]
    );

    // Log vote removal to history
    await connection.query(
      'INSERT INTO forum_poll_vote_history (poll_id, voter_account, old_option_ids, new_option_ids) VALUES (?, ?, ?, ?)',
      [pollId, voterAccount, JSON.stringify(optionIds), JSON.stringify([])]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ============================================
// POLL MANAGEMENT
// ============================================

/**
 * Close a poll manually (creator or moderator)
 */
export async function closePoll(
  pollId: number,
  actorAccount: string,
  permissions: UserPermissions,
): Promise<void> {
  const pollAccess = await getPollAccess(pollId, permissions);
  if (!pollAccess?.poll) throw new Error('Poll not found or access denied');
  const isCreator = pollAccess.poll.created_by_account === actorAccount;
  if ((!isCreator || !pollAccess.canPost) && !pollAccess.canModerate) {
    throw new Error('Not authorized to close this poll');
  }

  const connection = await pool.getConnection();
  try {
    await connection.query('UPDATE forum_polls SET is_closed = TRUE WHERE id = ?', [
      pollId,
    ]);
  } finally {
    connection.release();
  }
}

/**
 * Delete a poll (creator or moderator)
 */
export async function deletePoll(
  pollId: number,
  actorAccount: string,
  permissions: UserPermissions,
): Promise<void> {
  const pollAccess = await getPollAccess(pollId, permissions);
  if (!pollAccess?.poll) throw new Error('Poll not found or access denied');
  const isCreator = pollAccess.poll.created_by_account === actorAccount;
  if ((!isCreator || !pollAccess.canPost) && !pollAccess.canModerate) {
    throw new Error('Not authorized to delete this poll');
  }

  const connection = await pool.getConnection();
  try {
    // CASCADE will delete options, votes, and history
    await connection.query('DELETE FROM forum_polls WHERE id = ?', [pollId]);
  } finally {
    connection.release();
  }
}

/**
 * Check if account is poll creator
 */
export async function isPollCreator(
  pollId: number,
  accountName: string
): Promise<boolean> {
  const connection = await pool.getConnection();
  try {
    const [polls] = await connection.query<RowDataPacket[]>(
      'SELECT created_by_account FROM forum_polls WHERE id = ?',
      [pollId]
    );

    return polls.length > 0 && polls[0].created_by_account === accountName;
  } finally {
    connection.release();
  }
}

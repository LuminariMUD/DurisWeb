import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import {
  parsePagination,
  validateHour,
  validateDateString,
  sanitizeSearchString,
  validateEnum,
  validateIdParam,
} from '../utils/validation.js';
import {
  getPvPEvents,
  getPvPEventDetail,
  getLeaderboard,
  getPlayerStats,
  searchPvPEvents,
  getLocationAutocomplete,
  getPlayerAutocomplete,
  getKillTimeline,
  getActiveHours,
  getPopularLocations,
  getClassMatchups,
  addBattleLike,
  removeBattleLike,
  addBattleFavorite,
  removeBattleFavorite,
  getBattleInteractionStats,
  getBattleComments,
  createBattleComment,
  updateBattleComment,
  deleteBattleComment,
  getBattleCommentById,
  getUserFavorites,
} from '../services/pvpService.js';
import { EventFilters, SearchFilters, PaginatedResponse } from '../types/index.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router: IRouter = Router();

/**
 * GET /api/pvp/events
 * Get paginated list of PvP events
 */
router.get(
  '/events',
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = parsePagination(
      req.query.page as string,
      req.query.limit as string,
      50,
      100
    );

    const filters: EventFilters = {
      player: sanitizeSearchString(req.query.player as string, 50),
      location: sanitizeSearchString(req.query.location as string, 100),
      date_from: validateDateString(req.query.date_from as string) || undefined,
      date_to: validateDateString(req.query.date_to as string) || undefined,
      hour: validateHour(req.query.hour as string),
      page,
      limit,
      sort_by: validateEnum(req.query.sort_by as string, ['date', 'likes'] as const, 'date'),
    };

    const { events, total } = await getPvPEvents(filters);

    const response: PaginatedResponse<typeof events[0]> = {
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    res.json(response);
  })
);

/**
 * GET /api/pvp/events/:event_id
 * Get detailed information for a single PvP event
 */
router.get(
  '/events/:event_id',
  asyncHandler(async (req: Request, res: Response) => {
    const eventId = validateIdParam(req.params.event_id);

    if (eventId === null) {
      throw new AppError('Invalid event ID', 400);
    }

    const event = await getPvPEventDetail(eventId);

    if (!event) {
      throw new AppError('Event not found', 404);
    }

    res.json(event);
  })
);

/**
 * GET /api/pvp/stats/leaderboard
 * Get leaderboard data
 */
router.get(
  '/stats/leaderboard',
  asyncHandler(async (req: Request, res: Response) => {
    let type = (req.query.type as string) || 'kills';
    const period = (req.query.period as string) || '7d';

    // Normalize kd_ratio to kd for backward compatibility
    if (type === 'kd_ratio') {
      type = 'kd';
    }

    if (!['kills', 'deaths', 'kd'].includes(type)) {
      throw new AppError('Invalid leaderboard type. Must be: kills, deaths, kd, or kd_ratio', 400);
    }

    if (!['7d', '30d', 'all'].includes(period)) {
      throw new AppError('Invalid period. Must be: 7d, 30d, or all', 400);
    }

    const leaderboard = await getLeaderboard(
      type as 'kills' | 'deaths' | 'kd',
      period as '7d' | '30d' | 'all'
    );

    // Use 'entries' key to match frontend expectation
    res.json({
      type: req.query.type as string, // Return original type (kd_ratio if sent)
      period,
      entries: leaderboard,
    });
  })
);

/**
 * GET /api/pvp/stats/player/:name
 * Get statistics for a specific player
 */
router.get(
  '/stats/player/:name',
  asyncHandler(async (req: Request, res: Response) => {
    const playerName = req.params.name;

    if (!playerName) {
      throw new AppError('Player name is required', 400);
    }

    const stats = await getPlayerStats(playerName);

    if (!stats) {
      throw new AppError('Player not found or has no PvP history', 404);
    }

    res.json(stats);
  })
);

/**
 * GET /api/pvp/search
 * Advanced search for PvP events
 */
router.get(
  '/search',
  asyncHandler(async (req: Request, res: Response) => {
    const hourParam = req.query.hour as string;
    const filters: SearchFilters = {
      player: req.query.player as string,
      location: req.query.location as string,
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
      hour: hourParam ? parseInt(hourParam) : undefined,
      class: req.query.class as string,
      race: req.query.race as string,
      level_min: req.query.level_min ? parseInt(req.query.level_min as string) : undefined,
      level_max: req.query.level_max ? parseInt(req.query.level_max as string) : undefined,
      alignment: req.query.alignment as 'good' | 'evil' | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    };

    const { events, total } = await searchPvPEvents(filters);

    const page = filters.page || 1;
    const limit = filters.limit || 50;

    const response: PaginatedResponse<typeof events[0]> = {
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    res.json(response);
  })
);

/**
 * GET /api/pvp/locations
 * Location autocomplete
 */
router.get(
  '/locations',
  asyncHandler(async (req: Request, res: Response) => {
    const query = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // Allow empty query to return all locations (with pagination)
    const locations = await getLocationAutocomplete(query, page, limit);
    return res.json(locations);
  })
);

/**
 * GET /api/pvp/players
 * Player name autocomplete
 */
router.get(
  '/players',
  asyncHandler(async (req: Request, res: Response) => {
    const query = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // Allow empty query to return all players (with pagination)
    const players = await getPlayerAutocomplete(query, page, limit);
    return res.json(players);
  })
);

/**
 * GET /api/pvp/analytics/timeline?period=30d
 * Get kill timeline data
 */
router.get(
  '/analytics/timeline',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const period = (_req.query.period as '7d' | '30d' | '90d' | 'all') || '30d';
    // Validate period
    if (!['7d', '30d', '90d', 'all'].includes(period)) {
      res.status(400).json({ error: 'Invalid period. Must be 7d, 30d, 90d, or all' });
      return;
    }
    const data = await getKillTimeline(period);
    res.json(data);
  })
);

/**
 * GET /api/pvp/analytics/active-hours?period=all
 * Get active hours heatmap data
 */
router.get(
  '/analytics/active-hours',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const period = (_req.query.period as '7d' | '30d' | '90d' | 'all') || 'all';
    // Validate period
    if (!['7d', '30d', '90d', 'all'].includes(period)) {
      res.status(400).json({ error: 'Invalid period. Must be 7d, 30d, 90d, or all' });
      return;
    }
    const data = await getActiveHours(period);
    res.json(data);
  })
);

/**
 * GET /api/pvp/analytics/popular-locations?limit=10&period=all
 * Get popular locations
 */
router.get(
  '/analytics/popular-locations',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const limit = _req.query.limit ? parseInt(_req.query.limit as string) : 10;
    const period = (_req.query.period as '7d' | '30d' | '90d' | 'all') || 'all';
    // Validate period
    if (!['7d', '30d', '90d', 'all'].includes(period)) {
      res.status(400).json({ error: 'Invalid period. Must be 7d, 30d, 90d, or all' });
      return;
    }
    const data = await getPopularLocations(limit, period);
    res.json(data);
  })
);

/**
 * GET /api/pvp/analytics/class-matchups?period=all
 * Get class matchup matrix
 */
router.get(
  '/analytics/class-matchups',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const period = (_req.query.period as '7d' | '30d' | '90d' | 'all') || 'all';
    // Validate period
    if (!['7d', '30d', '90d', 'all'].includes(period)) {
      res.status(400).json({ error: 'Invalid period. Must be 7d, 30d, 90d, or all' });
      return;
    }
    const data = await getClassMatchups(period);
    res.json(data);
  })
);

// ==================== BATTLE INTERACTIONS ====================

/**
 * GET /api/pvp/events/:event_id/stats
 * Get interaction stats for a battle (like count, comment count, user status)
 */
router.get(
  '/events/:event_id/stats',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const eventId = parseInt(req.params.event_id);
    if (isNaN(eventId)) {
      throw new AppError('Invalid event ID', 400);
    }

    const accountName = req.user?.accountName;
    const stats = await getBattleInteractionStats(eventId, accountName);
    res.json(stats);
  })
);

/**
 * POST /api/pvp/events/:event_id/like
 * Like a battle
 */
router.post(
  '/events/:event_id/like',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const eventId = parseInt(req.params.event_id);
    if (isNaN(eventId)) {
      throw new AppError('Invalid event ID', 400);
    }

    const accountName = req.user!.accountName;
    const success = await addBattleLike(eventId, accountName);

    if (!success) {
      throw new AppError('Already liked this battle', 400);
    }

    res.json({ success: true, message: 'Battle liked' });
  })
);

/**
 * DELETE /api/pvp/events/:event_id/like
 * Unlike a battle
 */
router.delete(
  '/events/:event_id/like',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const eventId = parseInt(req.params.event_id);
    if (isNaN(eventId)) {
      throw new AppError('Invalid event ID', 400);
    }

    const accountName = req.user!.accountName;
    const success = await removeBattleLike(eventId, accountName);

    if (!success) {
      throw new AppError('Not liked', 404);
    }

    res.json({ success: true, message: 'Like removed' });
  })
);

/**
 * POST /api/pvp/events/:event_id/favorite
 * Favorite a battle
 */
router.post(
  '/events/:event_id/favorite',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const eventId = parseInt(req.params.event_id);
    if (isNaN(eventId)) {
      throw new AppError('Invalid event ID', 400);
    }

    const accountName = req.user!.accountName;
    const success = await addBattleFavorite(eventId, accountName);

    if (!success) {
      throw new AppError('Already favorited this battle', 400);
    }

    res.json({ success: true, message: 'Battle favorited' });
  })
);

/**
 * DELETE /api/pvp/events/:event_id/favorite
 * Remove favorite from a battle
 */
router.delete(
  '/events/:event_id/favorite',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const eventId = parseInt(req.params.event_id);
    if (isNaN(eventId)) {
      throw new AppError('Invalid event ID', 400);
    }

    const accountName = req.user!.accountName;
    const success = await removeBattleFavorite(eventId, accountName);

    if (!success) {
      throw new AppError('Not favorited', 404);
    }

    res.json({ success: true, message: 'Favorite removed' });
  })
);

// ==================== BATTLE COMMENTS ====================

/**
 * GET /api/pvp/events/:event_id/comments
 * Get comments for a battle
 */
router.get(
  '/events/:event_id/comments',
  asyncHandler(async (req: Request, res: Response) => {
    const eventId = parseInt(req.params.event_id);
    if (isNaN(eventId)) {
      throw new AppError('Invalid event ID', 400);
    }

    const comments = await getBattleComments(eventId);
    res.json(comments);
  })
);

/**
 * POST /api/pvp/events/:event_id/comments
 * Create a comment on a battle
 */
router.post(
  '/events/:event_id/comments',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const eventId = parseInt(req.params.event_id);
    if (isNaN(eventId)) {
      throw new AppError('Invalid event ID', 400);
    }

    const { content, characterPid, parentId, quotedText, lineNumber, participantId } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new AppError('Content is required', 400);
    }

    if (content.length > 5000) {
      throw new AppError('Comment too long (max 5000 characters)', 400);
    }

    const accountName = req.user!.accountName;
    const comment = await createBattleComment(
      eventId,
      accountName,
      content.trim(),
      characterPid ? parseInt(characterPid) : undefined,
      parentId ? parseInt(parentId) : undefined,
      quotedText ? String(quotedText).slice(0, 500) : undefined,
      lineNumber != null ? parseInt(lineNumber) : undefined,
      participantId != null ? parseInt(participantId) : undefined
    );

    res.status(201).json(comment);
  })
);

/**
 * PATCH /api/pvp/comments/:comment_id
 * Update a comment
 */
router.patch(
  '/comments/:comment_id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const commentId = parseInt(req.params.comment_id);
    if (isNaN(commentId)) {
      throw new AppError('Invalid comment ID', 400);
    }

    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new AppError('Content is required', 400);
    }

    if (content.length > 5000) {
      throw new AppError('Comment too long (max 5000 characters)', 400);
    }

    const accountName = req.user!.accountName;
    const success = await updateBattleComment(commentId, accountName, content.trim());

    if (!success) {
      throw new AppError('Comment not found or not authorized', 404);
    }

    res.json({ success: true, message: 'Comment updated' });
  })
);

/**
 * DELETE /api/pvp/comments/:comment_id
 * Delete a comment
 */
router.delete(
  '/comments/:comment_id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const commentId = parseInt(req.params.comment_id);
    if (isNaN(commentId)) {
      throw new AppError('Invalid comment ID', 400);
    }

    const accountName = req.user!.accountName;
    const isModerator = req.user!.permissions?.canModerate || false;

    // Check if comment exists
    const comment = await getBattleCommentById(commentId);
    if (!comment) {
      throw new AppError('Comment not found', 404);
    }

    // Check authorization
    if (!isModerator && comment.accountName !== accountName) {
      throw new AppError('Not authorized to delete this comment', 403);
    }

    const success = await deleteBattleComment(commentId, accountName, isModerator);

    if (!success) {
      throw new AppError('Failed to delete comment', 500);
    }

    res.json({ success: true, message: 'Comment deleted' });
  })
);

// ==================== USER FAVORITES ====================

/**
 * GET /api/pvp/users/:accountName/favorites
 * Get a user's favorited battles
 */
router.get(
  '/users/:accountName/favorites',
  asyncHandler(async (req: Request, res: Response) => {
    const { accountName } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const { data, total } = await getUserFavorites(accountName, page, limit);

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

export default router;

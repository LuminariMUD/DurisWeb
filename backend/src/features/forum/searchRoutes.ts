import { parsePagination } from '../../utils/validation.js';
import { Router, Request, Response, type IRouter } from 'express';
import logger from '../../utils/logger.js';
import { query, validationResult } from 'express-validator';
import { searchForum, type SearchFilters } from '../../services/forumService.js';

export const forumSearchRoutes: IRouter = Router();

// ============================================================================
// Search Routes
// ============================================================================

/**
 * GET /api/forum/search
 * Search forum threads and posts
 */
forumSearchRoutes.get(
  '/search',

  [
    query('query')
      .isString()
      .bail()
      .trim()
      .isLength({ min: 2 })
      .withMessage('Search query must be at least 2 characters'),
    query('scope')
      .optional()
      .isString()
      .bail()
      .isIn(['titles', 'content', 'both'])
      .withMessage('Invalid scope'),
    query('author').optional().isString().bail().trim(),
    query('categoryId')
      .optional()
      .isString()
      .bail()
      .isInt()
      .withMessage('Category ID must be an integer'),
    query('dateFrom')
      .optional()
      .isString()
      .bail()
      .isISO8601()
      .withMessage('Invalid date format for dateFrom'),
    query('dateTo')
      .optional()
      .isString()
      .bail()
      .isISO8601()
      .withMessage('Invalid date format for dateTo'),
    query('page').optional().isString().bail().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('limit')
      .optional()
      .isString()
      .bail()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be 1-100'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.user?.permissions) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const text = (key: string): string | undefined => {
        const value = req.query[key];
        return typeof value === 'string' ? value : undefined;
      };
      const term = text('query');
      if (term === undefined) return res.status(400).json({ error: 'Invalid search query' });
      const { page, limit } = parsePagination(text('page'), text('limit'), 50, 100);
      const scope = text('scope');
      const category = text('categoryId');
      const filters: SearchFilters = {
        query: term.trim(),
        scope: scope === 'titles' || scope === 'content' || scope === 'both' ? scope : undefined,
        author: text('author')?.trim(),
        categoryId: category ? Number(category) : undefined,
        dateFrom: text('dateFrom'),
        dateTo: text('dateTo'),
      };

      const { results, total } = await searchForum(filters, req.user.permissions, page, limit);

      return res.json({
        results,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Search error:', error);
      return res.status(500).json({ error: 'Failed to perform search' });
    }
  },
);

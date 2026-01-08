import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getNewsContent } from '../services/newsService.js';

const router: IRouter = Router();

/**
 * GET /api/news
 * Get news content from mud_info table
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const content = await getNewsContent();

    res.json({
      content,
    });
  })
);

export default router;

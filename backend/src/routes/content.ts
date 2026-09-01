import { Router, type Router as ExpressRouter } from 'express';
import logger, { getErrorMessage } from '../utils/logger.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { processContentForWrite } from '../utils/contentParser.js';
import * as contentService from '../services/contentService.js';
import * as categoryService from '../services/categoryService.js';
import { extractClientIP } from '../utils/ipExtractor.js';
import { pool } from '../db/connection.js';
import { parseLatestNewsEntry } from '../utils/newsParser.js';
import { notifyNewsUpdate } from '../services/unifiedNotificationService.js';
import {
  validateBooleanField,
  validateIdParam,
  validateIntegerField,
  validateObjectFields,
  validateStringField,
} from '../utils/validation.js';

const router: ExpressRouter = Router();

type ContentWriteResult = { content: string } | { error: string };

function validateContentForWrite(value: unknown): ContentWriteResult {
  const result = processContentForWrite(value);
  return result.error ? { error: result.error } : { content: result.content };
}

function validateSingleContentBody(value: unknown): ContentWriteResult {
  const structureError = validateObjectFields(value, ['content']);
  if (structureError) {
    return { error: structureError };
  }

  const content = (value as Record<string, unknown>).content;
  return validateContentForWrite(content);
}

function validateHelpPageBody(value: unknown, requireCoreFields: boolean): string | null {
  const structureError = validateObjectFields(value, ['title', 'text', 'category_id']);
  if (structureError) {
    return structureError;
  }

  const fields = value as Record<string, unknown>;
  const titleError = validateStringField(
    fields.title,
    'title',
    255,
    requireCoreFields || fields.title !== undefined,
  );
  if (titleError) {
    return titleError;
  }

  const textError = validateStringField(
    fields.text,
    'text',
    50_000,
    requireCoreFields || fields.text !== undefined,
  );
  if (textError) {
    return textError;
  }

  return validateIntegerField(fields.category_id, 'category_id', {
    min: 0,
    max: 2_147_483_647,
    allowNull: true,
  });
}

function validateHelpCategoryBody(value: unknown, requireName: boolean): string | null {
  const structureError = validateObjectFields(value, ['name', 'desc', 'isArchived']);
  if (structureError) {
    return structureError;
  }

  const fields = value as Record<string, unknown>;
  const nameError = validateStringField(
    fields.name,
    'name',
    255,
    requireName || fields.name !== undefined,
  );
  if (nameError) {
    return nameError;
  }

  if (fields.desc !== undefined && fields.desc !== null) {
    const descError = validateStringField(fields.desc, 'desc', 255);
    if (descError) {
      return descError;
    }
  }

  const archiveError = validateBooleanField(fields.isArchived, 'isArchived');
  if (archiveError) {
    return archiveError;
  }

  if (!requireName && Object.keys(fields).length === 0) {
    return 'At least one category field is required';
  }

  return null;
}

// Helper function to log admin actions
async function logAdminAction(
  accountName: string,
  actionType: string,
  target: string,
  oldValue: string | null | undefined,
  newValue: string | null | undefined,
  notes: string | null | undefined,
  ipAddress: string | null | undefined,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        accountName,
        actionType,
        target,
        oldValue || null,
        newValue || null,
        notes || null,
        ipAddress,
      ],
    );
  } catch (error) {
    logger.error('Failed to log admin action:', error);
  }
}

// ===== HELP FILES ROUTES (pages table) =====

// GET /api/content/help - List all help pages (requires manage_help_files permission)
router.get('/help', requireAuth, requirePermission('manage_help_files'), async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const categoryId = req.query.category_id
      ? parseInt(req.query.category_id as string)
      : undefined;

    const result = await contentService.getAllHelpPages(page, limit, categoryId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/content/help/categories - List all categories (requires manage_help_files permission)
router.get(
  '/help/categories',
  requireAuth,
  requirePermission('manage_help_files'),
  async (_req, res) => {
    try {
      const categories = await contentService.getAllCategories();
      res.json({ categories });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  },
);

// GET /api/content/help/search - Search help pages (requires manage_help_files permission)
router.get(
  '/help/search',
  requireAuth,
  requirePermission('manage_help_files'),
  async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters' });
      }

      const results = await contentService.searchHelpPages(query);
      return res.json({ results });
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  },
);

// GET /api/content/help/:id - Get single help page by ID (requires manage_help_files permission)
router.get('/help/:id', requireAuth, requirePermission('manage_help_files'), async (req, res) => {
  try {
    const id = validateIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid help page ID' });
    }
    const page = await contentService.getHelpPageById(id);
    if (!page) {
      return res.status(404).json({ error: 'Help page not found' });
    }
    return res.json(page);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// POST /api/content/help - Create help page (requires manage_help_files permission)
router.post('/help', requireAuth, requirePermission('manage_help_files'), async (req, res) => {
  try {
    const validationError = validateHelpPageBody(req.body, true);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { title, text, category_id } = req.body;

    // Sanitize HTML content
    const processed = validateContentForWrite(text);
    if ('error' in processed) {
      return res.status(400).json({ error: processed.error });
    }
    const sanitizedText = processed.content;

    const page = await contentService.createHelpPage({
      title,
      text: sanitizedText,
      category_id: category_id ?? 0, // Default to 0 (General) if not provided
      last_update_by: req.user!.accountName,
      ip_number: extractClientIP(req) || undefined,
    });

    // Audit log
    await logAdminAction(
      req.user!.accountName,
      'help_file_create',
      `Help: ${title}`,
      undefined,
      `Created help file: ${title}`,
      undefined,
      extractClientIP(req),
    );

    return res.status(201).json(page);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// PATCH /api/content/help/:id - Update help page (requires manage_help_files permission)
router.patch('/help/:id', requireAuth, requirePermission('manage_help_files'), async (req, res) => {
  try {
    const validationError = validateHelpPageBody(req.body, false);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const id = validateIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'Invalid help page ID' });
    }
    const { title, text, category_id } = req.body;

    const updates: any = {
      last_update_by: req.user!.accountName,
      ip_number: extractClientIP(req) || undefined,
    };

    if (title !== undefined) updates.title = title;
    if (category_id !== undefined) updates.category_id = category_id ?? 0; // Default to 0 if null/undefined

    // Sanitize HTML content if provided
    if (text !== undefined) {
      const processed = validateContentForWrite(text);
      if ('error' in processed) {
        return res.status(400).json({ error: processed.error });
      }
      const sanitizedText = processed.content;
      updates.text = sanitizedText;
    }

    const page = await contentService.updateHelpPage(id, updates);

    if (!page) {
      return res.status(404).json({ error: 'Help page not found' });
    }

    // Audit log
    await logAdminAction(
      req.user!.accountName,
      'help_file_edit',
      `Help: ${page.title}`,
      undefined,
      `Updated help file: ${page.title}`,
      title ? `Title changed` : undefined,
      extractClientIP(req),
    );

    return res.json(page);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// DELETE /api/content/help/:id - Delete help page (requires manage_help_files permission)
router.delete(
  '/help/:id',
  requireAuth,
  requirePermission('manage_help_files'),
  async (req, res) => {
    try {
      const id = validateIdParam(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'Invalid help page ID' });
      }

      // Get title before deletion for audit log
      const [rows]: any = await pool.query('SELECT title FROM pages WHERE id = ?', [id]);
      const title = rows[0]?.title || `ID ${id}`;

      await contentService.deleteHelpPage(id);

      // Audit log
      await logAdminAction(
        req.user!.accountName,
        'help_file_delete',
        `Help: ${title}`,
        `Deleted help file: ${title}`,
        undefined,
        undefined,
        extractClientIP(req),
      );

      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  },
);

// ===== CATEGORY ROUTES =====

// GET /api/content/categories - Get all non-archived categories (requires manage_forum_categories permission)
router.get(
  '/categories',
  requireAuth,
  requirePermission('manage_forum_categories'),
  async (_req, res) => {
    try {
      const query =
        'SELECT * FROM forum_categories WHERE is_archived = 0 ORDER BY sort_order ASC, id ASC';

      const [rows] = await pool.query(query);
      const categories = (rows as any[]).map((cat) => ({
        ...cat,
        is_archived: Boolean(cat.is_archived),
      }));
      return res.json(categories);
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  },
);

// POST /api/content/categories - Create category (requires manage_forum_categories permission)
router.post(
  '/categories',
  requireAuth,
  requirePermission('manage_forum_categories'),
  async (req, res) => {
    try {
      const validationError = validateHelpCategoryBody(req.body, true);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const { name, desc } = req.body;

      const category = await contentService.createCategory({ name, desc });
      return res.status(201).json(category);
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  },
);

// PATCH /api/content/categories/:id - Update category (requires manage_forum_categories permission)
router.patch(
  '/categories/:id',
  requireAuth,
  requirePermission('manage_forum_categories'),
  async (req, res) => {
    try {
      const validationError = validateHelpCategoryBody(req.body, false);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const id = validateIdParam(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'Invalid category ID' });
      }
      const { isArchived, name, desc } = req.body;

      // Handle archive/restore
      if (isArchived !== undefined) {
        if (name !== undefined || desc !== undefined) {
          return res.status(400).json({ error: 'Archive changes cannot include name or desc' });
        }
        if (isArchived) {
          await categoryService.archiveCategory(id, req.user!.accountName);
        } else {
          await categoryService.restoreCategory(id);
        }
        return res.json({ success: true });
      }

      // Handle other updates (name, desc, etc.)
      const category = await contentService.updateCategory(id, { name, desc });

      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      return res.json(category);
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  },
);

// DELETE /api/content/categories/:id - Delete category (requires manage_forum_categories permission)
router.delete(
  '/categories/:id',
  requireAuth,
  requirePermission('manage_forum_categories'),
  async (req, res) => {
    try {
      const id = validateIdParam(req.params.id);
      if (id === null) {
        return res.status(400).json({ error: 'Invalid category ID' });
      }
      await categoryService.deleteCategoryPermanent(id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  },
);

// ===== MUD INFO ROUTES (motd, news, wizmotd) =====

// GET /api/content/motd - Get MOTD (requires manage_motd permission)
router.get('/motd', requireAuth, requirePermission('manage_motd'), async (_req, res) => {
  try {
    const motd = await contentService.getMotd();
    res.json({ motd: motd ? motd.content : null });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// PUT /api/content/motd - Update MOTD (requires manage_motd permission)
router.put('/motd', requireAuth, requirePermission('manage_motd'), async (req, res) => {
  try {
    const validated = validateSingleContentBody(req.body);
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error });
    }
    const sanitizedContent = validated.content;
    const motd = await contentService.setMotd(sanitizedContent);

    // Audit log
    await logAdminAction(
      req.user!.accountName,
      'motd_edit',
      'MOTD',
      undefined,
      'Updated MOTD',
      undefined,
      extractClientIP(req),
    );

    return res.json({ motd: motd?.content || null });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/content/news - Get MUD News (public)
router.get('/news', async (_req, res) => {
  try {
    const news = await contentService.getNews();
    res.json({ news: news ? news.content : null });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// PUT /api/content/news - Update MUD News (requires manage_news permission)
router.put('/news', requireAuth, requirePermission('manage_news'), async (req, res) => {
  try {
    const validated = validateSingleContentBody(req.body);
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error });
    }
    const sanitizedContent = validated.content;
    const news = await contentService.setNews(sanitizedContent);

    // Audit log
    await logAdminAction(
      req.user!.accountName,
      'news_edit',
      'MUD News',
      undefined,
      'Updated MUD news',
      undefined,
      extractClientIP(req),
    );

    return res.json({ news: news?.content || null });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// POST /api/content/news/announce - Announce news update to all users (requires manage_news permission)
router.post('/news/announce', requireAuth, requirePermission('manage_news'), async (req, res) => {
  try {
    // get current news content
    const news = await contentService.getNews();
    if (!news?.content) {
      return res.status(400).json({ error: 'No news content found' });
    }

    // parse latest entry
    const latestEntry = parseLatestNewsEntry(news.content);
    if (!latestEntry) {
      return res.status(400).json({
        error: 'Could not parse news entry. Make sure news starts with a date (M/D/YY format)',
      });
    }

    // broadcast to all users
    await notifyNewsUpdate(latestEntry.date, latestEntry.items);

    // Audit log
    await logAdminAction(
      req.user!.accountName,
      'news_announce',
      'MUD News',
      undefined,
      `Announced news update (${latestEntry.date})`,
      undefined,
      extractClientIP(req),
    );

    logger.info(`[News] ${req.user!.accountName} announced news update for ${latestEntry.date}`);

    return res.json({
      success: true,
      date: latestEntry.date,
      itemCount: latestEntry.items.length,
    });
  } catch (error) {
    logger.error('Error announcing news:', error);
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/content/wizmotd - Get Wizard MOTD (requires manage_motd permission)
router.get('/wizmotd', requireAuth, requirePermission('manage_motd'), async (_req, res) => {
  try {
    const wizmotd = await contentService.getWizMotd();
    return res.json({ wizmotd: wizmotd ? wizmotd.content : null });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// PUT /api/content/wizmotd - Update Wizard MOTD (requires manage_motd permission)
router.put('/wizmotd', requireAuth, requirePermission('manage_motd'), async (req, res) => {
  try {
    const validated = validateSingleContentBody(req.body);
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error });
    }
    const sanitizedContent = validated.content;
    const wizmotd = await contentService.setWizMotd(sanitizedContent);

    // Audit log
    await logAdminAction(
      req.user!.accountName,
      'motd_edit',
      'Wizard MOTD',
      undefined,
      'Updated Wizard MOTD',
      undefined,
      extractClientIP(req),
    );

    return res.json({ wizmotd: wizmotd?.content || null });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/content/mud-info - Get all MUD info entries (requires manage_motd permission)
router.get('/mud-info', requireAuth, requirePermission('manage_motd'), async (_req, res) => {
  try {
    const entries = await contentService.getAllMudInfo();
    return res.json({ entries });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/content/rules - Get MUD Rules (requires manage_motd permission)
router.get('/rules', requireAuth, requirePermission('manage_motd'), async (_req, res) => {
  try {
    const rules = await contentService.getRules();
    res.json({ rules: rules ? rules.content : null });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// PUT /api/content/rules - Update MUD Rules (requires manage_motd permission)
router.put('/rules', requireAuth, requirePermission('manage_motd'), async (req, res) => {
  try {
    const validated = validateSingleContentBody(req.body);
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error });
    }
    const sanitizedContent = validated.content;
    const rules = await contentService.setRules(sanitizedContent);

    // Audit log
    await logAdminAction(
      req.user!.accountName,
      'motd_edit',
      'MUD Rules',
      undefined,
      'Updated MUD Rules',
      undefined,
      extractClientIP(req),
    );

    return res.json({ rules: rules?.content || null });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/content/credits - Get MUD Credits (requires manage_motd permission)
router.get('/credits', requireAuth, requirePermission('manage_motd'), async (_req, res) => {
  try {
    const credits = await contentService.getCredits();
    res.json({ credits: credits ? credits.content : null });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// PUT /api/content/credits - Update MUD Credits (requires manage_motd permission)
router.put('/credits', requireAuth, requirePermission('manage_motd'), async (req, res) => {
  try {
    const validated = validateSingleContentBody(req.body);
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error });
    }
    const sanitizedContent = validated.content;
    const credits = await contentService.setCredits(sanitizedContent);

    // Audit log
    await logAdminAction(
      req.user!.accountName,
      'motd_edit',
      'MUD Credits',
      undefined,
      'Updated MUD Credits',
      undefined,
      extractClientIP(req),
    );

    return res.json({ credits: credits?.content || null });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/content/wizlist - Get MUD Wizlist (requires manage_motd permission)
router.get('/wizlist', requireAuth, requirePermission('manage_motd'), async (_req, res) => {
  try {
    const wizlist = await contentService.getWizlist();
    res.json({ wizlist: wizlist ? wizlist.content : null });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// PUT /api/content/wizlist - Update MUD Wizlist (requires manage_motd permission)
router.put('/wizlist', requireAuth, requirePermission('manage_motd'), async (req, res) => {
  try {
    const validated = validateSingleContentBody(req.body);
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error });
    }
    const sanitizedContent = validated.content;
    const wizlist = await contentService.setWizlist(sanitizedContent);

    // Audit log
    await logAdminAction(
      req.user!.accountName,
      'motd_edit',
      'MUD Wizlist',
      undefined,
      'Updated MUD Wizlist',
      undefined,
      extractClientIP(req),
    );

    return res.json({ wizlist: wizlist?.content || null });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

// GET /api/content/faq - Get MUD FAQ (requires manage_motd permission)
router.get('/faq', requireAuth, requirePermission('manage_motd'), async (_req, res) => {
  try {
    const faq = await contentService.getFaq();
    res.json({ faq: faq ? faq.content : null });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// PUT /api/content/faq - Update MUD FAQ (requires manage_motd permission)
router.put('/faq', requireAuth, requirePermission('manage_motd'), async (req, res) => {
  try {
    const validated = validateSingleContentBody(req.body);
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error });
    }
    const sanitizedContent = validated.content;
    const faq = await contentService.setFaq(sanitizedContent);

    // Audit log
    await logAdminAction(
      req.user!.accountName,
      'motd_edit',
      'MUD FAQ',
      undefined,
      'Updated MUD FAQ',
      undefined,
      extractClientIP(req),
    );

    return res.json({ faq: faq?.content || null });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

export default router;

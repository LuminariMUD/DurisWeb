import express, { type Application, type Request, type Response } from 'express';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';
import pvpRoutes from './routes/pvp.js';
import newsRoutes from './routes/news.js';
import authRoutes from './routes/auth.js';
import { forumRouter } from './features/forum/routes.js';
import { adminRouter } from './features/admin/routes.js';
import dataHoldRoutes from './routes/dataHolds.js';
import contentRoutes from './routes/content.js';
import fragRoutes from './routes/frag.js';
import userManagementRoutes from './routes/userManagement.js';
import zoneRoutes from './routes/zones.js';
import statusRoutes from './routes/status.js';
import serverRebootRoutes from './routes/serverReboot.js';
import gitRoutes from './routes/git.js';
import mudControlRoutes from './routes/mudControl.js';
import builderRoutes from './routes/builder.js';
import wikiRoutes from './routes/wiki.js';
import webAnalyticsRoutes from './routes/webAnalytics.js';
import privacyRoutes from './routes/privacy.js';
import helpRoutes from './routes/help.js';
import guideRoutes from './routes/guide.js';
import helpSuggestionsRoutes from './routes/helpSuggestions.js';
import notificationsRoutes from './routes/notifications.js';
import auctionRoutes from './routes/auction.js';
import pushRoutes from './routes/push.js';
import { changelogRouter } from './features/changelog/routes.js';
import publicStatisticsRoutes from './routes/publicStatistics.js';
import hookRoutes from './routes/hooks.js';
import kofiRoutes from './routes/kofi.js';
import { AppError, apiNotFound, errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { generateCsrfToken, verifyCsrfToken } from './middleware/csrf.js';
import { fingerprintedFrontendAssets } from './middleware/frontendAssets.js';
import { canonicalHost } from './middleware/canonicalHost.js';
import { configureRequestBodyParsers } from './middleware/requestLimits.js';
import { getPvPEventDetail } from './services/pvpService.js';
import { getWebSettings } from './services/webSettingsService.js';
import { getHealthSnapshot } from './services/healthService.js';
import { getBackendConfiguration } from './config/environment.js';
import { escapeHtml } from './utils/contentParser.js';

const frontendDistPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../frontend/dist',
);

/**
 * Compose the HTTP application: middleware, routes, metadata and static fallback,
 * in their behavior-carrying order. Starts no listener, job, integration or signal handler.
 */
export function createApp(): Application {
  const environment = getBackendConfiguration();
  const app: Application = express();

  // Trust proxy - required when running behind nginx/reverse proxy
  // This allows express-rate-limit to correctly identify users via X-Forwarded-For
  app.set('trust proxy', 1);

  // Redirect website aliases before issuing any host-only cookies or SPA assets.
  if (environment.environment === 'production') {
    app.use(canonicalHost(environment.siteUrl, environment.server.allowedOrigins));
  }

  // Middleware
  app.use(compression()); // Enable gzip/deflate compression for all responses
  configureRequestBodyParsers(app);
  app.use(cookieParser());

  // CORS configuration
  const allowedOrigins = environment.server.allowedOrigins;

  logger.info('CORS allowed origins:', allowedOrigins);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          logger.info(`[CORS] Blocked origin: "${origin}" (not in allowed list)`);
          callback(new AppError('Not allowed by CORS', 403));
        }
      },
      credentials: true,
    }),
  );

  // Public content-addressed files need no CSRF cookie. Keep canonical routing,
  // compression and CORS ahead of them, and all application routes behind CSRF.
  if (environment.environment === 'production') {
    app.use('/assets', fingerprintedFrontendAssets(frontendDistPath));
  }

  // CSRF protection middleware
  app.use(generateCsrfToken);
  app.use(verifyCsrfToken);

  // Request logging middleware
  app.use((_req: Request, _res: Response, next) => {
    next();
  });

  // Health check endpoint
  app.get('/health', async (_req: Request, res: Response) => {
    const snapshot = await getHealthSnapshot();
    res.status(snapshot.status === 'ok' ? 200 : 503).json(snapshot);
  });

  // Fast ping endpoint for latency measurement
  app.get('/api/ping', (_req: Request, res: Response) => {
    res.send('pong');
  });

  // Public site configuration endpoint (no auth required)
  app.get('/api/site-config', async (_req: Request, res: Response) => {
    try {
      const settings = await getWebSettings();
      res.json({
        siteTitle: settings.siteTitle,
        siteLogoUrl: settings.siteLogoUrl,
        supportUrl: settings.supportUrl,
        mudHost: settings.mudHost,
        mudPort: settings.mudPort,
        mudPortTls: settings.mudPortTls,
        mudWsUrl: settings.mudWsUrl,
        // Front page settings
        frontPageHeroEnabled: settings.frontPageHeroEnabled,
        frontPageHeroTitle: settings.frontPageHeroTitle,
        frontPageHeroSubtitle: settings.frontPageHeroSubtitle,
        frontPageHeroImageUrl: settings.frontPageHeroImageUrl,
        frontPageContent: settings.frontPageContent,
      });
    } catch (error) {
      logger.error('Get site config error:', error);
      res.status(500).json({ error: 'Failed to get site configuration' });
    }
  });

  // ko-fi webhook (outside /api prefix, no csrf)
  app.use('/kofihook', kofiRoutes);

  // API routes
  app.use('/api/pvp', pvpRoutes);
  app.use('/api/news', newsRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/forum', forumRouter);
  app.use('/api/admin/data-holds', dataHoldRoutes);
  app.use('/api/admin', adminRouter);
  app.use('/api/admin/users', userManagementRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/frag', fragRoutes);
  app.use('/api/zones', zoneRoutes);
  app.use('/api/status', statusRoutes);
  app.use('/api/server/reboot', serverRebootRoutes);
  app.use('/api/admin/git', gitRoutes);
  app.use('/api/mud', mudControlRoutes);
  app.use('/api/builder', builderRoutes);
  app.use('/api/wiki', wikiRoutes);
  app.use('/api/help', helpRoutes);
  app.use('/api/guide', guideRoutes);
  app.use('/api', helpSuggestionsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/analytics', webAnalyticsRoutes);
  app.use('/api/privacy', privacyRoutes);
  app.use('/api/admin/analytics/web', webAnalyticsRoutes);
  app.use('/api/auction', auctionRoutes);
  app.use('/api/push', pushRoutes);
  app.use('/api/changelog', changelogRouter);
  app.use('/api/public/statistics', publicStatisticsRoutes);
  app.use('/api/hooks', hookRoutes);
  app.use('/api', apiNotFound);

  // Serve static maps (works in both dev and prod)
  const publicPath = path.join(process.cwd(), 'public');
  app.use(express.static(publicPath, { maxAge: '7d' }));

  // Serve frontend static files in production
  if (environment.environment === 'production') {
    const indexHtmlPath = path.join(frontendDistPath, 'index.html');

    // Serve frontend static files
    app.use(express.static(frontendDistPath));

    // Helper to strip ANSI codes from text
    const stripAnsi = (text: string): string => {
      return text.replace(/&n|&[+=\-][A-Za-z]|&=[A-Za-z]{2}/g, '');
    };

    // Helper to extract player name from description like "[56 Crusader] Juts (Githzerai)"
    const extractPlayerName = (desc: string): string => {
      const stripped = stripAnsi(desc);
      const match = stripped.match(/\]\s*(\w+)/);
      return match?.[1] || stripped;
    };

    // Check if request is from a bot/crawler
    const isBotRequest = (userAgent: string | undefined): boolean => {
      if (!userAgent) return false;
      return /bot|crawler|spider|scraper|discord|telegram|whatsapp|facebook|twitter|slack|linkedin|pinterest|embedly|quora|outbrain|vkshare|facebookexternalhit|twitterbot|telegrambot/i.test(
        userAgent,
      );
    };

    /** Builds HTML-encoded Open Graph metadata for one PvP battle. */
    const generateBattleOgTags = (
      eventId: number,
      event: { room_name: string; stamp: string },
      participants: Array<{ player_description: string; pk_type: string }>,
      siteTitle: string,
      logoUrl?: string,
    ): string => {
      const killers = participants
        .filter((p) => p.pk_type.includes('KILLER'))
        .map((p) => extractPlayerName(p.player_description));
      const victims = participants
        .filter((p) => p.pk_type.includes('VICTIM'))
        .map((p) => extractPlayerName(p.player_description));
      const location = stripAnsi(event.room_name);

      const title = escapeHtml(
        `Battle #${eventId} - ${killers.join(', ')} vs ${victims.join(', ')} | ${siteTitle}`,
      );
      const description = escapeHtml(
        `PvP battle at ${location} - ${killers.join(', ')} defeated ${victims.join(', ')}`,
      );
      const url = escapeHtml(`${environment.siteUrl}/pvp/${eventId}`);
      const encodedSiteTitle = escapeHtml(siteTitle);
      const encodedLogoUrl = logoUrl ? escapeHtml(logoUrl) : undefined;

      const imageTags = encodedLogoUrl
        ? `
      <meta property="og:image" content="${encodedLogoUrl}">
      <meta name="twitter:image" content="${encodedLogoUrl}">`
        : '';

      return `
      <title>${title}</title>
      <meta name="description" content="${description}">
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${description}">
      <meta property="og:type" content="website">
      <meta property="og:url" content="${url}">
      <meta property="og:site_name" content="${encodedSiteTitle}">${imageTags}
      <meta name="twitter:card" content="${encodedLogoUrl ? 'summary_large_image' : 'summary'}">
      <meta name="twitter:title" content="${title}">
      <meta name="twitter:description" content="${description}">
      <meta name="theme-color" content="#16213e">`;
    };

    // Vue Router history mode support - serve index.html for all non-API routes
    app.use(async (req: Request, res: Response): Promise<void> => {
      const userAgent = req.get('user-agent');

      // Check if it's a bot request to a PvP battle page
      const pvpMatch = req.path.match(/^\/pvp\/(\d+)/);
      if (pvpMatch && isBotRequest(userAgent)) {
        const eventId = parseInt(pvpMatch[1], 10);
        try {
          const [battleData, webSettings] = await Promise.all([
            getPvPEventDetail(eventId),
            getWebSettings(),
          ]);

          if (battleData) {
            // Read the HTML template
            let html = fs.readFileSync(indexHtmlPath, 'utf-8');

            // Generate and inject OG tags (with logo if available)
            const ogTags = generateBattleOgTags(
              eventId,
              battleData.event,
              battleData.participants,
              webSettings.siteTitle,
              webSettings.siteLogoUrl || undefined,
            );

            // Replace the existing <title> and inject OG tags before </head>
            html = html.replace(/<title>.*?<\/title>/, '');
            html = html.replace('</head>', `${ogTags}\n</head>`);

            res.send(html);
            return;
          }
        } catch (error) {
          logger.error(`[OG Tags] Failed to generate OG tags for battle ${eventId}:`, error);
        }
      }

      // Default: serve the regular index.html
      res.sendFile(indexHtmlPath);
    });
  }

  // 404 handler (only for development or API routes in production)
  if (environment.environment !== 'production') {
    app.use(notFoundHandler);
  }

  // Global error handler
  app.use(errorHandler);

  return app;
}

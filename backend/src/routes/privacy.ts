import { Router, type Request, type Response, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { getBackendConfiguration } from '../config/environment.js';
import { getPrivacyPolicy } from '../config/privacyPolicy.js';
import { verifyCsrfToken } from '../middleware/csrf.js';
import { requireAuth } from '../middleware/auth.js';
import { AccountExportError, exportAccountData } from '../services/accountExportService.js';
import {
  getPrivacyChoice,
  recordPrivacyChoice,
  PrivacyChoiceError,
  PRIVACY_COOKIE,
} from '../services/privacyChoiceService.js';

const environment = getBackendConfiguration();
const cookieOptions = {
  httpOnly: true,
  secure: environment.environment === 'production',
  sameSite: 'strict' as const,
  path: '/',
};
const router: Router = Router();
const limiter = rateLimit({
  windowMs: 60000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many privacy requests; please try again later' },
});
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user!.accountName.toLowerCase(),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many data downloads. Please try again later.' },
});

const sameOrigin: RequestHandler = (req, res, next) => {
  if (
    req.get('origin') !== new URL(environment.siteUrl).origin ||
    req.get('sec-fetch-site') === 'cross-site'
  ) {
    res.status(403).json({ error: 'Privacy choices require a same-origin request' });
    return;
  }
  next();
};
function context(req: Request) {
  return {
    csrfToken: req.cookies?.csrf_token as unknown,
    receipt: req.cookies?.[PRIVACY_COOKIE] as unknown,
  };
}
function failure(res: Response, error: unknown) {
  const status = error instanceof PrivacyChoiceError ? error.status : 503;
  const message =
    error instanceof PrivacyChoiceError
      ? error.message
      : 'Privacy choices are temporarily unavailable';
  res.status(status).json({ error: message });
}

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.get('/', limiter, async (req, res) => {
  try {
    const choice = await getPrivacyChoice(context(req));
    if (req.cookies?.[PRIVACY_COOKIE] && !choice.receiptValid)
      res.clearCookie(PRIVACY_COOKIE, cookieOptions);
    res.json(choice);
  } catch (error) {
    failure(res, error);
  }
});
router.post('/choice', limiter, sameOrigin, verifyCsrfToken, async (req, res) => {
  try {
    const choice = await recordPrivacyChoice(context(req), req.body);
    // Issue a credential only after the authoritative preference write is acknowledged.
    res.cookie(PRIVACY_COOKIE, choice.receipt, {
      ...cookieOptions,
      maxAge: getPrivacyPolicy().preferenceLifetimeSeconds * 1000,
    });
    res.json(choice.status);
  } catch (error) {
    failure(res, error);
  }
});

router.post(
  '/export',
  requireAuth,
  exportLimiter,
  sameOrigin,
  verifyCsrfToken,
  async (req, res) => {
    try {
      const result = await exportAccountData(req.user!.accountName, req.user!.sessionId, req.body);
      res.set(
        'Content-Disposition',
        `attachment; filename="duris-website-data-${result.exportId}.json"`,
      );
      res.set('X-Content-Type-Options', 'nosniff');
      res.type('application/json').send(result.payload);
    } catch (error) {
      res.status(error instanceof AccountExportError ? error.status : 503).json({
        error:
          error instanceof AccountExportError
            ? error.message
            : 'Your data could not be prepared. Please try again later.',
      });
    }
  },
);

export default router;

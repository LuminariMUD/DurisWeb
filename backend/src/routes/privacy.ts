import { Router, type Request, type Response, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { getBackendConfiguration } from '../config/environment.js';
import { getPrivacyPolicy } from '../config/privacyPolicy.js';
import { verifyCsrfToken } from '../middleware/csrf.js';
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
  res.status(status).json({
    error: message,
    ...(error instanceof PrivacyChoiceError && error.reference
      ? { reference: error.reference }
      : {}),
  });
}

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.get('/', limiter, async (req, res) => {
  try {
    const choice = await getPrivacyChoice(context(req));
    // A concurrent choice may have rotated the browser cookie after this GET
    // began. Status reads cannot safely delete the credential currently stored.
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

export default router;

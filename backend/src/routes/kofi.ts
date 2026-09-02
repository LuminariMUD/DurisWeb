import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';
import { recordDonation, type KofiDonation } from '../services/donationService.js';
import { DonationDeliveryConfigurationError } from '../utils/donationEvent.js';
import { validateKofiDonationPayload } from '../utils/kofiValidation.js';
import { getBackendConfiguration } from '../config/environment.js';

const router: IRouter = Router();

const kofiWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many webhook requests, please try again later',
});

const MAX_KOFI_DATA_BYTES = 16 * 1024;

/**
 * POST /kofihook
 * receives ko-fi webhook notifications
 * content-type: application/x-www-form-urlencoded
 * body: data={json string}
 */
router.post('/', kofiWebhookLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    // ko-fi sends data as form field containing json string
    const dataString = req.body.data;

    if (typeof dataString !== 'string' || dataString.length === 0) {
      logger.warn('kofi webhook: missing data field');
      res.status(400).send('invalid data');
      return;
    }
    if (Buffer.byteLength(dataString, 'utf8') > MAX_KOFI_DATA_BYTES) {
      logger.warn('kofi webhook: data field exceeds size limit');
      res.status(413).send('data too large');
      return;
    }

    let parsedDonation: unknown;
    try {
      parsedDonation = JSON.parse(dataString);
    } catch {
      logger.warn('kofi webhook: invalid json in data field');
      res.status(400).send('invalid json');
      return;
    }

    if (
      parsedDonation === null ||
      typeof parsedDonation !== 'object' ||
      Array.isArray(parsedDonation)
    ) {
      logger.warn('kofi webhook: payload is not an object');
      res.status(400).send('invalid payload');
      return;
    }

    const donation = parsedDonation as KofiDonation & { verification_token?: string };

    const environment = getBackendConfiguration();
    const configuredToken = environment.donationVerificationToken;
    if (!environment.features.donations || !configuredToken) {
      logger.error('kofi webhook: donations are disabled');
      res.status(503).send('webhook not configured');
      return;
    }

    // verify token if configured
    const suppliedToken = donation.verification_token;
    const configuredBytes = Buffer.from(configuredToken, 'utf8');
    const suppliedBytes =
      typeof suppliedToken === 'string' ? Buffer.from(suppliedToken, 'utf8') : null;
    const tokenMatches =
      suppliedBytes !== null &&
      suppliedBytes.length === configuredBytes.length &&
      crypto.timingSafeEqual(suppliedBytes, configuredBytes);
    if (!tokenMatches) {
      logger.warn('kofi webhook: invalid verification token');
      res.status(403).send('invalid token');
      return;
    }

    const validationError = validateKofiDonationPayload(donation);
    if (validationError) {
      logger.warn(`kofi webhook: invalid payload: ${validationError}`);
      res.status(400).send('invalid payload');
      return;
    }

    const result = await recordDonation(donation);
    if (result.duplicate) {
      res.status(200).send('ok');
      return;
    }

    // A 200 response means the donation is durably recorded in the WebService
    // outbox. The worker owns MUD publication and its retry/reconciliation path.
    logger.info(`kofi webhook: accepted donation event ${result.eventId}`);
    res.status(200).send('ok');
  } catch (error) {
    if (error instanceof DonationDeliveryConfigurationError) {
      logger.error('kofi webhook: donation delivery is not configured');
      res.status(503).send('donation delivery unavailable');
      return;
    }
    const message = error instanceof Error ? error.message : 'unknown internal error';
    logger.error(`kofi webhook unavailable: ${message}`);
    // Do not acknowledge an event that was not durably recorded. Ko-fi can retry.
    res.status(503).send('temporarily unavailable');
  }
});

export default router;

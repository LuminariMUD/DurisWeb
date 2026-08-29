import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';
import {
  isDuplicateDonation,
  processDonation,
  publishDonationToMud,
  type KofiDonation,
} from '../services/donationService.js';
import { validateKofiDonationPayload } from '../utils/kofiValidation.js';

const router: IRouter = Router();

const kofiWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many webhook requests, please try again later',
});

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

    let parsedDonation: unknown;
    try {
      parsedDonation = JSON.parse(dataString);
    } catch {
      logger.warn('kofi webhook: invalid json in data field');
      res.status(400).send('invalid json');
      return;
    }

    if (parsedDonation === null || typeof parsedDonation !== 'object' || Array.isArray(parsedDonation)) {
      logger.warn('kofi webhook: payload is not an object');
      res.status(400).send('invalid payload');
      return;
    }

    const donation = parsedDonation as KofiDonation & { verification_token?: string };

    const configuredToken = process.env.KOFI_VERIFICATION_TOKEN;
    if (!configuredToken) {
      logger.error('kofi webhook: verification token is not configured');
      res.status(503).send('webhook not configured');
      return;
    }

    // verify token if configured
    const suppliedToken = donation.verification_token;
    const configuredBytes = Buffer.from(configuredToken, 'utf8');
    const suppliedBytes = typeof suppliedToken === 'string' ? Buffer.from(suppliedToken, 'utf8') : null;
    const tokenMatches = suppliedBytes !== null &&
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

    // check for duplicate (ko-fi retries on non-200)
    if (await isDuplicateDonation(donation.message_id)) {
      logger.info(`kofi webhook: duplicate donation ${donation.message_id}, ignoring`);
      res.status(200).send('ok');
      return;
    }

    // process the donation
    const { characterName, amount } = await processDonation(donation);

    // publish to mud nchat
    await publishDonationToMud(
      characterName,
      amount,
      donation.currency || 'USD',
      donation.message,
      donation.is_public
    );

    logger.info(`kofi webhook: processed ${donation.type} of $${donation.amount} from ${donation.from_name}`);
    res.status(200).send('ok');
  } catch (error) {
    logger.error('kofi webhook error:', error);
    // still return 200 to prevent ko-fi from retrying on our errors
    res.status(200).send('ok');
  }
});

export default router;

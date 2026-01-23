import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import logger from '../utils/logger.js';
import {
  isDuplicateDonation,
  processDonation,
  publishDonationToMud,
  type KofiDonation,
} from '../services/donationService.js';

const router: IRouter = Router();

// verification token from ko-fi webhook settings
const KOFI_VERIFICATION_TOKEN = process.env.KOFI_VERIFICATION_TOKEN || '';

/**
 * POST /kofihook
 * receives ko-fi webhook notifications
 * content-type: application/x-www-form-urlencoded
 * body: data={json string}
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // ko-fi sends data as form field containing json string
    const dataString = req.body.data;

    if (!dataString) {
      logger.warn('kofi webhook: missing data field');
      return res.status(400).send('missing data');
    }

    let donation: KofiDonation & { verification_token?: string };
    try {
      donation = JSON.parse(dataString);
    } catch {
      logger.warn('kofi webhook: invalid json in data field');
      return res.status(400).send('invalid json');
    }

    // verify token if configured
    if (KOFI_VERIFICATION_TOKEN && donation.verification_token !== KOFI_VERIFICATION_TOKEN) {
      logger.warn('kofi webhook: invalid verification token');
      return res.status(403).send('invalid token');
    }

    // check for duplicate (ko-fi retries on non-200)
    if (await isDuplicateDonation(donation.message_id)) {
      logger.info(`kofi webhook: duplicate donation ${donation.message_id}, ignoring`);
      return res.status(200).send('ok');
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

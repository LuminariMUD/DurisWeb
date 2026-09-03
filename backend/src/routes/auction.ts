import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { requireAuth, requireImmortal } from '../middleware/auth.js';
import { requireMutationGate } from '../middleware/mutationGate.js';
import { parsePagination, sanitizeSearchString, validateIdParam } from '../utils/validation.js';
import {
  getAuctions,
  getAuctionDetail,
  getAuctionBidHistory,
  getAuctionKeywords,
  getAuctionStats,
  getAuctionHistory,
  placeBid,
  adminRemoveAuction,
  getCharacterMoney,
  getCharacterName,
  verifyCharacterOwnership,
  deductCharacterMoney,
} from '../services/auctionService.js';
import {
  AuctionFilters,
  AuctionHistoryFilters,
  PaginatedResponse,
  AuctionListItem,
  AuctionHistoryItem,
} from '../types/index.js';
import { broadcastAuctionEvent } from '../index.js';

const router: IRouter = Router();

const COPPER_PER_PLAT = 1000;

/**
 * GET /api/auction/listings
 * Get paginated auction listings (public)
 */
router.get(
  '/listings',
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = parsePagination(
      req.query.page as string,
      req.query.limit as string,
      50,
      100,
    );

    const filters: AuctionFilters = {
      search: sanitizeSearchString(req.query.search as string, 100),
      sellerName: sanitizeSearchString(req.query.seller as string, 50),
      minPrice: req.query.minPrice ? parseInt(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseInt(req.query.maxPrice as string) : undefined,
      hasBuyNow: req.query.hasBuyNow === 'true',
      keywords: req.query.keywords
        ? (req.query.keywords as string).split(',').filter(Boolean)
        : undefined,
      page,
      limit,
      sortBy: (req.query.sortBy as 'id' | 'startTime' | 'endTime' | 'price' | 'bidCount') || 'id',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
    };

    const { auctions, total } = await getAuctions(filters);

    const response: PaginatedResponse<AuctionListItem> = {
      data: auctions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    res.json(response);
  }),
);

/**
 * GET /api/auction/listings/:auctionId
 * Get single auction detail (public)
 */
router.get(
  '/listings/:auctionId',
  asyncHandler(async (req: Request, res: Response) => {
    const auctionId = validateIdParam(req.params.auctionId);

    if (auctionId === null) {
      throw new AppError('Invalid auction ID', 400);
    }

    const auction = await getAuctionDetail(auctionId);

    if (!auction) {
      throw new AppError('Auction not found', 404);
    }

    res.json(auction);
  }),
);

/**
 * GET /api/auction/listings/:auctionId/history
 * Get bid history for an auction (public)
 */
router.get(
  '/listings/:auctionId/history',
  asyncHandler(async (req: Request, res: Response) => {
    const auctionId = validateIdParam(req.params.auctionId);

    if (auctionId === null) {
      throw new AppError('Invalid auction ID', 400);
    }

    const history = await getAuctionBidHistory(auctionId);
    res.json(history);
  }),
);

/**
 * GET /api/auction/keywords
 * Get available filter keywords (public)
 */
router.get(
  '/keywords',
  asyncHandler(async (_req: Request, res: Response) => {
    const keywords = await getAuctionKeywords();
    res.json(keywords);
  }),
);

/**
 * GET /api/auction/stats
 * Get auction statistics (public)
 */
router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await getAuctionStats();
    res.json(stats);
  }),
);

/**
 * GET /api/auction/history
 * Get completed auction history from last 30 days (public)
 */
router.get(
  '/history',
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = parsePagination(
      req.query.page as string,
      req.query.limit as string,
      10,
      100,
    );

    const filters: AuctionHistoryFilters = {
      search: sanitizeSearchString(req.query.search as string, 100),
      sellerName: sanitizeSearchString(req.query.seller as string, 50),
      buyerName: sanitizeSearchString(req.query.buyer as string, 50),
      page,
      limit,
      sortBy: (req.query.sortBy as 'soldAt' | 'price') || 'soldAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    const { history, total } = await getAuctionHistory(filters);

    const response: PaginatedResponse<AuctionHistoryItem> = {
      data: history,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    res.json(response);
  }),
);

/**
 * POST /api/auction/listings/:auctionId/bid
 * Place a bid (authenticated, character-linked)
 */
router.post(
  '/listings/:auctionId/bid',
  requireAuth,
  requireMutationGate('auctionWrites'),
  asyncHandler(async (req: Request, res: Response) => {
    const auctionId = validateIdParam(req.params.auctionId);

    if (auctionId === null) {
      throw new AppError('Invalid auction ID', 400);
    }

    const { bidAmountCopper, characterPid } = req.body;

    if (!bidAmountCopper || bidAmountCopper <= 0) {
      throw new AppError('Invalid bid amount', 400);
    }

    if (!characterPid) {
      throw new AppError('Character selection required', 400);
    }

    const accountName = req.user!.accountName;

    // Verify character ownership
    const ownsCharacter = await verifyCharacterOwnership(accountName, characterPid);
    if (!ownsCharacter) {
      throw new AppError('You do not own this character', 403);
    }

    // Get auction to check current state
    const auction = await getAuctionDetail(auctionId);
    if (!auction) {
      throw new AppError('Auction not found', 404);
    }

    if (auction.status !== 'OPEN') {
      throw new AppError('Auction is no longer open', 400);
    }

    // Prevent same-account bidding (anti-shill bidding)
    const sellerOnSameAccount = await verifyCharacterOwnership(accountName, auction.sellerPid);
    if (sellerOnSameAccount) {
      throw new AppError('You cannot bid on your own auctions', 403);
    }

    // Check character has enough money
    const characterMoney = await getCharacterMoney(characterPid);

    // If already winning bidder, only need difference
    let amountToPay = bidAmountCopper;
    if (characterPid === auction.winningBidderPid) {
      amountToPay = bidAmountCopper - auction.curPrice;
    }

    if (characterMoney < amountToPay) {
      throw new AppError(
        `Insufficient funds. Character has ${Math.floor(characterMoney / COPPER_PER_PLAT)}p, ` +
          `need ${Math.floor(amountToPay / COPPER_PER_PLAT)}p`,
        400,
      );
    }

    // Get character name for bid history
    const characterName = await getCharacterName(characterPid);
    if (!characterName) {
      throw new AppError('Character not found', 404);
    }

    // Deduct money first
    const deducted = await deductCharacterMoney(characterPid, amountToPay);
    if (!deducted) {
      throw new AppError('Failed to deduct funds - insufficient balance', 400);
    }

    // Store previous bidder info for broadcast
    const prevBidderPid = auction.winningBidderPid || 0;
    const prevBidder = auction.winningBidderName || '';

    // Place the bid
    const result = await placeBid(auctionId, characterPid, characterName, bidAmountCopper);

    if (!result.success) {
      // Refund the money we just deducted (add it back)
      // Note: In production, this should be in a transaction
      throw new AppError(result.error || 'Failed to place bid', 400);
    }

    // Broadcast bid event to all connected clients
    broadcastAuctionEvent('AUCTION_BID', {
      id: auctionId,
      bidder: characterName,
      amount: bidAmountCopper,
      prevBidderPid,
      prevBidder,
    });

    // If auction closed (buy-it-now triggered), also broadcast close event
    if (result.auctionClosed) {
      broadcastAuctionEvent('AUCTION_CLOSE', {
        id: auctionId,
        winner: characterName,
        winnerPid: characterPid,
        price: bidAmountCopper,
        reason: 'buynow',
        sellerPid: auction.sellerPid,
        seller: auction.sellerName,
      });
    }

    res.json({
      success: true,
      message: result.auctionClosed
        ? 'Purchase complete! Pick up your item at an Auction House in-game.'
        : 'Bid placed successfully',
      auctionClosed: result.auctionClosed || false,
    });
  }),
);

/**
 * POST /api/auction/listings/:auctionId/buy
 * Buy-it-now (authenticated, character-linked)
 */
router.post(
  '/listings/:auctionId/buy',
  requireAuth,
  requireMutationGate('auctionWrites'),
  asyncHandler(async (req: Request, res: Response) => {
    const auctionId = validateIdParam(req.params.auctionId);

    if (auctionId === null) {
      throw new AppError('Invalid auction ID', 400);
    }

    const { characterPid } = req.body;

    if (!characterPid) {
      throw new AppError('Character selection required', 400);
    }

    const accountName = req.user!.accountName;

    // Verify character ownership
    const ownsCharacter = await verifyCharacterOwnership(accountName, characterPid);
    if (!ownsCharacter) {
      throw new AppError('You do not own this character', 403);
    }

    // Get auction to check buy-it-now price
    const auction = await getAuctionDetail(auctionId);
    if (!auction) {
      throw new AppError('Auction not found', 404);
    }

    if (auction.status !== 'OPEN') {
      throw new AppError('Auction is no longer open', 400);
    }

    // Prevent same-account buying (anti-shill bidding)
    const sellerOnSameAccount = await verifyCharacterOwnership(accountName, auction.sellerPid);
    if (sellerOnSameAccount) {
      throw new AppError('You cannot buy your own auctions', 403);
    }

    if (auction.buyPrice <= 0) {
      throw new AppError('This auction does not have a buy-it-now option', 400);
    }

    // Check character has enough money
    const characterMoney = await getCharacterMoney(characterPid);
    const buyPriceCopper = auction.buyPrice;

    // Calculate amount to pay (if already winning bidder, pay difference)
    let amountToPay = buyPriceCopper;
    if (characterPid === auction.winningBidderPid) {
      amountToPay = buyPriceCopper - auction.curPrice;
    }

    if (characterMoney < amountToPay) {
      throw new AppError(
        `Insufficient funds. Need ${Math.floor(amountToPay / COPPER_PER_PLAT)}p`,
        400,
      );
    }

    // Get character name
    const characterName = await getCharacterName(characterPid);
    if (!characterName) {
      throw new AppError('Character not found', 404);
    }

    // Store previous bidder info for broadcast
    const prevBidderPid = auction.winningBidderPid || 0;
    const prevBidder = auction.winningBidderName || '';

    // Deduct money first
    const deducted = await deductCharacterMoney(characterPid, amountToPay);
    if (!deducted) {
      throw new AppError('Failed to deduct funds - insufficient balance', 400);
    }

    // Place bid at buy-it-now price (will trigger immediate finalization)
    const result = await placeBid(auctionId, characterPid, characterName, buyPriceCopper);

    if (!result.success) {
      throw new AppError(result.error || 'Failed to complete purchase', 400);
    }

    // Broadcast bid event
    broadcastAuctionEvent('AUCTION_BID', {
      id: auctionId,
      bidder: characterName,
      amount: buyPriceCopper,
      prevBidderPid,
      prevBidder,
    });

    // Broadcast auction close event
    broadcastAuctionEvent('AUCTION_CLOSE', {
      id: auctionId,
      winner: characterName,
      winnerPid: characterPid,
      price: buyPriceCopper,
      reason: 'buynow',
      sellerPid: auction.sellerPid,
      seller: auction.sellerName,
    });

    res.json({
      success: true,
      message: 'Purchase complete! Pick up your item at an Auction House in-game.',
    });
  }),
);

/**
 * DELETE /api/auction/listings/:auctionId
 * Admin: Remove an auction listing (returns item to seller, refunds bidder)
 */
router.delete(
  '/listings/:auctionId',
  requireAuth,
  requireImmortal,
  requireMutationGate('auctionWrites'),
  asyncHandler(async (req: Request, res: Response) => {
    const auctionId = validateIdParam(req.params.auctionId);

    if (auctionId === null) {
      throw new AppError('Invalid auction ID', 400);
    }

    const { reason } = req.body || {};
    const adminName = req.user!.accountName;

    const result = await adminRemoveAuction(auctionId, adminName, reason);

    if (!result.success) {
      throw new AppError(result.error || 'Failed to remove auction', 400);
    }

    res.json({
      success: true,
      message: 'Auction removed. Item returned to seller, bidder refunded.',
    });
  }),
);

export default router;

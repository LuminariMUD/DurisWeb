import { pool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import {
  AuctionListItem,
  AuctionDetail,
  AuctionBidHistory,
  AuctionFilters,
  AuctionHistoryItem,
  AuctionHistoryFilters,
} from '../types/index.js';
import * as notificationService from './unifiedNotificationService.js';
import { isMudConnected, sendMudCommandAsync } from './mudAuctionClient.js';
import logger from '../utils/logger.js';

// Constants (matching MUD auction_houses.c)
const COPPER_PER_PLAT = 1000;
const BID_TIME_EXTENSION = 5 * 60; // 5 minutes in seconds

/**
 * Map database row to AuctionListItem
 */
function mapRowToAuctionListItem(row: RowDataPacket): AuctionListItem {
  return {
    id: row.id,
    sellerPid: row.seller_pid,
    sellerName: row.seller_name,
    startTime: row.start_time,
    endTime: row.end_time,
    secsRemaining: Math.max(0, row.secs_remaining || 0),
    status: row.status,
    curPrice: row.cur_price,
    buyPrice: row.buy_price || 0,
    objShort: row.obj_short,
    objVnum: row.obj_vnum,
    idKeywords: row.id_keywords || '',
    objInfoText: row.obj_info_text || null,
    quantity: row.quantity || 1,
    winningBidderPid: row.winning_bidder_pid || null,
    winningBidderName: row.winning_bidder_name || null,
    bidCount: row.bid_count || 0,
  };
}

/**
 * Get paginated list of open auctions
 */
export async function getAuctions(
  filters: AuctionFilters,
): Promise<{ auctions: AuctionListItem[]; total: number }> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 50));
  const offset = (page - 1) * limit;

  // Sargable form of the open-auction window so an index on end_time can be used.
  const whereConditions: string[] = ["status = 'OPEN'", 'end_time > NOW()'];
  const queryParams: any[] = [];

  // Search filter (obj_short and id_keywords)
  if (filters.search) {
    whereConditions.push('(obj_short LIKE ? OR id_keywords LIKE ?)');
    const searchTerm = `%${filters.search}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  // Seller filter
  if (filters.sellerName) {
    whereConditions.push('seller_name LIKE ?');
    queryParams.push(`%${filters.sellerName}%`);
  }

  // Price filters (convert plat to copper)
  if (filters.minPrice !== undefined && filters.minPrice > 0) {
    whereConditions.push('cur_price >= ?');
    queryParams.push(filters.minPrice * COPPER_PER_PLAT);
  }
  if (filters.maxPrice !== undefined && filters.maxPrice > 0) {
    whereConditions.push('cur_price <= ?');
    queryParams.push(filters.maxPrice * COPPER_PER_PLAT);
  }

  // Buy-it-now filter
  if (filters.hasBuyNow) {
    whereConditions.push('buy_price > 0');
  }

  // Keyword filters (AND logic)
  if (filters.keywords && filters.keywords.length > 0) {
    for (const keyword of filters.keywords) {
      whereConditions.push('id_keywords LIKE ?');
      queryParams.push(`%${keyword}%`);
    }
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM auctions ${whereClause}`;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, queryParams);
  const total = countRows[0].total;

  // Determine sort
  let orderBy = 'a.id ASC'; // Default: oldest (lowest ID) first
  if (filters.sortBy === 'id') {
    orderBy = filters.sortOrder === 'asc' ? 'a.id ASC' : 'a.id DESC';
  } else if (filters.sortBy === 'startTime') {
    orderBy = filters.sortOrder === 'asc' ? 'a.start_time ASC' : 'a.start_time DESC';
  } else if (filters.sortBy === 'price') {
    orderBy = filters.sortOrder === 'desc' ? 'cur_price DESC' : 'cur_price ASC';
  } else if (filters.sortBy === 'bidCount') {
    orderBy = filters.sortOrder === 'desc' ? 'bid_count DESC' : 'bid_count ASC';
  } else if (filters.sortBy === 'endTime') {
    orderBy = filters.sortOrder === 'desc' ? 'end_time DESC' : 'end_time ASC';
  }

  // Main query with bid count subquery
  const query = `
    SELECT
      a.id,
      a.seller_pid,
      a.seller_name,
      UNIX_TIMESTAMP(a.start_time) as start_time,
      UNIX_TIMESTAMP(a.end_time) as end_time,
      (UNIX_TIMESTAMP(a.end_time) - UNIX_TIMESTAMP()) as secs_remaining,
      a.status,
      a.cur_price,
      a.buy_price,
      a.obj_short,
      a.obj_vnum,
      a.id_keywords,
      a.obj_info_text,
      a.quantity,
      a.winning_bidder_pid,
      a.winning_bidder_name,
      (SELECT COUNT(*) FROM auction_bid_history WHERE auction_id = a.id) as bid_count
    FROM auctions a
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  queryParams.push(limit, offset);
  const [rows] = await pool.query<RowDataPacket[]>(query, queryParams);

  const auctions: AuctionListItem[] = rows.map(mapRowToAuctionListItem);

  return { auctions, total };
}

/**
 * Get single auction detail
 */
export async function getAuctionDetail(auctionId: number): Promise<AuctionDetail | null> {
  const query = `
    SELECT
      a.id,
      a.seller_pid,
      a.seller_name,
      UNIX_TIMESTAMP(a.start_time) as start_time,
      UNIX_TIMESTAMP(a.end_time) as end_time,
      (UNIX_TIMESTAMP(a.end_time) - UNIX_TIMESTAMP()) as secs_remaining,
      a.status,
      a.cur_price,
      a.buy_price,
      a.obj_short,
      a.obj_vnum,
      a.id_keywords,
      a.obj_info_text,
      a.quantity,
      a.winning_bidder_pid,
      a.winning_bidder_name,
      (SELECT COUNT(*) FROM auction_bid_history WHERE auction_id = a.id) as bid_count
    FROM auctions a
    WHERE a.id = ?
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query, [auctionId]);

  if (rows.length === 0) {
    return null;
  }

  return mapRowToAuctionListItem(rows[0]) as AuctionDetail;
}

/**
 * Get bid history for an auction
 */
export async function getAuctionBidHistory(auctionId: number): Promise<AuctionBidHistory[]> {
  const query = `
    SELECT id, date, auction_id, bidder_pid, bidder_name, bid_amount
    FROM auction_bid_history
    WHERE auction_id = ?
    ORDER BY date DESC
  `;

  const [rows] = await pool.query<RowDataPacket[]>(query, [auctionId]);

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    auctionId: row.auction_id,
    bidderPid: row.bidder_pid,
    bidderName: row.bidder_name,
    bidAmount: row.bid_amount,
  }));
}

/**
 * Get available auction sort keywords (based on MUD EqSort class)
 */
export async function getAuctionKeywords(): Promise<string[]> {
  return [
    // Equipment slots
    'head',
    'neck',
    'body',
    'arms',
    'hands',
    'waist',
    'legs',
    'feet',
    'finger',
    'wrist',
    'hold',
    'shield',
    'light',
    'float',
    'back',
    // Classes
    'warrior',
    'cleric',
    'mage',
    'thief',
    'shaman',
    'ranger',
    'paladin',
    'antipaladin',
    'sorcerer',
    'monk',
    'druid',
    'bard',
    'necromancer',
    'crusader',
    'blighter',
    'hunter',
    'psionicist',
    // Item types
    'weapon',
    'armor',
    'container',
    'scroll',
    'wand',
    'staff',
    'potion',
    'worn',
    'food',
    'drink',
    'boat',
    'treasure',
    // Spell effects
    'haste',
    'fly',
    'invis',
    'infravision',
    'waterwalk',
    'regen',
    'sanctuary',
    'stoneskin',
    'barkskin',
    // Stats
    'hitroll',
    'damroll',
    'hp',
    'mana',
    'moves',
    'saves',
    'str',
    'int',
    'wis',
    'dex',
    'con',
    'cha',
    'luck',
    'focus',
    'power',
    // Alignment
    'good',
    'evil',
    'neutral',
  ];
}

/**
 * Get character's money (copper) for bid validation
 * Reads from player_data to match game's coin storage
 */
export async function getCharacterMoney(pid: number): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT copper, silver, gold, platinum FROM player_data WHERE pid = ?`,
    [pid],
  );

  if (!rows[0]) return 0;

  // convert to copper (same formula as game)
  return rows[0].copper + rows[0].silver * 10 + rows[0].gold * 100 + rows[0].platinum * 1000;
}

/**
 * Get character name by PID
 */
export async function getCharacterName(pid: number): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT name FROM player_data WHERE pid = ?`, [
    pid,
  ]);

  return rows[0]?.name || null;
}

/**
 * Verify character ownership - check if account owns the character
 */
export async function verifyCharacterOwnership(accountName: string, pid: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM account_characters WHERE account_name = ? AND pid = ?`,
    [accountName, pid],
  );

  return rows.length > 0;
}

/**
 * Insert money into pickup queue (for refunds)
 */
async function insertMoneyPickup(connection: any, pid: number, amount: number): Promise<void> {
  await connection.query(
    `INSERT INTO auction_money_pickups (pid, money) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE money = money + ?`,
    [pid, amount, amount],
  );
}

/**
 * Place a bid on an auction
 */
export async function placeBid(
  auctionId: number,
  bidderPid: number,
  bidderName: string,
  bidAmountCopper: number,
): Promise<{ success: boolean; error?: string; auctionClosed?: boolean }> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get current auction state with lock
    const [auctionRows] = await connection.query<RowDataPacket[]>(
      `SELECT id, cur_price, buy_price, winning_bidder_pid, winning_bidder_name,
              (UNIX_TIMESTAMP(end_time) - UNIX_TIMESTAMP()) as secs_remaining, quantity, status, seller_pid
       FROM auctions WHERE id = ? FOR UPDATE`,
      [auctionId],
    );

    if (auctionRows.length === 0) {
      await connection.rollback();
      return { success: false, error: 'Auction not found' };
    }

    const auction = auctionRows[0];

    // Check auction is still open
    if (auction.status !== 'OPEN') {
      await connection.rollback();
      return { success: false, error: 'Auction is no longer open' };
    }

    // Check if auction has expired
    if (auction.secs_remaining <= 0) {
      await connection.rollback();
      return { success: false, error: 'Auction has ended' };
    }

    // Can't bid on your own auction
    if (auction.seller_pid === bidderPid) {
      await connection.rollback();
      return { success: false, error: 'You cannot bid on your own auction' };
    }

    // Validate bid amount
    const curPrice = auction.cur_price;
    const winningBidderPid = auction.winning_bidder_pid;

    // If no bids yet, must meet starting price; otherwise must exceed current
    if (winningBidderPid === null || winningBidderPid === 0) {
      if (bidAmountCopper < curPrice) {
        await connection.rollback();
        return { success: false, error: 'Bid must meet the starting price' };
      }
    } else if (bidAmountCopper <= curPrice) {
      await connection.rollback();
      return { success: false, error: 'Bid must be higher than current price' };
    }

    // Check for buy-it-now
    const buyPrice = auction.buy_price;
    let auctionClosed = false;

    if (buyPrice > 0 && bidAmountCopper >= buyPrice) {
      // Buy-it-now triggered - finalize auction immediately
      bidAmountCopper = buyPrice; // Cap at buy price
      auctionClosed = true;

      // Get obj_blob_str for item pickup
      const [blobRows] = await connection.query<RowDataPacket[]>(
        `SELECT obj_blob_str FROM auctions WHERE id = ?`,
        [auctionId],
      );
      const objBlobStr = blobRows[0]?.obj_blob_str;

      // Update auction to closed
      await connection.query(
        `UPDATE auctions SET winning_bidder_pid = ?, winning_bidder_name = ?,
         cur_price = ?, status = 'CLOSED' WHERE id = ?`,
        [bidderPid, bidderName, buyPrice, auctionId],
      );

      // Insert item pickup for winner
      if (objBlobStr) {
        await connection.query(
          `INSERT INTO auction_item_pickups (pid, obj_blob_str, quantity, retrieved)
           VALUES (?, ?, ?, 0)`,
          [bidderPid, objBlobStr, auction.quantity || 1],
        );
      }

      // Insert money pickup for seller
      await insertMoneyPickup(connection, auction.seller_pid, buyPrice);
    } else {
      // Normal bid
      if (bidderPid === winningBidderPid) {
        // Same bidder raising their bid - no time extension
        await connection.query(`UPDATE auctions SET cur_price = ? WHERE id = ?`, [
          bidAmountCopper,
          auctionId,
        ]);
      } else {
        // New bidder - extend time by 5 minutes
        await connection.query(
          `UPDATE auctions SET cur_price = ?, winning_bidder_pid = ?,
           winning_bidder_name = ?, end_time = DATE_ADD(end_time, INTERVAL ? SECOND) WHERE id = ?`,
          [bidAmountCopper, bidderPid, bidderName, BID_TIME_EXTENSION, auctionId],
        );
      }
    }

    // Record bid in history
    await connection.query(
      `INSERT INTO auction_bid_history (date, auction_id, bidder_pid, bidder_name, bid_amount)
       VALUES (UNIX_TIMESTAMP(), ?, ?, ?, ?)`,
      [auctionId, bidderPid, bidderName, bidAmountCopper],
    );

    // Refund previous bidder if different person
    if (winningBidderPid && winningBidderPid !== bidderPid) {
      await insertMoneyPickup(connection, winningBidderPid, curPrice);

      // get item name for notification
      const [itemRows] = await connection.query<RowDataPacket[]>(
        `SELECT obj_short FROM auctions WHERE id = ?`,
        [auctionId],
      );
      const itemName = itemRows[0]?.obj_short || 'item';

      // notify outbid user (after commit to not block transaction)
      setImmediate(() => {
        notificationService
          .notifyOutbid(winningBidderPid, auctionId, itemName, bidderName, bidAmountCopper)
          .catch(() => {}); // ignore errors
      });
    }

    // if buy-it-now was triggered, notify winner and seller
    if (auctionClosed) {
      const [auctionData] = await connection.query<RowDataPacket[]>(
        `SELECT obj_short, seller_pid, seller_name FROM auctions WHERE id = ?`,
        [auctionId],
      );
      const itemName = auctionData[0]?.obj_short || 'item';
      const sellerPid = auctionData[0]?.seller_pid;

      setImmediate(() => {
        notificationService
          .notifyAuctionWon(bidderPid, auctionId, itemName, bidAmountCopper)
          .catch(() => {});

        if (sellerPid) {
          notificationService
            .notifyItemSold(sellerPid, auctionId, itemName, bidderName, bidAmountCopper)
            .catch(() => {});
        }
      });
    }

    await connection.commit();
    return { success: true, auctionClosed };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Deduct money from character
 * Updates player_data to match game's coin storage
 */
export async function deductCharacterMoney(pid: number, amountCopper: number): Promise<boolean> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // get current coins with lock
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT copper, silver, gold, platinum FROM player_data WHERE pid = ? FOR UPDATE`,
      [pid],
    );

    if (!rows[0]) {
      await connection.rollback();
      return false;
    }

    let { copper, silver, gold, platinum } = rows[0];
    const totalCopper = copper + silver * 10 + gold * 100 + platinum * 1000;

    if (totalCopper < amountCopper) {
      await connection.rollback();
      return false;
    }

    // deduct starting from lowest denomination
    let remaining = amountCopper;

    if (remaining > 0 && copper > 0) {
      const take = Math.min(remaining, copper);
      copper -= take;
      remaining -= take;
    }
    if (remaining > 0 && silver > 0) {
      const takeCopper = Math.min(remaining, silver * 10);
      const takeSilver = Math.ceil(takeCopper / 10);
      silver -= takeSilver;
      remaining -= takeSilver * 10;
    }
    if (remaining > 0 && gold > 0) {
      const takeCopper = Math.min(remaining, gold * 100);
      const takeGold = Math.ceil(takeCopper / 100);
      gold -= takeGold;
      remaining -= takeGold * 100;
    }
    if (remaining > 0 && platinum > 0) {
      const takeCopper = Math.min(remaining, platinum * 1000);
      const takePlat = Math.ceil(takeCopper / 1000);
      platinum -= takePlat;
      remaining -= takePlat * 1000;
    }

    // if we over-deducted, add change back as copper
    if (remaining < 0) {
      copper -= remaining; // remaining is negative, so this adds
    }

    await connection.query(
      `UPDATE player_data SET copper = ?, silver = ?, gold = ?, platinum = ? WHERE pid = ?`,
      [copper, silver, gold, platinum, pid],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Admin: request authoritative removal of an auction listing.
 *
 * The MUD owns this operation. Its critical command locks the auction, advances
 * the auction revision, and stages every item back to the seller in one
 * transaction, so DurisWeb must not update `auctions` or insert pickup rows
 * itself. The command is accepted asynchronously; the committed outcome arrives
 * on the existing auction event stream, and repeating the request for an
 * auction that is no longer open is rejected by the MUD, so a retry is safe.
 */
export async function adminRemoveAuction(
  auctionId: number,
  adminName: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isMudConnected()) {
    return { success: false, error: 'MUD service is not connected' };
  }

  const response = await sendMudCommandAsync('durisweb_auction_remove', { auctionId });
  if (!response.success) {
    return { success: false, error: response.error || 'MUD rejected the auction removal' };
  }

  logger.info(
    `[Auction] Admin ${adminName} requested removal of auction ${auctionId}. Reason: ${reason || 'none'}`,
  );
  return { success: true };
}

/**
 * Get auction history (completed sales from last 30 days)
 */
export async function getAuctionHistory(
  filters: AuctionHistoryFilters,
): Promise<{ history: AuctionHistoryItem[]; total: number }> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 10));
  const offset = (page - 1) * limit;

  // Only show closed auctions from last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const whereConditions: string[] = [
    "status = 'CLOSED'",
    'end_time > ?',
    'winning_bidder_name IS NOT NULL',
  ];
  const queryParams: any[] = [thirtyDaysAgo];

  // Search filter
  if (filters.search) {
    whereConditions.push('obj_short LIKE ?');
    queryParams.push(`%${filters.search}%`);
  }

  // Seller filter
  if (filters.sellerName) {
    whereConditions.push('seller_name LIKE ?');
    queryParams.push(`%${filters.sellerName}%`);
  }

  // Buyer filter
  if (filters.buyerName) {
    whereConditions.push('winning_bidder_name LIKE ?');
    queryParams.push(`%${filters.buyerName}%`);
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM auctions ${whereClause}`;
  const [countRows] = await pool.query<RowDataPacket[]>(countQuery, queryParams);
  const total = countRows[0].total;

  // Determine sort
  let orderBy = 'end_time DESC'; // Default: most recent first
  if (filters.sortBy === 'price') {
    orderBy = filters.sortOrder === 'asc' ? 'cur_price ASC' : 'cur_price DESC';
  } else if (filters.sortBy === 'soldAt') {
    orderBy = filters.sortOrder === 'asc' ? 'end_time ASC' : 'end_time DESC';
  }

  const query = `
    SELECT
      a.id,
      a.seller_name,
      a.winning_bidder_name as buyer_name,
      a.obj_short,
      a.cur_price as sale_price,
      UNIX_TIMESTAMP(a.end_time) as sold_at,
      (SELECT COUNT(*) FROM auction_bid_history WHERE auction_id = a.id) as bid_count
    FROM auctions a
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  queryParams.push(limit, offset);
  const [rows] = await pool.query<RowDataPacket[]>(query, queryParams);

  const history: AuctionHistoryItem[] = rows.map((row) => ({
    id: row.id,
    sellerName: row.seller_name,
    buyerName: row.buyer_name,
    objShort: row.obj_short,
    salePrice: row.sale_price,
    soldAt: row.sold_at,
    bidCount: row.bid_count || 0,
  }));

  return { history, total };
}

/**
 * Get auction statistics (for dashboard/summary)
 */
export async function getAuctionStats(): Promise<{
  totalOpen: number;
  totalValue: number;
  endingSoon: number;
}> {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT
      COUNT(*) as total_open,
      COALESCE(SUM(cur_price), 0) as total_value,
      SUM(CASE WHEN (UNIX_TIMESTAMP(end_time) - UNIX_TIMESTAMP()) < 3600 THEN 1 ELSE 0 END) as ending_soon
    FROM auctions
    WHERE status = 'OPEN' AND end_time > NOW()
  `);

  return {
    totalOpen: rows[0].total_open || 0,
    totalValue: rows[0].total_value || 0,
    endingSoon: rows[0].ending_soon || 0,
  };
}

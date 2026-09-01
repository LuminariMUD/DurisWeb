import { pool } from '../db/connection.js';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { getCache, setCache } from '../db/redis.js';
import { geolocateIP } from '../utils/geoip.js';

// Cache TTL for analytics (in seconds)
const ANALYTICS_CACHE_TTL = 5 * 60; // 5 minutes
const REDIS_KEY_PREFIX = 'web_analytics:';

// Types
export interface PageViewData {
  sessionId: string;
  accountName?: string | null;
  path: string;
  pageTitle?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  userAgent?: string | null;
  screenWidth?: number | null;
  screenHeight?: number | null;
  ipAddress?: string | null;
  loadTimeMs?: number | null;
}

export interface WebOverviewStats {
  totalPageViews: number;
  uniqueVisitors: number;
  avgSessionDuration: number; // seconds
  bounceRate: number; // percentage
  pagesPerSession: number;
  todayPageViews: number;
  todayUniqueVisitors: number;
}

export interface TopPage {
  path: string;
  pageTitle: string | null;
  views: number;
  uniqueVisitors: number;
  avgTimeOnPage: number;
  bounceRate: number;
}

export interface ReferrerStats {
  domain: string;
  visits: number;
  percentage: number;
}

export interface DeviceStats {
  deviceType: string;
  count: number;
  percentage: number;
}

export interface BrowserStats {
  browser: string;
  count: number;
  percentage: number;
}

export interface GeoStats {
  country: string;
  countryCode: string;
  count: number;
  percentage: number;
}

export interface TrafficDataPoint {
  timestamp: string;
  views: number;
  visitors: number;
}

export interface RealtimeVisitor {
  sessionId: string;
  accountName: string | null;
  path: string;
  country: string | null;
  city: string | null;
  lastSeen: string;
}

/**
 * Parse user agent string to extract device, browser, and OS info
 */
function parseUserAgent(userAgent: string | null | undefined): {
  deviceType: string;
  browser: string;
  os: string;
} {
  if (!userAgent) {
    return { deviceType: 'unknown', browser: 'unknown', os: 'unknown' };
  }

  const ua = userAgent.toLowerCase();

  // Device type detection
  let deviceType = 'desktop';
  if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua)) {
    deviceType = /ipad|tablet/i.test(ua) ? 'tablet' : 'mobile';
  }

  // Browser detection
  let browser = 'other';
  if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('safari')) browser = 'Safari';
  else if (ua.includes('opera') || ua.includes('opr/')) browser = 'Opera';

  // OS detection
  let os = 'other';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac os') || ua.includes('macos')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  return { deviceType, browser, os };
}

/**
 * Extract domain from referrer URL
 */
function extractDomain(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Track a page view
 */
export async function trackPageView(data: PageViewData): Promise<void> {
  const { deviceType, browser, os } = parseUserAgent(data.userAgent);
  const referrerDomain = extractDomain(data.referrer);

  // Geo lookup (async, cached)
  let country: string | null = null;
  let countryCode: string | null = null;
  let city: string | null = null;
  if (data.ipAddress) {
    const geo = await geolocateIP(data.ipAddress);
    if (geo) {
      country = geo.country;
      countryCode = geo.countryCode;
      city = geo.city;
    }
  }

  // Insert page view
  await pool.query<ResultSetHeader>(
    `INSERT INTO page_views (
      session_id, account_name, path, page_title, referrer, referrer_domain,
      utm_source, utm_medium, utm_campaign, user_agent, device_type, browser, os,
      screen_width, screen_height, ip_address, country, country_code, city, load_time_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.sessionId,
      data.accountName || null,
      data.path,
      data.pageTitle || null,
      data.referrer || null,
      referrerDomain,
      data.utmSource || null,
      data.utmMedium || null,
      data.utmCampaign || null,
      data.userAgent || null,
      deviceType,
      browser,
      os,
      data.screenWidth || null,
      data.screenHeight || null,
      data.ipAddress || null,
      country,
      countryCode,
      city,
      data.loadTimeMs || null,
    ],
  );

  // Update or create session
  await pool.query<ResultSetHeader>(
    `INSERT INTO visitor_sessions (
      session_id, account_name, entry_page, exit_page, referrer, referrer_domain,
      device_type, browser, os, country, country_code, city, page_views, is_bounce
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, TRUE)
    ON DUPLICATE KEY UPDATE
      account_name = COALESCE(VALUES(account_name), account_name),
      last_seen = NOW(),
      exit_page = VALUES(exit_page),
      page_views = page_views + 1,
      is_bounce = FALSE`,
    [
      data.sessionId,
      data.accountName || null,
      data.path,
      data.path,
      data.referrer || null,
      referrerDomain,
      deviceType,
      browser,
      os,
      country,
      countryCode,
      city,
    ],
  );
}

/**
 * Get overview statistics for the web analytics dashboard
 */
export async function getWebOverviewStats(days: number = 30): Promise<WebOverviewStats> {
  const cacheKey = `${REDIS_KEY_PREFIX}overview:${days}d`;
  const cached = await getCache<WebOverviewStats>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalViewsResult,
    uniqueVisitorsResult,
    sessionStatsResult,
    todayViewsResult,
    todayVisitorsResult,
  ] = await Promise.all([
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM page_views WHERE created_at >= ?', [
      startDate,
    ]),
    pool.query<RowDataPacket[]>(
      'SELECT COUNT(DISTINCT session_id) as count FROM page_views WHERE created_at >= ?',
      [startDate],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT
        AVG(total_time_seconds) as avgDuration,
        AVG(page_views) as avgPages,
        SUM(CASE WHEN is_bounce = TRUE THEN 1 ELSE 0 END) / COUNT(*) * 100 as bounceRate
       FROM visitor_sessions
       WHERE first_seen >= ?`,
      [startDate],
    ),
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM page_views WHERE created_at >= ?', [
      today,
    ]),
    pool.query<RowDataPacket[]>(
      'SELECT COUNT(DISTINCT session_id) as count FROM page_views WHERE created_at >= ?',
      [today],
    ),
  ]);

  const sessionStats = sessionStatsResult[0][0] || {};

  const stats: WebOverviewStats = {
    totalPageViews: totalViewsResult[0][0]?.count || 0,
    uniqueVisitors: uniqueVisitorsResult[0][0]?.count || 0,
    avgSessionDuration: Math.round(sessionStats.avgDuration || 0),
    bounceRate: Math.round((sessionStats.bounceRate || 0) * 10) / 10,
    pagesPerSession: Math.round((sessionStats.avgPages || 0) * 10) / 10,
    todayPageViews: todayViewsResult[0][0]?.count || 0,
    todayUniqueVisitors: todayVisitorsResult[0][0]?.count || 0,
  };

  await setCache(cacheKey, stats, ANALYTICS_CACHE_TTL);
  return stats;
}

/**
 * Get top pages by views
 */
export async function getTopPages(days: number = 30, limit: number = 20): Promise<TopPage[]> {
  const cacheKey = `${REDIS_KEY_PREFIX}top_pages:${days}d:${limit}`;
  const cached = await getCache<TopPage[]>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      path,
      ANY_VALUE(page_title) as pageTitle,
      COUNT(*) as views,
      COUNT(DISTINCT session_id) as uniqueVisitors,
      0 as avgTimeOnPage,
      0 as bounceRate
     FROM page_views
     WHERE created_at >= ?
     GROUP BY path
     ORDER BY views DESC
     LIMIT ?`,
    [startDate, limit],
  );

  const pages: TopPage[] = rows.map((row) => ({
    path: row.path,
    pageTitle: row.pageTitle,
    views: row.views,
    uniqueVisitors: row.uniqueVisitors,
    avgTimeOnPage: row.avgTimeOnPage || 0,
    bounceRate: row.bounceRate || 0,
  }));

  await setCache(cacheKey, pages, ANALYTICS_CACHE_TTL);
  return pages;
}

/**
 * Get traffic source (referrer) statistics
 */
export async function getReferrerStats(days: number = 30): Promise<ReferrerStats[]> {
  const cacheKey = `${REDIS_KEY_PREFIX}referrers:${days}d`;
  const cached = await getCache<ReferrerStats[]>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      COALESCE(referrer_domain, 'Direct') as domain,
      COUNT(*) as visits
     FROM visitor_sessions
     WHERE first_seen >= ?
     GROUP BY COALESCE(referrer_domain, 'Direct')
     ORDER BY visits DESC
     LIMIT 20`,
    [startDate],
  );

  const total = rows.reduce((sum, row) => sum + row.visits, 0);

  const stats: ReferrerStats[] = rows.map((row) => ({
    domain: row.domain,
    visits: row.visits,
    percentage: total > 0 ? Math.round((row.visits / total) * 1000) / 10 : 0,
  }));

  await setCache(cacheKey, stats, ANALYTICS_CACHE_TTL);
  return stats;
}

/**
 * Get device type statistics
 */
export async function getDeviceStats(days: number = 30): Promise<DeviceStats[]> {
  const cacheKey = `${REDIS_KEY_PREFIX}devices:${days}d`;
  const cached = await getCache<DeviceStats[]>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      COALESCE(device_type, 'unknown') as deviceType,
      COUNT(*) as count
     FROM visitor_sessions
     WHERE first_seen >= ?
     GROUP BY COALESCE(device_type, 'unknown')
     ORDER BY count DESC`,
    [startDate],
  );

  const total = rows.reduce((sum, row) => sum + row.count, 0);

  const stats: DeviceStats[] = rows.map((row) => ({
    deviceType: row.deviceType,
    count: row.count,
    percentage: total > 0 ? Math.round((row.count / total) * 1000) / 10 : 0,
  }));

  await setCache(cacheKey, stats, ANALYTICS_CACHE_TTL);
  return stats;
}

/**
 * Get browser statistics
 */
export async function getBrowserStats(days: number = 30): Promise<BrowserStats[]> {
  const cacheKey = `${REDIS_KEY_PREFIX}browsers:${days}d`;
  const cached = await getCache<BrowserStats[]>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      COALESCE(browser, 'unknown') as browser,
      COUNT(*) as count
     FROM visitor_sessions
     WHERE first_seen >= ?
     GROUP BY COALESCE(browser, 'unknown')
     ORDER BY count DESC
     LIMIT 10`,
    [startDate],
  );

  const total = rows.reduce((sum, row) => sum + row.count, 0);

  const stats: BrowserStats[] = rows.map((row) => ({
    browser: row.browser,
    count: row.count,
    percentage: total > 0 ? Math.round((row.count / total) * 1000) / 10 : 0,
  }));

  await setCache(cacheKey, stats, ANALYTICS_CACHE_TTL);
  return stats;
}

/**
 * Get OS statistics
 */
export async function getOSStats(
  days: number = 30,
): Promise<{ os: string; count: number; percentage: number }[]> {
  const cacheKey = `${REDIS_KEY_PREFIX}os:${days}d`;
  const cached = await getCache<{ os: string; count: number; percentage: number }[]>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      COALESCE(os, 'unknown') as os,
      COUNT(*) as count
     FROM visitor_sessions
     WHERE first_seen >= ?
     GROUP BY COALESCE(os, 'unknown')
     ORDER BY count DESC
     LIMIT 10`,
    [startDate],
  );

  const total = rows.reduce((sum, row) => sum + row.count, 0);

  const stats = rows.map((row) => ({
    os: row.os,
    count: row.count,
    percentage: total > 0 ? Math.round((row.count / total) * 1000) / 10 : 0,
  }));

  await setCache(cacheKey, stats, ANALYTICS_CACHE_TTL);
  return stats;
}

/**
 * Get geographic statistics
 */
export async function getGeoStats(days: number = 30): Promise<GeoStats[]> {
  const cacheKey = `${REDIS_KEY_PREFIX}geo:${days}d`;
  const cached = await getCache<GeoStats[]>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      COALESCE(country, 'Unknown') as country,
      COALESCE(country_code, 'XX') as countryCode,
      COUNT(*) as count
     FROM visitor_sessions
     WHERE first_seen >= ?
     GROUP BY COALESCE(country, 'Unknown'), COALESCE(country_code, 'XX')
     ORDER BY count DESC
     LIMIT 50`,
    [startDate],
  );

  const total = rows.reduce((sum, row) => sum + row.count, 0);

  const stats: GeoStats[] = rows.map((row) => ({
    country: row.country,
    countryCode: row.countryCode,
    count: row.count,
    percentage: total > 0 ? Math.round((row.count / total) * 1000) / 10 : 0,
  }));

  await setCache(cacheKey, stats, ANALYTICS_CACHE_TTL);
  return stats;
}

/**
 * Get traffic over time (for charts)
 */
export async function getTrafficOverTime(
  days: number = 30,
  interval: 'hour' | 'day' = 'day',
): Promise<TrafficDataPoint[]> {
  const cacheKey = `${REDIS_KEY_PREFIX}traffic:${days}d:${interval}`;
  const cached = await getCache<TrafficDataPoint[]>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const groupBy =
    interval === 'hour' ? 'DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00")' : 'DATE(created_at)';

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      ${groupBy} as timestamp,
      COUNT(*) as views,
      COUNT(DISTINCT session_id) as visitors
     FROM page_views
     WHERE created_at >= ?
     GROUP BY ${groupBy}
     ORDER BY timestamp ASC`,
    [startDate],
  );

  const data: TrafficDataPoint[] = rows.map((row) => ({
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
    views: row.views,
    visitors: row.visitors,
  }));

  await setCache(cacheKey, data, ANALYTICS_CACHE_TTL);
  return data;
}

/**
 * Get real-time visitors (last 5 minutes)
 */
export async function getRealtimeVisitors(): Promise<RealtimeVisitor[]> {
  const fiveMinutesAgo = new Date();
  fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      pv.session_id as sessionId,
      pv.account_name as accountName,
      pv.path,
      pv.country,
      pv.city,
      pv.created_at as lastSeen
     FROM page_views pv
     INNER JOIN (
       SELECT session_id, MAX(created_at) as max_created
       FROM page_views
       WHERE created_at >= ?
       GROUP BY session_id
     ) latest ON pv.session_id = latest.session_id AND pv.created_at = latest.max_created
     ORDER BY pv.created_at DESC
     LIMIT 50`,
    [fiveMinutesAgo],
  );

  return rows.map((row) => ({
    sessionId: row.sessionId,
    accountName: row.accountName,
    path: row.path,
    country: row.country,
    city: row.city,
    lastSeen:
      row.lastSeen instanceof Date
        ? row.lastSeen.toISOString()
        : `${String(row.lastSeen).replace(' ', 'T')}Z`,
  }));
}

/**
 * Get active visitor count (last 5 minutes)
 */
export async function getActiveVisitorCount(): Promise<number> {
  const fiveMinutesAgo = new Date();
  fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(DISTINCT session_id) as count FROM page_views WHERE created_at >= ?',
    [fiveMinutesAgo],
  );

  return rows[0]?.count || 0;
}

export interface RecentVisitor {
  id: number;
  createdAt: string;
  path: string;
  browser: string;
  os: string;
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  accountName: string | null;
}

/**
 * Get recent visitors list with pagination
 */
export async function getRecentVisitors(
  days: number = 30,
  page: number = 1,
  limit: number = 50,
): Promise<{ data: RecentVisitor[]; total: number }> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const offset = (page - 1) * limit;

  const [[countResult], [rows]] = await Promise.all([
    pool.query<RowDataPacket[]>('SELECT COUNT(*) as total FROM page_views WHERE created_at >= ?', [
      startDate,
    ]),
    pool.query<RowDataPacket[]>(
      `SELECT
        id,
        created_at as createdAt,
        path,
        browser,
        os,
        ip_address as ipAddress,
        country,
        city,
        account_name as accountName
       FROM page_views
       WHERE created_at >= ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [startDate, limit, offset],
    ),
  ]);

  const total = countResult[0]?.total || 0;

  const data: RecentVisitor[] = rows.map((row) => ({
    id: row.id,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : `${String(row.createdAt).replace(' ', 'T')}Z`,
    path: row.path,
    browser: row.browser || 'unknown',
    os: row.os || 'unknown',
    ipAddress: row.ipAddress,
    country: row.country,
    city: row.city,
    accountName: row.accountName,
  }));

  return { data, total };
}

import { Request } from 'express';

/**
 * Extract client IP address from request
 * Handles proxy headers (X-Forwarded-For, X-Real-IP) and direct connections
 *
 * Priority order:
 * 1. X-Forwarded-For (first IP in chain)
 * 2. X-Real-IP
 * 3. req.socket.remoteAddress
 *
 * @param req - Express request object
 * @returns IP address string (IPv4 or IPv6) or null if unavailable
 */
export function extractClientIP(req: Request): string | null {
  // Check X-Forwarded-For header (added by proxies/load balancers)
  // Format: "client, proxy1, proxy2"
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;

    // Get first IP in chain (original client)
    const firstIP = ips.split(',')[0].trim();
    if (firstIP) {
      return cleanIPv6(firstIP);
    }
  }

  // Check X-Real-IP header (alternative proxy header)
  const realIP = req.headers['x-real-ip'];
  if (realIP && typeof realIP === 'string') {
    return cleanIPv6(realIP.trim());
  }

  // Fallback to socket remote address
  const socketIP = req.socket.remoteAddress;
  if (socketIP) {
    return cleanIPv6(socketIP);
  }

  return null;
}

/**
 * Clean IPv6 addresses
 * Removes IPv4-mapped IPv6 prefix (::ffff:192.168.1.1 -> 192.168.1.1)
 *
 * @param ip - Raw IP address
 * @returns Cleaned IP address
 */
function cleanIPv6(ip: string): string {
  // Remove IPv4-mapped IPv6 prefix
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip;
}

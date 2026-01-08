/**
 * Web Analytics Tracking Service
 * Tracks page views and sends them to the backend for analytics
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SESSION_KEY = 'analytics_session_id';

/**
 * Generate a random session ID
 */
function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create session ID from localStorage
 */
function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Parse UTM parameters from URL
 */
function getUTMParams(): {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
  };
}

/**
 * Get screen dimensions
 */
function getScreenDimensions(): { screenWidth: number; screenHeight: number } {
  return {
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
  };
}

/**
 * Track a page view
 */
export async function trackPageView(path: string, pageTitle?: string): Promise<void> {
  try {
    const sessionId = getSessionId();
    const utmParams = getUTMParams();
    const screenDimensions = getScreenDimensions();

    // Get referrer (only for first page in session)
    const referrer = document.referrer || undefined;

    // Calculate approximate load time
    let loadTimeMs: number | undefined;
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      if (timing.loadEventEnd > 0 && timing.navigationStart > 0) {
        loadTimeMs = timing.loadEventEnd - timing.navigationStart;
      }
    }

    const payload = {
      sessionId,
      path,
      pageTitle: pageTitle || document.title,
      referrer,
      ...utmParams,
      ...screenDimensions,
      loadTimeMs,
    };

    // Send tracking request (fire and forget)
    await fetch(`${API_URL}/api/analytics/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      credentials: 'include', // Include cookies for auth
    });
  } catch (error) {
    // Silently fail - analytics shouldn't break the app
    console.debug('Analytics tracking failed:', error);
  }
}

/**
 * Initialize analytics tracking for Vue Router
 * Call this in your main.ts or App.vue setup
 */
export function initAnalytics(router: any): void {
  // Track initial page load
  trackPageView(window.location.pathname, document.title);

  // Track route changes
  router.afterEach((to: any) => {
    // Small delay to ensure page title has updated
    setTimeout(() => {
      trackPageView(to.path, document.title);
    }, 100);
  });
}

/**
 * Reset session (useful for testing or on logout)
 */
export function resetAnalyticsSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

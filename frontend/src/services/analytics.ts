/** Remove the retired optional identifier; denied storage must not prevent startup. */
export function clearLegacyAnalyticsSession(): void {
  try {
    localStorage.removeItem('analytics_session_id')
  } catch {
    // Collection is disabled regardless of whether the browser permits cleanup.
  }
}
